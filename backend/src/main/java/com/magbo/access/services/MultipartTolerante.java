package com.magbo.access.services;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * LEITURA DE MULTIPART QUE SOBREVIVE A UM CORPO CORTADO.
 *
 * ⚠️ POR QUE ISTO EXISTE — CANTINA, 24/08/2026, PRIMEIRO DIA EM PRODUCAO.
 *
 * Os dois terminais de ENTRADA da cantina (.10 e .12) perderam 95 eventos num
 * unico dia. Nenhum chegou a nenhum servico: morriam no parser do container.
 *
 *      terminal          papel     eventos lidos   EOFException
 *      192.168.1.10      ENTRADA         4              65
 *      192.168.1.12      ENTRADA         0              30
 *      192.168.1.13      SAIDA          14               0
 *      192.168.1.14      SAIDA          10               0
 *
 * A tela da cantina mostrava "Dentro: 0" com gente a almocar.
 *
 * ⚠️ A CAUSA, REPRODUZIDA ANTES DE ESCREVER UMA LINHA DE CORRECAO. Duas
 * malformacoes produzem sintomas DIFERENTES, e so uma corresponde a producao:
 *
 *   sem o terminador final (--boundary--)  -> MalformedStreamException -> HTTP 500
 *   corpo menor que o Content-Length       -> EOFException             -> HTTP 200
 *
 * Producao tem 95 do segundo e ZERO do primeiro. O aparelho anuncia N bytes e
 * envia menos (ou fecha a ligacao a meio da imagem do rosto, que e a ultima
 * part). O `request.getParts()` do Tomcat espera o resto, encontra o fim do
 * fluxo, e lanca — deitando fora TUDO, inclusive a part JSON que ja tinha
 * chegado INTEIRA. O evento estava ali e foi descartado com o resto.
 *
 * ⚠️ E POR ISSO A LEITURA TEM DE SER NOSSA. Depois de `getParts()` lancar, o
 * fluxo ja foi consumido: nao ha como voltar atras e aproveitar o que chegou.
 * A unica forma de salvar o evento e ler os bytes primeiro e interpretar
 * depois — que e o que esta classe faz.
 *
 * O QUE ELA NAO FAZ, de proposito: nao suporta multipart aninhado, nem
 * `Content-Transfer-Encoding`, nem continuacao de cabecalho em varias linhas.
 * Nada disso aparece no que os aparelhos Hikvision enviam, e cada recurso a
 * mais e mais superficie no caminho mais critico do sistema.
 */
public final class MultipartTolerante {

    private MultipartTolerante() {}

    /** Uma part: o nome, o tipo, e os bytes. */
    public record Parte(String nome, String contentType, byte[] conteudo) {
        public String texto() {
            return new String(conteudo, StandardCharsets.UTF_8);
        }
    }

    /** O que se conseguiu ler, e se o corpo veio cortado. */
    public record Corpo(List<Parte> partes, boolean truncado) {}

    /**
     * Le o fluxo ATE ONDE DER.
     *
     * ⚠️ O `catch (IOException)` e o ponto da classe, nao um descuido: quando o
     * aparelho anuncia mais bytes do que envia, e AQUI que a excecao aparece —
     * e o que ja chegou continua a valer. Devolver o buffer parcial e a
     * diferenca entre registar a passagem e perde-la.
     */
    public static byte[] lerAteOndeDer(InputStream in) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(16 * 1024);
        byte[] buf = new byte[8192];
        try {
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
        } catch (IOException corpoCortado) {
            // Fica o que chegou. Quem chama decide se da para usar.
        }
        return out.toByteArray();
    }

    /** O boundary declarado no Content-Type, ou null se nao houver. */
    public static String boundaryDe(String contentType) {
        if (contentType == null) return null;
        int i = contentType.toLowerCase().indexOf("boundary=");
        if (i < 0) return null;
        String b = contentType.substring(i + "boundary=".length()).trim();
        int ponto = b.indexOf(';');
        if (ponto >= 0) b = b.substring(0, ponto).trim();
        if (b.length() >= 2 && b.startsWith("\"") && b.endsWith("\"")) {
            b = b.substring(1, b.length() - 1);
        }
        return b.isEmpty() ? null : b;
    }

    /**
     * Reparte o corpo. Uma part sem delimitador de fecho esta INCOMPLETA e e
     * descartada — as anteriores, que fecharam, ficam.
     *
     * ⚠️ Descartar a ultima incompleta nao e detalhe: nos payloads destes
     * aparelhos o JSON do evento vem ANTES da imagem, entao o que se corta e a
     * imagem — que o sistema descarta de qualquer maneira. Aproveitar meia part
     * seria entregar JSON truncado ao Jackson e trocar um evento perdido por um
     * evento errado.
     */
    public static Corpo repartir(byte[] corpo, String boundary) {
        List<Parte> partes = new ArrayList<>();
        if (corpo == null || corpo.length == 0 || boundary == null) {
            return new Corpo(partes, false);
        }
        byte[] delim = ("--" + boundary).getBytes(StandardCharsets.UTF_8);

        List<Integer> marcas = new ArrayList<>();
        for (int i = 0; i + delim.length <= corpo.length; i++) {
            if (casa(corpo, i, delim) && (i == 0 || corpo[i - 1] == '\n')) marcas.add(i);
        }
        if (marcas.isEmpty()) return new Corpo(partes, true);

        boolean fechouOCorpo = false;
        for (int m = 0; m < marcas.size(); m++) {
            int inicio = marcas.get(m) + delim.length;
            // "--" logo apos o delimitador = fim do corpo.
            if (inicio + 1 < corpo.length && corpo[inicio] == '-' && corpo[inicio + 1] == '-') {
                fechouOCorpo = true;
                break;
            }
            if (m + 1 >= marcas.size()) {
                // Sem proximo delimitador: esta part nao fechou. Cortada.
                break;
            }
            int fim = marcas.get(m + 1);
            // O CRLF que antecede o proximo delimitador pertence ao protocolo.
            if (fim - 2 >= inicio && corpo[fim - 2] == '\r' && corpo[fim - 1] == '\n') fim -= 2;
            else if (fim - 1 >= inicio && corpo[fim - 1] == '\n') fim -= 1;

            Parte p = lerParte(corpo, inicio, fim);
            if (p != null) partes.add(p);
        }
        return new Corpo(partes, !fechouOCorpo);
    }

    /** Cabecalhos ate a linha em branco; o resto e conteudo. */
    private static Parte lerParte(byte[] corpo, int inicio, int fim) {
        int p = inicio;
        // Salta o CRLF que segue o delimitador.
        if (p + 1 < fim && corpo[p] == '\r' && corpo[p + 1] == '\n') p += 2;
        else if (p < fim && corpo[p] == '\n') p += 1;

        String nome = null;
        String tipo = null;
        while (p < fim) {
            int fimLinha = p;
            while (fimLinha < fim && corpo[fimLinha] != '\n') fimLinha++;
            int corte = (fimLinha > p && corpo[fimLinha - 1] == '\r') ? fimLinha - 1 : fimLinha;
            String linha = new String(corpo, p, corte - p, StandardCharsets.UTF_8);
            p = fimLinha + 1;
            if (linha.isEmpty()) break;               // linha em branco: acabaram os cabecalhos
            String baixa = linha.toLowerCase();
            if (baixa.startsWith("content-disposition:")) {
                nome = valorDe(linha, "name");
            } else if (baixa.startsWith("content-type:")) {
                tipo = linha.substring("content-type:".length()).trim();
            }
        }
        if (p > fim) return null;
        byte[] conteudo = new byte[Math.max(0, fim - p)];
        System.arraycopy(corpo, p, conteudo, 0, conteudo.length);
        return new Parte(nome, tipo, conteudo);
    }

    /** name="x" ou name=x, no Content-Disposition. */
    private static String valorDe(String linha, String chave) {
        int i = linha.toLowerCase().indexOf(chave.toLowerCase() + "=");
        if (i < 0) return null;
        String resto = linha.substring(i + chave.length() + 1).trim();
        if (resto.startsWith("\"")) {
            int f = resto.indexOf('"', 1);
            return f > 0 ? resto.substring(1, f) : null;
        }
        int f = resto.indexOf(';');
        return (f > 0 ? resto.substring(0, f) : resto).trim();
    }

    private static boolean casa(byte[] fonte, int pos, byte[] alvo) {
        for (int i = 0; i < alvo.length; i++) {
            if (fonte[pos + i] != alvo[i]) return false;
        }
        return true;
    }
}
