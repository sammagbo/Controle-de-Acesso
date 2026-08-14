package com.magbo.access.services;

import com.magbo.access.dto.RegimeImportRow;
import com.magbo.access.models.*;
import com.magbo.access.repositories.StudentRegimeRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * CARGA EM LOTE DOS REGIMES — e a razao de o modulo valer alguma coisa.
 *
 * O CPE disse a coisa que decide isto: sem os 923 regimes carregados, o portao
 * fica cinza e o AED continua decidindo de memoria, que e o problema que o
 * modulo existe para resolver. Um aluno por vez, com busca e formulario, sao 923
 * operacoes em setembro — na pratica, o modulo nunca sai do dia 1.
 *
 * ⚠️ O PRONOTE NAO TRAZ O REGIME. Verificado no codigo do import
 * (PronoteSyncService#processLine): o CSV tem oito colunas obrigatorias —
 * userId;nome;tipo;turma;responsavelId;responsavelNome;parentesco;telefone — e
 * quatro opcionais do segundo responsavel. Nao ha regime general nem regime de
 * sortie. O import de Excel de alunos (importColumns.ALUNOS) tambem nao tem. O
 * caminho barato foi procurado e nao existe.
 *
 * ⚠️ MESMA DISCIPLINA DO IMPORT DO HIKCENTRAL, e ela nao e cerimonia: aqui se
 * grava quem autorizou uma crianca a sair sozinha da escola.
 *   • SIMULA primeiro, linha a linha, e mostra o que aconteceria;
 *   • NADA e escrito antes da confirmacao explicita;
 *   • o apply REFAZ o plano contra o banco ATUAL — a planilha pode ter sido
 *     simulada dez minutos antes, e nesse meio-tempo alguem mexeu num regime.
 *
 * ⚠️ CONFLITO NAO E ERRO DE SISTEMA: e uma linha que este servico se RECUSA a
 * aplicar, com o motivo escrito. Aluno que nao existe, pessoa que nao e aluno,
 * enum invalido, data invertida, autorizador em branco. Nenhuma delas para a
 * importacao — as outras linhas seguem, e o operador ve exatamente quais
 * corrigir.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RegimeImportService {

    private final UserRepository userRepository;
    private final StudentRegimeRepository regimeRepository;
    private final RegimeSortieService regimeService;

    public enum Acao {
        /** Aluno sem regime vigente: sera criado. */
        CRIAR,
        /** Ja tem regime e a planilha pede outro: o atual sera encerrado. */
        ATUALIZAR,
        /** Ja tem exatamente isto: nada a fazer. */
        PULAR,
        /** Recusada, com motivo. Nao para as demais. */
        CONFLITO
    }

    /** Decisao de UMA linha, com tudo que o operador precisa ler na tela. */
    public record RowPlan(
            int linha,
            String matricula,
            String nome,
            String turma,
            /** O que esta no banco hoje, ou null. */
            String regimeAtual,
            /** O que a planilha pede. */
            String regimeNovo,
            Acao acao,
            /** Chave i18n OU texto do motivo — ver montarDetalhe. */
            String detalhe) {
    }

    public record ImportPlan(
            List<RowPlan> linhas,
            Map<String, Integer> totais,
            boolean aplicado) {
    }

    /** Simulacao: NAO escreve nada. */
    public ImportPlan plan(List<RegimeImportRow> linhas) {
        return montarPlano(linhas, false, null);
    }

    /** Aplica de verdade, REFAZENDO o plano contra o estado atual. */
    @Transactional
    public ImportPlan apply(List<RegimeImportRow> linhas, String quem) {
        ImportPlan r = montarPlano(linhas, true, quem);
        log.info("Importação de regimes aplicada por {}: {}", quem, r.totais());
        return r;
    }

    // ───────────────── Motor ─────────────────

    private ImportPlan montarPlano(List<RegimeImportRow> linhas, boolean gravar, String quem) {
        List<RowPlan> out = new ArrayList<>();
        Map<String, Integer> totais = new LinkedHashMap<>();
        for (Acao a : Acao.values()) totais.put(a.name(), 0);

        // ⚠️ Matricula repetida DENTRO do mesmo arquivo e conflito nas DUAS
        // linhas, e nenhuma e aplicada. Escolher uma seria o sistema decidindo
        // qual das duas autorizacoes da familia vale — mesma disciplina das
        // fotos, onde dois arquivos para a mesma pessoa invalidam os dois.
        Map<String, Integer> vezes = new HashMap<>();
        for (RegimeImportRow r : linhas) {
            String m = normalizar(r.getMatricula());
            if (!m.isEmpty()) vezes.merge(m, 1, Integer::sum);
        }

        for (RegimeImportRow r : linhas) {
            RowPlan p = avaliarLinha(r, vezes, gravar, quem);
            out.add(p);
            totais.merge(p.acao().name(), 1, Integer::sum);
        }
        totais.put("TOTAL", out.size());
        return new ImportPlan(out, totais, gravar);
    }

    private RowPlan avaliarLinha(RegimeImportRow r, Map<String, Integer> vezes,
                                 boolean gravar, String quem) {
        String matricula = normalizar(r.getMatricula());
        if (matricula.isEmpty()) {
            return conflito(r, null, "regime.import.sem.matricula");
        }
        if (vezes.getOrDefault(matricula, 0) > 1) {
            return conflito(r, null, "regime.import.duplicada");
        }

        User u = userRepository.findById(matricula).orElse(null);
        if (u == null) {
            return conflito(r, null, "regime.import.aluno.ausente");
        }
        if (u.getTipo() != UserType.ALUNO) {
            return conflito(r, u, "regime.import.nao.aluno");
        }

        RegimeGeneral geral = parseEnum(RegimeGeneral.class, r.getRegimeGeneral());
        if (geral == null) return conflito(r, u, "regime.import.geral.invalido");

        RegimeSortie sortie = parseEnum(RegimeSortie.class, r.getRegimeSortie());
        if (sortie == null) return conflito(r, u, "regime.import.sortie.invalido");

        LocalDate de;
        try {
            de = parseData(r.getValidFrom());
        } catch (DateTimeParseException e) {
            return conflito(r, u, "regime.import.data.invalida");
        }
        if (de == null) return conflito(r, u, "regime.import.sem.inicio");

        LocalDate ate;
        try {
            ate = parseData(r.getValidUntil());
        } catch (DateTimeParseException e) {
            return conflito(r, u, "regime.import.data.invalida");
        }
        if (ate != null && ate.isBefore(de)) {
            return conflito(r, u, "regime.import.datas.invertidas");
        }

        String autor = trim(r.getAuthorizedByFamily());
        if (autor.isEmpty()) {
            // ⚠️ Sem autor a linha nao e prova de nada — a mesma exigencia da
            // tela, e nao se afrouxa porque veio de planilha.
            return conflito(r, u, "regime.import.sem.autor");
        }

        // ⚠️ assinadoEm avaliado AQUI, no plano — nao dentro do if(gravar).
        // A primeira versao so o parseava no apply e engolia o erro com
        // assinado=null: o preview mostrava a linha verde e a data em que o
        // responsavel assinou o papel era descartada sem uma linha de log. A
        // data da assinatura e prova documental (V014), nao um enfeite.
        LocalDate assinado;
        try {
            assinado = parseData(r.getAssinadoEm());
        } catch (DateTimeParseException e) {
            return conflito(r, u, "regime.import.data.invalida");
        }

        // Limites físicos das colunas (StudentRegime): estourar aqui no flush
        // derrubaria o lote inteiro com rollback DEPOIS de um preview verde.
        if (autor.length() > 255
                || len(r.getDocumentoRef()) > 255
                || len(r.getNote()) > 500) {
            return conflito(r, u, "regime.import.texto.longo");
        }

        StudentRegime vigente = regimeRepository.findVigente(matricula, de).orElse(null);
        String atual = vigente == null ? null
                : vigente.getRegimeSortie() + " / " + vigente.getRegimeGeneral();
        String novo = sortie + " / " + geral;

        // Identico: nao se encerra um regime para abrir outro igual — isso
        // encheria o historico de linhas sem diferenca nenhuma.
        // ⚠️ Os campos de PROVA (documentoRef, assinadoEm, note) entram na
        // comparacao: o fluxo real da escola e carregar setembro sem os numeros
        // de carnet e reenviar a MESMA planilha em outubro com eles. Se o teste
        // de identidade os ignorasse, esse reenvio responderia 923x "identique"
        // e a referencia do papel assinado nunca seria gravada — sem nenhum
        // sinal de recusa (painel de revisao, arquiteto, 14/08/2026).
        // Planilha com o campo VAZIO onde o banco tem valor conta como
        // diferenca de proposito: vira ATUALIZAR e fica no historico, em vez de
        // apagar prova em silencio.
        if (vigente != null
                && vigente.getRegimeSortie() == sortie
                && vigente.getRegimeGeneral() == geral
                && Objects.equals(vigente.getAuthorizedByFamily(), autor)
                && Objects.equals(vigente.getValidUntil(), ate)
                && Objects.equals(vigente.getDocumentoRef(), trimOuNulo(r.getDocumentoRef()))
                && Objects.equals(vigente.getAssinadoEm(), assinado)
                && Objects.equals(vigente.getNote(), trimOuNulo(r.getNote()))) {
            return new RowPlan(r.getLinha(), matricula, u.getNome(), u.getTurma(),
                    atual, novo, Acao.PULAR, "regime.import.identico");
        }

        if (gravar) {
            regimeService.definir(matricula, geral, sortie, de, ate, autor,
                    trimOuNulo(r.getDocumentoRef()), assinado, trimOuNulo(r.getNote()),
                    quem, "BULK");
        }

        return new RowPlan(r.getLinha(), matricula, u.getNome(), u.getTurma(),
                atual, novo, vigente == null ? Acao.CRIAR : Acao.ATUALIZAR,
                vigente == null ? "regime.import.novo" : "regime.import.substitui");
    }

    private RowPlan conflito(RegimeImportRow r, User u, String motivo) {
        return new RowPlan(r.getLinha(), normalizar(r.getMatricula()),
                u == null ? null : u.getNome(), u == null ? null : u.getTurma(),
                null, null, Acao.CONFLITO, motivo);
    }

    /**
     * Matricula como TEXTO, com os zeros a esquerda intactos.
     *
     * ⚠️ Se o xlsx entregou 1764 onde a matricula e 0001764, nao se adivinha o
     * zero: adivinhar acertaria as vezes e, quando errasse, gravaria a
     * autorizacao de uma crianca no cadastro de outra. A linha vira CONFLITO por
     * aluno ausente, e o operador corrige a planilha formatando a coluna como
     * texto — que e o que a documentacao de colunas manda fazer.
     */
    private static String normalizar(String s) {
        return s == null ? "" : s.trim();
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String trimOuNulo(String s) {
        String t = trim(s);
        return t.isEmpty() ? null : t;
    }

    private static int len(String s) {
        return trim(s).length();
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> tipo, String valor) {
        String v = trim(valor).toUpperCase().replace('-', '_').replace(' ', '_');
        if (v.isEmpty()) return null;
        // Aceita "REGIME 1", "R1" e "1" alem do nome do enum: quem preenche a
        // planilha le "regime 1" no carnet, nao "REGIME_1".
        if (tipo == RegimeSortie.class) {
            if (v.equals("1") || v.equals("R1")) v = "REGIME_1";
            if (v.equals("2") || v.equals("R2")) v = "REGIME_2";
            if (v.equals("3") || v.equals("R3")) v = "REGIME_3";
        }
        if (tipo == RegimeGeneral.class) {
            if (v.equals("DP") || v.equals("DEMI_PENSIONNAIRE") || v.equals("DEMIPENSIONNAIRE")) {
                v = "DEMI_PENSIONNAIRE";
            }
        }
        try {
            return Enum.valueOf(tipo, v);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * Aceita ISO (2026-09-01) e o formato francês (01/09/2026).
     *
     * ⚠️ TUDO que der errado aqui sai como DateTimeParseException — e só. A
     * primeira versão deixava escapar DateTimeException (31/09/2026, 29/02/2027:
     * LocalDate.of valida o calendário e lança a MÃE, não a filha) e
     * NumberFormatException (01/set/2026). O catch de avaliarLinha não as
     * alcançava, a exceção subia até o controller, e UMA data digitada errada
     * derrubava a planilha das 923 linhas inteira com 500 — no apply E no
     * preview, sem dizer a linha. Exatamente o que o contrato da classe promete
     * que não acontece (painel de revisão, arquiteto, 14/08/2026).
     */
    private static LocalDate parseData(String s) {
        String v = trim(s);
        if (v.isEmpty()) return null;
        try {
            if (v.contains("/")) {
                String[] p = v.split("/");
                if (p.length != 3) throw new DateTimeParseException("formato", v, 0);
                return LocalDate.of(Integer.parseInt(p[2]), Integer.parseInt(p[1]), Integer.parseInt(p[0]));
            }
            return LocalDate.parse(v);
        } catch (DateTimeParseException e) {
            throw e;
        } catch (java.time.DateTimeException | NumberFormatException e) {
            throw new DateTimeParseException(e.getMessage(), v, 0);
        }
    }
}
