package com.magbo.access.dto.hikvision;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * Evento "alarmResult" das cameras DeepinView da PORTARIA
 * (iDS-2CD7A46G2-IZHSY, firmware V5.9.10).
 *
 * Produto DIFERENTE dos MinMoe do CDI, e o payload nao se parece com o deles:
 * nao ha AccessControllerEvent, nao ha employeeNoString, nao ha subEventType.
 * A camera nao autentica ninguem — ela COMPARA um rosto contra uma biblioteca
 * facial e devolve o resultado da comparacao. A identidade tem de ser resolvida
 * pelo MAGBO (ver CameraIdentityService).
 *
 * A camera manda multipart/form-data com as parts:
 *   faceCapture  (json)  — viu um rosto, sem identidade. Nao vira acesso.
 *   alarmResult  (json)  — o resultado da comparacao. E este DTO.
 *   faceImage    (jpeg)  — ignorada, nunca armazenada.
 *   MoveDetection.xml    — quando a deteccao de movimento esta ligada.
 *
 * ⚠️ TOLERANCIA DELIBERADA. Este DTO foi escrito a partir da DESCRICAO do
 * payload, nao de uma captura em arquivo (ver o cabecalho de
 * CameraAlarmFixtureTest e o relatorio da entrega). Por isso:
 *   • todo objeto ignora campos desconhecidos;
 *   • toda navegacao passa pelos acessores abaixo, que nunca lancam NPE numa
 *     lista vazia ou num nivel ausente;
 *   • numeros sao Double/Integer e o Jackson coage string ("0.87") sem
 *     reclamar, porque a familia Hikvision alterna entre os dois entre
 *     firmwares.
 * Um campo que venha diferente do esperado degrada para "nao reconhecido" —
 * que vira tentativa negada com motivo — em vez de derrubar o webhook e por a
 * camera em loop de retry.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class CameraAlarmDto {

    /** IP do proprio aparelho, conforme ele se anuncia. */
    @JsonProperty("ipAddress")
    private String ipAddress;

    @JsonProperty("macAddress")
    private String macAddress;

    @JsonProperty("channelID")
    private Integer channelID;

    /** Nome do canal configurado no aparelho, ex. "ENTRADA-INTERNA-01". */
    @JsonProperty("channelName")
    private String channelName;

    /** Hora do EVENTO segundo a camera, ISO 8601 com offset. */
    @JsonProperty("dateTime")
    private String dateTime;

    /** "alarmResult" nos eventos de comparacao; "faceCapture" na deteccao. */
    @JsonProperty("eventType")
    private String eventType;

    @JsonProperty("eventState")
    private String eventState;

    @JsonProperty("alarmResult")
    private List<AlarmResult> alarmResult;

    // ───────────────── Acessores seguros ─────────────────
    // Toda a navegacao do payload passa por aqui. O caminho completo e
    // alarmResult[0].faces[0].identify[0].candidate[0], quatro niveis de lista
    // que podem estar vazios em qualquer combinacao — resolver isso no lugar de
    // uso significaria repetir a mesma cadeia de ifs em cada chamador.

    /** Primeiro resultado de comparacao, ou null. */
    public AlarmResult primeiroResultado() {
        return primeiro(alarmResult);
    }

    /** Primeiro rosto do primeiro resultado, ou null. */
    public Face primeiroRosto() {
        AlarmResult r = primeiroResultado();
        return r == null ? null : primeiro(r.getFaces());
    }

    /** Primeira comparacao do primeiro rosto, ou null. */
    public Identify primeiraIdentificacao() {
        Face f = primeiroRosto();
        return f == null ? null : primeiro(f.getIdentify());
    }

    /**
     * O candidato de MAIOR similaridade entre todos os oferecidos.
     *
     * Nao o primeiro: a camera pode devolver varios da mesma biblioteca, e
     * confiar na ordem seria apostar num detalhe do firmware que ninguem
     * documentou. `null` quando a comparacao falhou (nenhum candidato).
     */
    public Candidate melhorCandidato() {
        Identify id = primeiraIdentificacao();
        if (id == null || id.getCandidate() == null) return null;
        Candidate melhor = null;
        for (Candidate c : id.getCandidate()) {
            if (c == null) continue;
            if (melhor == null || maior(c.getSimilarity(), melhor.getSimilarity())) {
                melhor = c;
            }
        }
        return melhor;
    }

    /** errorMsg do primeiro resultado ("ok", "contrastFailed"...). */
    public String errorMsg() {
        AlarmResult r = primeiroResultado();
        return r == null ? null : r.getErrorMsg();
    }

    /**
     * Hora do evento preferindo o ENVELOPE e caindo para o faceTime do alvo.
     *
     * O envelope e o que o resto do sistema ja usa (EventTimeResolver le o
     * dateTime do envelope nos dois ramos). O faceTime existe como segunda
     * fonte porque e o instante em que o ROSTO foi visto — se um dia o
     * envelope vier vazio, ele ainda diz quando a pessoa passou.
     */
    public String horaDoEvento() {
        if (dateTime != null && !dateTime.isBlank()) return dateTime;
        AlarmResult r = primeiroResultado();
        if (r != null && r.getTargetAttrs() != null) {
            String ft = r.getTargetAttrs().getFaceTime();
            if (ft != null && !ft.isBlank()) return ft;
        }
        return null;
    }

    /**
     * Identificador do evento para o dedup de ingestao.
     *
     * A camera NAO manda serialNo — a chave numerica que identifica reentrega
     * nos MinMoe nao existe aqui. faceId identifica a deteccao especifica; pId
     * e a pessoa rastreada. Reentrega do mesmo pacote repete os dois; passagem
     * nova gera outros. Null quando nem um nem outro vem, e ai simplesmente
     * nao ha dedup de ingestao (nunca arriscar descartar evento legitimo).
     */
    public String chaveDeIngestao() {
        Face f = primeiroRosto();
        if (f != null && f.getFaceId() != null && !f.getFaceId().isBlank()) {
            return f.getFaceId();
        }
        AlarmResult r = primeiroResultado();
        if (r != null && r.getTargetAttrs() != null) {
            String pid = r.getTargetAttrs().getPId();
            if (pid != null && !pid.isBlank()) return pid;
        }
        return null;
    }

    /**
     * Rotulo nao-vazio para employeeNoRaw em access_attempts, que e NOT NULL.
     *
     * Uma passagem nao reconhecida nao tem matricula — mas a tentativa precisa
     * ficar registrada e atribuivel. Ordem: numero do documento (quando ha
     * candidato), depois o pId da pessoa rastreada, depois o faceId. O prefixo
     * "CAM:" evita que um pId de camera seja confundido com uma matricula
     * Pronote numa consulta futura.
     */
    public String identificadorBruto() {
        Candidate c = melhorCandidato();
        if (c != null && c.certificateNumber() != null) return c.certificateNumber();

        // pId ANTES de faceId, e a ordem e o que faz a regra de mesma passagem
        // funcionar para quem NAO foi reconhecido. pId identifica a PESSOA
        // rastreada e se mantem enquanto ela esta diante da camera; faceId
        // identifica cada DETECCAO e muda a cada evento. Com faceId aqui, um
        // desconhecido parado no portao geraria uma tentativa negada por
        // evento — a regra de 30s nunca casaria duas, porque a chave mudava
        // junto. Provado por PortariaCameraIT#tentativaNegadaColapsa.
        AlarmResult r = primeiroResultado();
        if (r != null && r.getTargetAttrs() != null) {
            String pid = r.getTargetAttrs().getPId();
            if (pid != null && !pid.isBlank()) return "CAM:" + pid;
        }
        Face f = primeiroRosto();
        if (f != null && f.getFaceId() != null && !f.getFaceId().isBlank()) {
            return "CAM:" + f.getFaceId();
        }
        return "CAM:desconhecido";
    }

    private static <T> T primeiro(List<T> lista) {
        return (lista == null || lista.isEmpty()) ? null : lista.get(0);
    }

    private static boolean maior(Double a, Double b) {
        if (a == null) return false;
        if (b == null) return true;
        return a > b;
    }

    // ───────────────── Estrutura ─────────────────

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class AlarmResult {
        @JsonProperty("errorCode")
        private Integer errorCode;

        /** "ok" no sucesso; "contrastFailed" quando nao houve casamento. */
        @JsonProperty("errorMsg")
        private String errorMsg;

        @JsonProperty("targetAttrs")
        private TargetAttrs targetAttrs;

        @JsonProperty("faces")
        private List<Face> faces;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TargetAttrs {
        @JsonProperty("deviceId")
        private String deviceId;

        @JsonProperty("deviceName")
        private String deviceName;

        /** Instante em que o rosto foi visto. */
        @JsonProperty("faceTime")
        private String faceTime;

        /** Identificador da pessoa RASTREADA (nao da pessoa cadastrada). */
        @JsonProperty("pId")
        private String pId;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Face {
        @JsonProperty("faceId")
        private String faceId;

        /** Qualidade da deteccao — nao e similaridade. Nao entra em decisao. */
        @JsonProperty("score")
        private Double score;

        /** Segundos parado diante da camera. */
        @JsonProperty("stayDuration")
        private Integer stayDuration;

        @JsonProperty("identify")
        private List<Identify> identify;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Identify {
        /**
         * SEMPRE VAZIO nos payloads observados — inclusive no sucesso. Nao
         * serve para identificar ninguem; esta aqui para nao ser confundido
         * com um identificador util por quem ler o JSON.
         */
        @JsonProperty("relationId")
        private String relationId;

        /** Melhor similaridade quando NAO houve casamento (0.13-0.21 observado). */
        @JsonProperty("maxsimilarity")
        private Double maxsimilarity;

        /** Presente apenas quando houve casamento. */
        @JsonProperty("candidate")
        private List<Candidate> candidate;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Candidate {
        @JsonProperty("blacklist_id")
        private Integer blacklistId;

        @JsonProperty("customFaceLibID")
        private String customFaceLibID;

        @JsonProperty("human_id")
        private Integer humanId;

        /** Similaridade da comparacao. Escala AMBIGUA — ver SimilarityGate. */
        @JsonProperty("similarity")
        private Double similarity;

        /**
         * "blackList" mesmo para pessoas autorizadas — e o nome interno do tipo
         * de biblioteca no firmware, nao um juizo sobre a pessoa.
         */
        @JsonProperty("listType")
        private String listType;

        /** Nome da biblioteca facial, ex. "FUNCIONARIOS". Entra no log. */
        @JsonProperty("FDLibName")
        private String fdLibName;

        /** Limiar configurado NA CAMERA para esta biblioteca (70 observado). */
        @JsonProperty("FDLibThreshold")
        private Double fdLibThreshold;

        @JsonProperty("human_data")
        private List<HumanData> humanData;

        @JsonProperty("reserve_field")
        private ReserveField reserveField;

        /** Nome da pessoa segundo a biblioteca da camera, ou null. */
        public String nome() {
            return reserveField == null ? null : trimToNull(reserveField.getName());
        }

        /**
         * Numero do documento cadastrado na camera. E o identificador
         * DETERMINISTICO da pessoa: uma vez guardado em app_users, nenhuma
         * passagem seguinte depende de casar nome.
         */
        public String certificateNumber() {
            return reserveField == null ? null : trimToNull(reserveField.getCertificateNumber());
        }
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class HumanData {
        @JsonProperty("face_id")
        private Integer faceId;

        @JsonProperty("contentID")
        private String contentID;

        @JsonProperty("pId")
        private String pId;

        @JsonProperty("similarity")
        private Double similarity;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ReserveField {
        @JsonProperty("name")
        private String name;

        @JsonProperty("gender")
        private String gender;

        @JsonProperty("bornTime")
        private String bornTime;

        @JsonProperty("certificateType")
        private String certificateType;

        @JsonProperty("certificateNumber")
        private String certificateNumber;
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
