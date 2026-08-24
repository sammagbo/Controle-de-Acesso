package com.magbo.access.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * O PARSER QUE SALVA O EVENTO QUANDO O APARELHO CORTA O CORPO.
 *
 * ⚠️ Cada teste aqui e uma forma de perder uma passagem. A cantina perdeu 95
 * num dia porque o corpo vinha cortado e o parser do container deitava fora a
 * part JSON que ja tinha chegado inteira.
 *
 * O payload de referencia e o dos aparelhos MinMoe: part `AccessControllerEvent`
 * (JSON) primeiro, `Picture` (jpeg) depois. O corte cai sempre na imagem — que
 * o sistema descarta de qualquer maneira — e nunca no JSON.
 */
@DisplayName("MultipartTolerante — ler o que chegou")
class MultipartToleranteTest {

    private static final String B = "MIME_boundary";
    private static final String JSON =
            "{\"ipAddress\":\"192.168.1.10\",\"AccessControllerEvent\":{\"subEventType\":75,"
          + "\"employeeNoString\":\"FUNC-001\"}}";

    /** Payload igual ao dos terminais: JSON, depois imagem. */
    private static byte[] corpoCompleto() {
        String s = "--" + B + "\r\n"
                 + "Content-Disposition: form-data; name=\"AccessControllerEvent\"\r\n"
                 + "Content-Type: application/json\r\n\r\n"
                 + JSON + "\r\n"
                 + "--" + B + "\r\n"
                 + "Content-Disposition: form-data; name=\"Picture\"; filename=\"face.jpg\"\r\n"
                 + "Content-Type: image/jpeg\r\n\r\n"
                 + "ÿØÿ-IMAGEM-FALSA\r\n"
                 + "--" + B + "--\r\n";
        return s.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("★★ corpo completo: as duas parts, com nome e tipo")
    void corpoInteiroDaAsDuasParts() {
        var c = MultipartTolerante.repartir(corpoCompleto(), B);
        assertThat(c.truncado()).isFalse();
        assertThat(c.partes()).hasSize(2);
        assertThat(c.partes().get(0).nome()).isEqualTo("AccessControllerEvent");
        assertThat(c.partes().get(0).contentType()).isEqualTo("application/json");
        assertThat(c.partes().get(0).texto()).isEqualTo(JSON);
        assertThat(c.partes().get(1).nome()).isEqualTo("Picture");
        assertThat(c.partes().get(1).contentType()).isEqualTo("image/jpeg");
    }

    @Test
    @DisplayName("★★★ corpo CORTADO a meio da imagem: o JSON sobrevive — os 95 eventos da cantina")
    void corteNaImagemSalvaOJson() {
        byte[] inteiro = corpoCompleto();
        // Corta 20 bytes antes do fim: a imagem fica a meio e nao ha terminador.
        byte[] cortado = new byte[inteiro.length - 20];
        System.arraycopy(inteiro, 0, cortado, 0, cortado.length);

        var c = MultipartTolerante.repartir(cortado, B);
        assertThat(c.truncado())
                .as("o corpo nao fechou, e isso tem de ser dito")
                .isTrue();
        assertThat(c.partes())
                .as("a part JSON chegou INTEIRA antes do corte e nao pode ser deitada fora")
                .hasSize(1);
        assertThat(c.partes().get(0).nome()).isEqualTo("AccessControllerEvent");
        assertThat(c.partes().get(0).texto()).isEqualTo(JSON);
    }

    @Test
    @DisplayName("★★★ corte a meio do JSON: a part NAO e aproveitada pela metade")
    void corteNoJsonNaoEntregaMetade() {
        String s = "--" + B + "\r\n"
                 + "Content-Disposition: form-data; name=\"AccessControllerEvent\"\r\n"
                 + "Content-Type: application/json\r\n\r\n"
                 + "{\"ipAddress\":\"192.168.1.10\",\"Access";   // cortado aqui
        var c = MultipartTolerante.repartir(s.getBytes(StandardCharsets.UTF_8), B);
        assertThat(c.truncado()).isTrue();
        assertThat(c.partes())
                .as("meio JSON entregue ao Jackson trocaria um evento perdido por um evento ERRADO")
                .isEmpty();
    }

    @Test
    @DisplayName("★★ sem o terminador final, mas com as parts fechadas: aproveita todas")
    void semTerminadorMasComPartsFechadas() {
        String s = "--" + B + "\r\n"
                 + "Content-Disposition: form-data; name=\"AccessControllerEvent\"\r\n"
                 + "Content-Type: application/json\r\n\r\n"
                 + JSON + "\r\n"
                 + "--" + B + "\r\n"
                 + "Content-Disposition: form-data; name=\"Picture\"\r\n"
                 + "Content-Type: image/jpeg\r\n\r\n"
                 + "XX";     // sem --boundary-- final
        var c = MultipartTolerante.repartir(s.getBytes(StandardCharsets.UTF_8), B);
        assertThat(c.truncado()).isTrue();
        assertThat(c.partes()).hasSize(1);
        assertThat(c.partes().get(0).texto()).isEqualTo(JSON);
    }

    @Test
    @DisplayName("★★ a part da CAMERA (alarmResult) e lida como as outras")
    void partDaCamera() {
        String s = "--" + B + "\r\n"
                 + "Content-Disposition: form-data; name=\"alarmResult\"\r\n"
                 + "Content-Type: application/json\r\n\r\n"
                 + "{\"alarmResult\":[]}\r\n"
                 + "--" + B + "--\r\n";
        var c = MultipartTolerante.repartir(s.getBytes(StandardCharsets.UTF_8), B);
        assertThat(c.partes()).hasSize(1);
        assertThat(c.partes().get(0).nome()).isEqualTo("alarmResult");
        assertThat(c.partes().get(0).texto()).isEqualTo("{\"alarmResult\":[]}");
    }

    @Test
    @DisplayName("★ boundary: com aspas, com parametro a seguir, ausente")
    void leituraDoBoundary() {
        assertThat(MultipartTolerante.boundaryDe("multipart/form-data; boundary=MIME_boundary"))
                .isEqualTo("MIME_boundary");
        assertThat(MultipartTolerante.boundaryDe("multipart/form-data; boundary=\"abc\"; charset=utf-8"))
                .isEqualTo("abc");
        assertThat(MultipartTolerante.boundaryDe("application/json")).isNull();
        assertThat(MultipartTolerante.boundaryDe(null)).isNull();
    }

    @Test
    @DisplayName("★★ o nome vem de name=\"x\" e tambem de name=x sem aspas")
    void nomeComOuSemAspas() {
        String s = "--" + B + "\r\n"
                 + "Content-Disposition: form-data; name=AccessControllerEvent\r\n"
                 + "Content-Type: application/json\r\n\r\n"
                 + JSON + "\r\n"
                 + "--" + B + "--\r\n";
        var c = MultipartTolerante.repartir(s.getBytes(StandardCharsets.UTF_8), B);
        assertThat(c.partes()).hasSize(1);
        assertThat(c.partes().get(0).nome()).isEqualTo("AccessControllerEvent");
    }

    @Test
    @DisplayName("★★★ ler ate onde der: o fluxo que rebenta a meio devolve o que chegou")
    void leituraTolerante() {
        // ⚠️ E este `catch` que salva a passagem. Um fluxo que lanca a meio e
        // exatamente o que o Tomcat ve quando o aparelho anuncia mais bytes do
        // que envia.
        byte[] inteiro = corpoCompleto();
        InputStream rebenta = new InputStream() {
            int i = 0;
            @Override public int read() throws IOException {
                if (i >= 80) throw new IOException("ligacao cortada pelo aparelho");
                return inteiro[i++] & 0xff;
            }
        };
        byte[] lido = MultipartTolerante.lerAteOndeDer(rebenta);
        assertThat(lido).hasSize(80);
    }

    @Test
    @DisplayName("★ corpo vazio ou sem boundary nao estoura")
    void casosVazios() {
        assertThat(MultipartTolerante.repartir(new byte[0], B).partes()).isEmpty();
        assertThat(MultipartTolerante.repartir(null, B).partes()).isEmpty();
        assertThat(MultipartTolerante.repartir(corpoCompleto(), null).partes()).isEmpty();
        assertThat(MultipartTolerante.lerAteOndeDer(new ByteArrayInputStream(new byte[0]))).isEmpty();
    }
}
