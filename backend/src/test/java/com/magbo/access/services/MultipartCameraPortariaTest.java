package com.magbo.access.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * O CORPO DAS CAMERAS DA PORTARIA ATRAVES DO PARSER TOLERANTE.
 *
 * ⚠️ POR QUE ESTE FICHEIRO EXISTE — o buraco de cobertura, dito por extenso.
 *
 * Em 24/08/2026 o webhook deixou de usar `request.getParts()` e passou a ler os
 * bytes com {@link MultipartTolerante}, para salvar as 95 entradas de cantina
 * que o parser do container deitava fora. A correcao foi provada contra o
 * payload dos MinMoe (`AccessControllerEvent` + `Picture`).
 *
 * ⚠️ MAS AS CAMERAS DA PORTARIA MANDAM OUTRA COISA: `faceCapture`,
 * `alarmResult`, `faceImage` e por vezes `MoveDetection.xml`. E os
 * `PortariaCameraIT` entram pelo ramo do MockMvc (o proprio controller
 * documenta: «esses testes exercitam ESTE ramo, nao o de cima»), portanto
 * NENHUM teste fazia passar um corpo de camera pelo parser que producao usa.
 *
 * Isto e o que a portaria arrisca: um `alarmResult` que o parser nao devolva e
 * uma passagem que ninguem regista — e o sintoma seria exatamente «poucos
 * passagens no portao».
 */
@DisplayName("Portaria — o corpo REAL das cameras atraves do MultipartTolerante")
class MultipartCameraPortariaTest {

    private static final String B = "MIME_boundary";

    private static final String ALARM_JSON =
            "{\"ipAddress\":\"192.168.1.167\",\"channelName\":\"ENTRADA-INTERNA-01\","
          + "\"dateTime\":\"2026-08-27T08:12:03-03:00\",\"eventType\":\"alarmResult\","
          + "\"alarmResult\":[{\"faces\":[{\"score\":{\"value\":52},"
          + "\"identify\":[{\"errorCode\":1,\"errorMsg\":\"ok\","
          + "\"candidate\":[{\"similarity\":0.95,\"FDLibName\":\"FUNCIONARIOS\","
          + "\"reserve_field\":{\"name\":\"Luis FIGUEIREDO\",\"certificateNumber\":\"0000000000001056\"}}]}]}]}]}";

    private static final String FACE_CAPTURE_JSON =
            "{\"faceCapture\":{\"faceScore\":65,\"pId\":\"1756282323123-abc\"}}";

    /** Um corpo de camera como o aparelho o monta: JSON, JSON, e a imagem. */
    private static byte[] corpoCamera(boolean comNome, boolean comImagem, boolean fecha) {
        StringBuilder sb = new StringBuilder();
        sb.append("--").append(B).append("\r\n")
          .append(comNome
                  ? "Content-Disposition: form-data; name=\"faceCapture\"\r\n"
                  : "Content-Disposition: form-data\r\n")
          .append("Content-Type: application/json\r\n\r\n")
          .append(FACE_CAPTURE_JSON).append("\r\n");
        sb.append("--").append(B).append("\r\n")
          .append(comNome
                  ? "Content-Disposition: form-data; name=\"alarmResult\"\r\n"
                  : "Content-Disposition: form-data\r\n")
          .append("Content-Type: application/json\r\n\r\n")
          .append(ALARM_JSON).append("\r\n");
        if (comImagem) {
            sb.append("--").append(B).append("\r\n")
              .append("Content-Disposition: form-data; name=\"faceImage\"; filename=\"face.jpg\"\r\n")
              .append("Content-Type: image/jpeg\r\n\r\n")
              .append("ÿØÿ-IMAGEM-FALSA").append("\r\n");
        }
        if (fecha) sb.append("--").append(B).append("--\r\n");
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static MultipartTolerante.Parte porNome(List<MultipartTolerante.Parte> ps, String nome) {
        return ps.stream().filter(p -> nome.equals(p.nome())).findFirst().orElse(null);
    }

    @Test
    @DisplayName("★★★ corpo de camera COMPLETO: alarmResult chega inteiro")
    void corpoCompleto() {
        var c = MultipartTolerante.repartir(corpoCamera(true, true, true), B);
        assertThat(c.truncado()).isFalse();
        assertThat(c.partes()).hasSize(3);
        assertThat(porNome(c.partes(), "alarmResult")).isNotNull();
        assertThat(porNome(c.partes(), "alarmResult").texto())
                .as("o alarmResult E o evento: perde-lo e perder a passagem")
                .isEqualTo(ALARM_JSON);
        assertThat(porNome(c.partes(), "faceCapture")).isNotNull();
    }

    @Test
    @DisplayName("★★★ corpo CORTADO na imagem do rosto: os dois JSON sobrevivem")
    void cortadoNaImagem() {
        // A imagem e a ULTIMA part e a que o aparelho corta — a mesma
        // assinatura da cantina (95 eventos perdidos num dia).
        byte[] inteiro = corpoCamera(true, true, true);
        byte[] cortado = new byte[inteiro.length - 25];
        System.arraycopy(inteiro, 0, cortado, 0, cortado.length);

        var c = MultipartTolerante.repartir(cortado, B);
        assertThat(c.truncado()).isTrue();
        assertThat(porNome(c.partes(), "alarmResult"))
                .as("a passagem da portaria nao pode morrer com a foto")
                .isNotNull();
        assertThat(porNome(c.partes(), "alarmResult").texto()).isEqualTo(ALARM_JSON);
    }

    @Test
    @DisplayName("★★★ SEM a imagem (a camera nem sempre a manda): nada muda")
    void semImagem() {
        var c = MultipartTolerante.repartir(corpoCamera(true, false, true), B);
        assertThat(porNome(c.partes(), "alarmResult")).isNotNull();
    }

    @Test
    @DisplayName("★★ sem terminador final: as parts fechadas ficam")
    void semTerminador() {
        var c = MultipartTolerante.repartir(corpoCamera(true, true, false), B);
        assertThat(c.truncado()).isTrue();
        assertThat(porNome(c.partes(), "alarmResult"))
                .as("faltar o --boundary-- final nao pode custar o evento")
                .isNotNull();
    }

    /**
     * ⚠️ O CASO QUE MAIS ME PREOCUPA, e por isso ele esta escrito mesmo sendo
     * hipotetico: alguns firmwares Hikvision mandam `Content-Disposition:
     * form-data` SEM `name=`. O parser devolve entao `nome == null`, e o
     * controller compara `PART_ALARM_RESULT.equalsIgnoreCase(null)` -> false:
     * o evento cairia no ramo generico e a passagem seria perdida EM SILENCIO.
     *
     * Este teste NAO afirma que a camera do Lycee faz isso — afirma o que o
     * parser devolve nesse caso, para que quem investigar a portaria saiba
     * exatamente o que procurar no log (`part=null`).
     */
    @Test
    @DisplayName("★★★ part SEM name= : o parser devolve nome null — a assinatura a procurar no log")
    void partSemNome() {
        var c = MultipartTolerante.repartir(corpoCamera(false, true, true), B);
        assertThat(c.partes()).isNotEmpty();
        assertThat(c.partes().get(0).nome())
                .as("sem name= no Content-Disposition, o nome e null; o controller "
                        + "nao reconheceria a part alarmResult e a passagem morreria calada")
                .isNull();
        // E o conteudo continua la — ou seja: se um dia for preciso, da para
        // reconhecer a part pelo CONTEUDO em vez do nome.
        assertThat(c.partes().stream().anyMatch(p -> p.texto().contains("\"eventType\":\"alarmResult\"")))
                .isTrue();
    }

    @Test
    @DisplayName("★★ boundary com aspas, como alguns firmwares o declaram")
    void boundaryComAspas() {
        assertThat(MultipartTolerante.boundaryDe(
                "multipart/form-data; boundary=\"MIME_boundary\"; charset=utf-8"))
                .isEqualTo("MIME_boundary");
    }
}
