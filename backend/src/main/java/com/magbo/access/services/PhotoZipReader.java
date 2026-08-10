package com.magbo.access.services;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Le um ZIP de fotos e devolve os arquivos, sem gravar nada em disco.
 *
 * Existe porque o operador tem ~1200 retratos numa pasta, e mandar 1200
 * requisicoes ou uma pasta inteira pelo formulario e pior que mandar um
 * arquivo so.
 *
 * ⚠️ POR QUE O CORPO CRU E NAO MULTIPART. Os limites de multipart deste
 * projeto (10MB por parte, 20MB por requisicao) foram medidos e escritos para
 * as CAMERAS da portaria: cada evento traz uma backgroundImage de ~460KB, e um
 * limite curto demais faz o Spring estourar antes do controller — a camera leva
 * 500, entra em loop de reenvio e a passagem se perde. Um ZIP de 1200 fotos
 * passa dos 20MB. Subir aquele limite para caber a importacao seria afrouxar,
 * por causa de uma tela de administracao, um numero que existe para proteger o
 * caminho mais critico do sistema. O corpo cru (application/zip) nao passa pelo
 * resolvedor de multipart e nao toca naquele limite.
 *
 * ── Guardas, e o que cada uma evita ─────────────────────────────────
 * • entradas de DIRETORIO sao ignoradas (a pasta zipada tras uma);
 * • nome com '..' ou caminho absoluto e DESCARTADO. Nada aqui escreve em disco,
 *   entao nao ha zip-slip para explorar — mas o dia em que alguem acrescentar
 *   uma escrita, a guarda ja esta aqui, e nao numa revisao que nao aconteceu;
 * • teto por entrada DESCOMPRIMIDA, verificado enquanto le, nao depois: um zip
 *   bomb de 40KB expande para gigabytes, e checar o tamanho no fim significa ja
 *   ter enchido a memoria;
 * • teto de numero de entradas e do total descomprimido do arquivo inteiro.
 */
@Service
@Slf4j
public class PhotoZipReader {

    /** Teto por entrada descomprimida. Mesma ordem de grandeza do limite de foto. */
    @Value("${magbo.photos.max-bytes:2097152}")
    private int maxBytesPorEntrada;

    /** Teto de entradas. Acima disto e engano, nao importacao. */
    @Value("${magbo.photos.zip.max-entradas:5000}")
    private int maxEntradas;

    /** Teto do total descomprimido — a guarda contra zip bomb. */
    @Value("${magbo.photos.zip.max-total-bytes:268435456}")
    private long maxTotalBytes;

    public static class ZipInvalidoException extends RuntimeException {
        public ZipInvalidoException(String message) {
            super(message);
        }
    }

    /**
     * Extrai os arquivos do ZIP.
     *
     * Nao filtra por extensao: quem decide se e imagem e o
     * {@link UserPhotoService}, olhando os BYTES. Um arquivo estranho no zip
     * tem que aparecer no relatorio como recusado, com o nome — sumir em
     * silencio na leitura seria esconder do operador que ele mandou lixo junto.
     */
    public List<UserPhotoService.ArquivoDeFoto> ler(InputStream corpo) {
        List<UserPhotoService.ArquivoDeFoto> arquivos = new ArrayList<>();
        long totalDescomprimido = 0;

        try (ZipInputStream zip = new ZipInputStream(corpo)) {
            ZipEntry entrada;
            while ((entrada = zip.getNextEntry()) != null) {
                if (entrada.isDirectory()) { zip.closeEntry(); continue; }

                String nome = entrada.getName();
                if (nome == null || nome.contains("..") || nome.startsWith("/") || nome.startsWith("\\")) {
                    log.warn("Entrada de ZIP com caminho suspeito descartada: {}", nome);
                    zip.closeEntry();
                    continue;
                }
                // Metadados do proprio zipador (macOS) — nao sao fotos, e
                // reporta-los como "sem correspondencia" so encheria a tela.
                if (nome.startsWith("__MACOSX/") || UserPhotoService.nomeSimples(nome).startsWith("._")) {
                    zip.closeEntry();
                    continue;
                }

                if (arquivos.size() >= maxEntradas) {
                    throw new ZipInvalidoException(
                            "O arquivo tem mais de " + maxEntradas + " entradas. Divida a importacao.");
                }

                byte[] bytes = lerEntrada(zip, nome);
                totalDescomprimido += bytes.length;
                if (totalDescomprimido > maxTotalBytes) {
                    throw new ZipInvalidoException(
                            "O conteudo descomprimido passa de " + maxTotalBytes + " bytes.");
                }

                arquivos.add(new UserPhotoService.ArquivoDeFoto(
                        UserPhotoService.nomeSimples(nome), null, bytes));
                zip.closeEntry();
            }
        } catch (ZipInvalidoException e) {
            throw e;
        } catch (IOException e) {
            // Sem detalhe tecnico do stream na mensagem: ela vai para a tela.
            throw new ZipInvalidoException("Nao foi possivel ler o arquivo ZIP. Ele esta completo?");
        }

        if (arquivos.isEmpty()) {
            throw new ZipInvalidoException("O ZIP nao tem nenhum arquivo.");
        }
        log.info("ZIP de fotos lido: {} arquivo(s), {} bytes descomprimidos",
                arquivos.size(), totalDescomprimido);
        return arquivos;
    }

    /**
     * Le UMA entrada com teto verificado a cada bloco.
     *
     * O teto na leitura, e nao depois: getSize() do ZipEntry vem do cabecalho,
     * que quem monta o arquivo escreve — confiar nele e confiar no atacante. E
     * conferir o tamanho so no fim significa ja ter alocado o que se queria
     * evitar.
     */
    private byte[] lerEntrada(ZipInputStream zip, String nome) throws IOException {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int lidos;
        while ((lidos = zip.read(buffer)) > 0) {
            if (saida.size() + lidos > maxBytesPorEntrada) {
                throw new ZipInvalidoException(
                        "\"" + UserPhotoService.nomeSimples(nome) + "\" passa do limite de "
                                + maxBytesPorEntrada + " bytes por imagem.");
            }
            saida.write(buffer, 0, lidos);
        }
        return saida.toByteArray();
    }
}
