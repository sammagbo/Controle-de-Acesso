package com.magbo.access.services;

import com.magbo.access.models.User;
import com.magbo.access.models.UserPhoto;
import com.magbo.access.repositories.UserPhotoRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Fotos de identificacao: importacao em lote e leitura.
 *
 * DUAS PASSADAS, como o import do HikCentral e pela mesma razao: {@link #plan}
 * nao escreve NADA e devolve o que aconteceria arquivo a arquivo; {@link #apply}
 * REFAZ o plano contra o estado atual do banco e executa. O plano nao e
 * carregado do preview — entre a conferencia e a confirmacao o cadastro pode
 * ter mudado, e aplicar um plano velho e escrever com base no que ja nao e
 * verdade.
 *
 * ── FOTOS DE MENORES: o que este servico promete ────────────────────
 * 1. NENHUM byte de imagem vai para log — nem em hexdump, nem em base64, nem
 *    "os primeiros N bytes para depurar". O log traz nome de arquivo, matricula
 *    e tamanho, e so.
 * 2. Nao ha caminho de EXPORTACAO. Nao existe endpoint que devolva o conjunto,
 *    nem ZIP de saida, nem CSV com as imagens. Sai uma foto por vez, por
 *    requisicao autenticada, para quem ja pode ver aquela pessoa.
 * 3. As imagens da CAMERA (faceImage / backgroundImage / faceLibImage) seguem
 *    descartadas como sempre foram. Este servico so recebe arquivo que um
 *    operador escolheu e enviou de proposito. Nada aqui liga o webhook a esta
 *    tabela — e nada deve ligar.
 * 4. Exclusao e DEFINITIVA (DELETE, sem soft delete): o direito de apagar a
 *    imagem de uma crianca nao se atende escondendo a linha.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserPhotoService {

    private final UserRepository userRepository;
    private final UserPhotoRepository photoRepository;

    /**
     * Teto por imagem. 2MB e generoso para um retrato de crachá (~20KB) e ainda
     * assim recusa o que so pode ser engano — a foto original de 8MP que alguem
     * arrastou direto da camera. Sem teto, 1200 arquivos desses seriam ~10GB no
     * banco, e o erro so apareceria no dia do backup.
     */
    @Value("${magbo.photos.max-bytes:2097152}")
    private int maxBytes;

    /** Teto de arquivos por lote — limita o custo de um envio unico. */
    @Value("${magbo.photos.max-arquivos-por-lote:2000}")
    private int maxArquivosPorLote;

    /** Um arquivo recebido, ja em memoria, sem nenhuma decisao tomada. */
    public record ArquivoDeFoto(String nomeArquivo, String contentType, byte[] bytes) {
    }

    /** O que o arquivo vai provocar. Mesmo vocabulario do import do HikCentral. */
    public enum Acao {
        /** Pessoa sem foto: sera criada. */
        CRIAR,
        /** Pessoa com foto diferente: sera substituida. */
        ATUALIZAR,
        /** Foto identica a que ja esta la (mesmo SHA-256): nada a fazer. */
        PULAR,
        /** O nome do arquivo nao casa com nenhum cadastro. */
        SEM_CORRESPONDENCIA,
        /** Casa com DUAS pessoas diferentes (matricula de uma, employeeNo de outra). */
        CONFLITO,
        /** Nao e imagem, esta vazio, ou passa do teto. */
        RECUSADO
    }

    /** Decisao de UM arquivo, com tudo que o operador precisa ler na tela. */
    public record RowPlan(
            int linha,
            String nomeArquivo,
            int bytes,
            Acao acao,
            /** Matricula da pessoa atingida; null quando nao casou. */
            String userId,
            /** Nome da pessoa atingida; null quando nao casou. */
            String nome,
            /** Como o arquivo casou: MATRICULA, HIKVISION ou null. */
            String casouPor,
            String detalhe) {
    }

    /** Resultado completo de um preview ou de uma aplicacao. */
    public record ImportPlan(
            List<RowPlan> linhas,
            Map<String, Integer> totais,
            /** Arquivos que nao acharam dono — destacados, um a um. */
            List<RowPlan> semCorrespondencia,
            /** true quando ja foi gravado no banco. */
            boolean aplicado) {
    }

    // ───────────────── API ─────────────────

    /** Simulacao: NAO escreve nada. */
    public ImportPlan plan(List<ArquivoDeFoto> arquivos) {
        return montarPlano(arquivos, null);
    }

    /**
     * Aplica de verdade. Refaz o plano contra o estado ATUAL — nunca confia no
     * plano que o operador viu na tela.
     *
     * @param operador quem confirmou; vai para updated_by de cada linha
     */
    @Transactional
    public ImportPlan apply(List<ArquivoDeFoto> arquivos, String operador) {
        ImportPlan resultado = montarPlano(arquivos, operador);
        // Totais, nunca conteudo.
        log.info("Importacao de fotos aplicada por {}: {}", operador, resultado.totais());
        return resultado;
    }

    /** Apaga a foto de uma pessoa. DELETE de verdade — ver o contrato acima. */
    @Transactional
    public boolean delete(String userId) {
        if (userId == null || !photoRepository.existsById(userId)) return false;
        photoRepository.deleteById(userId);
        log.info("Foto removida: user={}", userId);
        return true;
    }

    /** Quantas pessoas tem foto — alimenta o resumo da tela de importacao. */
    public long quantidade() {
        return photoRepository.count();
    }

    // ───────────────── Motor ─────────────────

    /**
     * @param operador null = SIMULACAO (nao grava nada). Preenchido = grava.
     *                 Um parametro so para os dois modos, de proposito: e a
     *                 unica forma de garantir que a simulacao e a aplicacao
     *                 percorrem exatamente as mesmas regras. Duas funcoes
     *                 paralelas divergiriam na primeira mudanca, e a tela
     *                 passaria a prometer uma coisa e fazer outra.
     */
    private ImportPlan montarPlano(List<ArquivoDeFoto> arquivos, String operador) {
        boolean gravar = operador != null;
        List<ArquivoDeFoto> entrada = arquivos == null ? List.of() : arquivos;
        List<RowPlan> planos = new ArrayList<>();

        if (entrada.size() > maxArquivosPorLote) {
            throw new IllegalArgumentException(
                    "Lote com " + entrada.size() + " arquivos passa do limite de "
                            + maxArquivosPorLote + ". Envie em partes.");
        }

        // Cadastro carregado UMA vez: 1200 arquivos x 2 consultas seria o dobro
        // de ida ao banco sem ganho nenhum.
        Map<String, User> porMatricula = new HashMap<>();
        Map<String, User> porHikvision = new HashMap<>();
        for (User u : userRepository.findAll()) {
            porMatricula.put(u.getId(), u);
            if (u.getHikvisionEmployeeId() != null && !u.getHikvisionEmployeeId().isBlank()) {
                porHikvision.put(u.getHikvisionEmployeeId(), u);
            }
        }

        // Primeira passada: decidir dono e validade de cada arquivo, sem tocar
        // no banco. Precisa terminar antes da segunda porque so no fim se sabe
        // QUAIS matriculas consultar metadado.
        List<Decisao> decisoes = new ArrayList<>();
        Set<String> alvos = new HashSet<>();
        for (int i = 0; i < entrada.size(); i++) {
            Decisao d = decidir(i + 1, entrada.get(i), porMatricula, porHikvision);
            decisoes.add(d);
            if (d.dono != null) alvos.add(d.dono.getId());
        }

        // Metadado das fotos existentes — SEM os bytes (ver o javadoc da
        // projecao). E o que permite dizer "identica, nada a fazer".
        Map<String, String> shaAtual = new HashMap<>();
        Map<String, Integer> tamanhoAtual = new HashMap<>();
        if (!alvos.isEmpty()) {
            for (var meta : photoRepository.findMetaByUserIdIn(alvos)) {
                shaAtual.put(meta.getUserId(), meta.getSha256());
                tamanhoAtual.put(meta.getUserId(), meta.getByteSize());
            }
        }

        // Dois arquivos para a MESMA pessoa dentro do lote: NENHUM e aplicado,
        // e os DOIS aparecem como CONFLITO com o nome um do outro.
        //
        // Aplicar o primeiro e recusar o segundo seria o sistema escolhendo,
        // pela ordem alfabetica de um diretorio, qual e o rosto daquela pessoa.
        // Numa portaria, o rosto errado no cadastro certo e uma saida liberada
        // no nome de outro.
        //
        // Por isso a contagem vem ANTES de qualquer gravacao: dentro do laco
        // que grava, o segundo arquivo chegaria com o primeiro ja no banco.
        Map<String, List<String>> arquivosPorPessoa = new LinkedHashMap<>();
        for (Decisao d : decisoes) {
            if (d.recusa == null && d.dono != null) {
                arquivosPorPessoa.computeIfAbsent(d.dono.getId(), k -> new ArrayList<>())
                        .add(d.nomeArquivo);
            }
        }

        LocalDateTime agora = LocalDateTime.now();

        for (Decisao d : decisoes) {
            if (d.recusa != null) {
                planos.add(new RowPlan(d.linha, d.nomeArquivo, d.tamanho, d.recusa,
                        d.dono == null ? null : d.dono.getId(),
                        d.dono == null ? null : d.dono.getNome(),
                        d.casouPor, d.detalhe));
                continue;
            }

            User dono = d.dono;
            List<String> concorrentes = arquivosPorPessoa.get(dono.getId());
            if (concorrentes.size() > 1) {
                planos.add(new RowPlan(d.linha, d.nomeArquivo, d.tamanho, Acao.CONFLITO,
                        dono.getId(), dono.getNome(), d.casouPor,
                        concorrentes.size() + " arquivos para " + dono.getNome()
                                + " neste lote (" + String.join(", ", concorrentes)
                                + "). NENHUM foi aplicado — deixe apenas um e reenvie."));
                continue;
            }

            String shaNovo = sha256(d.bytes);
            String shaVelho = shaAtual.get(dono.getId());

            if (shaNovo.equals(shaVelho)) {
                planos.add(new RowPlan(d.linha, d.nomeArquivo, d.tamanho, Acao.PULAR,
                        dono.getId(), dono.getNome(), d.casouPor,
                        "Foto identica a que ja esta cadastrada — nada a fazer."));
                continue;
            }

            Acao acao = shaVelho == null ? Acao.CRIAR : Acao.ATUALIZAR;
            String detalhe = acao == Acao.CRIAR
                    ? "Sera cadastrada."
                    : "Substitui a foto atual (" + tamanhoAtual.getOrDefault(dono.getId(), 0) + " bytes).";

            if (gravar) {
                photoRepository.save(UserPhoto.builder()
                        .userId(dono.getId())
                        .contentType(d.contentType)
                        .bytes(d.bytes)
                        .byteSize(d.tamanho)
                        .sha256(shaNovo)
                        .originalFilename(d.nomeArquivo)
                        .updatedBy(operador)
                        .updatedAt(agora)
                        .build());
            }

            planos.add(new RowPlan(d.linha, d.nomeArquivo, d.tamanho, acao,
                    dono.getId(), dono.getNome(), d.casouPor, detalhe));
        }

        Map<String, Integer> totais = new LinkedHashMap<>();
        for (Acao a : Acao.values()) totais.put(a.name(), 0);
        planos.forEach(p -> totais.merge(p.acao().name(), 1, Integer::sum));
        totais.put("TOTAL", planos.size());

        List<RowPlan> orfaos = planos.stream()
                .filter(p -> p.acao() == Acao.SEM_CORRESPONDENCIA)
                .toList();

        return new ImportPlan(planos, totais, orfaos, gravar);
    }

    /** Estado intermediario de um arquivo entre a decisao e a gravacao. */
    private static final class Decisao {
        int linha;
        String nomeArquivo;
        String contentType;
        byte[] bytes;
        int tamanho;
        User dono;
        String casouPor;
        /** Preenchido quando o arquivo NAO vai adiante. */
        Acao recusa;
        String detalhe;
    }

    private Decisao decidir(int linha, ArquivoDeFoto arquivo,
                            Map<String, User> porMatricula, Map<String, User> porHikvision) {
        Decisao d = new Decisao();
        d.linha = linha;
        d.nomeArquivo = arquivo == null ? "" : nomeSimples(arquivo.nomeArquivo());
        d.bytes = arquivo == null ? new byte[0] : arquivo.bytes();
        d.tamanho = d.bytes == null ? 0 : d.bytes.length;

        if (d.tamanho == 0) {
            d.recusa = Acao.RECUSADO;
            d.detalhe = "Arquivo vazio.";
            return d;
        }
        if (d.tamanho > maxBytes) {
            d.recusa = Acao.RECUSADO;
            d.detalhe = "Passa do limite de " + maxBytes + " bytes ("
                    + d.tamanho + "). Reduza a imagem antes de importar.";
            return d;
        }

        // Tipo pelo CONTEUDO, nao pela extensao nem pelo Content-Type: os dois
        // sao declarados por quem envia. Um .exe renomeado para .jpg passaria
        // pelos dois e viraria uma linha bytea que o navegador do kiosk seria
        // convidado a interpretar.
        String tipo = tipoPorConteudo(d.bytes);
        if (tipo == null) {
            d.recusa = Acao.RECUSADO;
            d.detalhe = "Nao e uma imagem JPEG, PNG ou WebP.";
            return d;
        }
        d.contentType = tipo;

        String chave = semExtensao(d.nomeArquivo);
        if (chave.isEmpty()) {
            d.recusa = Acao.SEM_CORRESPONDENCIA;
            d.detalhe = "Nome de arquivo vazio.";
            return d;
        }

        // ⚠️ COMO TEXTO, sempre. A matricula do Pronote tem zeros a esquerda
        // (0004048) e o employeeNo do HikCentral tem 10 digitos. Converter para
        // numero em qualquer ponto come o zero e o arquivo deixa de casar — e
        // a mesma armadilha do xlsx nos direitos de refeicao.
        User porMat = porMatricula.get(chave);
        User porHik = porHikvision.get(chave);

        if (porMat != null && porHik != null && !porMat.getId().equals(porHik.getId())) {
            d.recusa = Acao.CONFLITO;
            d.dono = null;
            d.detalhe = "\"" + chave + "\" e a matricula de " + porMat.getNome()
                    + " e o identificador Hikvision de " + porHik.getNome()
                    + ". Renomeie o arquivo para deixar claro de quem e a foto.";
            return d;
        }

        if (porMat != null) {
            d.dono = porMat;
            d.casouPor = "MATRICULA";
            return d;
        }
        if (porHik != null) {
            d.dono = porHik;
            d.casouPor = "HIKVISION";
            return d;
        }

        d.recusa = Acao.SEM_CORRESPONDENCIA;
        d.detalhe = "Nenhum cadastro com matricula ou identificador Hikvision \"" + chave + "\".";
        return d;
    }

    // ───────────────── Auxiliares ─────────────────

    /**
     * So o nome do arquivo, sem diretorio.
     *
     * Trata as duas barras porque as duas chegam: o ZIP guarda '/' e o
     * navegador em Windows entrega o caminho relativo da pasta com '\'.
     */
    public static String nomeSimples(String caminho) {
        if (caminho == null) return "";
        String s = caminho.trim();
        int corte = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
        return corte >= 0 ? s.substring(corte + 1) : s;
    }

    /** Nome sem a extensao — e ele que tem que ser a matricula ou o employeeNo. */
    static String semExtensao(String nomeArquivo) {
        if (nomeArquivo == null) return "";
        String s = nomeArquivo.trim();
        int ponto = s.lastIndexOf('.');
        return (ponto > 0 ? s.substring(0, ponto) : s).trim();
    }

    /**
     * Tipo da imagem pelos bytes iniciais, ou null se nao for imagem conhecida.
     *
     * JPEG: FF D8 FF · PNG: 89 50 4E 47 0D 0A 1A 0A · WebP: "RIFF"…"WEBP".
     */
    static String tipoPorConteudo(byte[] b) {
        if (b == null) return null;
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && (b[4] & 0xFF) == 0x0D && (b[5] & 0xFF) == 0x0A
                && (b[6] & 0xFF) == 0x1A && (b[7] & 0xFF) == 0x0A) {
            return "image/png";
        }
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        return null;
    }

    /** SHA-256 em hexadecimal minusculo. */
    static String sha256(byte[] bytes) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte x : hash) sb.append(Character.forDigit((x >> 4) & 0xF, 16))
                                  .append(Character.forDigit(x & 0xF, 16));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 e obrigatorio em toda JVM; se faltar, o ambiente esta
            // quebrado de um jeito que nao se contorna aqui.
            throw new IllegalStateException("SHA-256 indisponivel nesta JVM", e);
        }
    }
}
