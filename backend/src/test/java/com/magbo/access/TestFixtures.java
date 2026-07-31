package com.magbo.access;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.DoorMapping;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.ExitPermissionStatus;
import com.magbo.access.models.ExitPermissionType;
import com.magbo.access.models.MealEntitlement;
import com.magbo.access.models.StudentExitPermission;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockPart;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Helpers da suite de testes da Fase I.
 *
 * Convencao de IP: os ITs usam IPs SINTETICOS 10.10.0.x, um por cenario.
 * Motivo: DoorMappingService.resolve cai em findIpOnlyMatch(terminalIp) para
 * eventos MinMoe (que nao trazem doorNo) e usa .get(0) da lista. Um IP por
 * cenario garante exatamente 1 linha, tornando o .get(0) deterministico, e
 * nunca colide com os mappings 192.168.1.166/167 do DoorMappingBootstrap.
 */
public final class TestFixtures {

    private TestFixtures() {
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static final String WEBHOOK_URL = "/api/hikvision/webhook";
    public static final String WEBHOOK_CAPTURE_URL = "/api/hikvision/webhook/capture";
    public static final String WEBHOOK_TOKEN = "test-token-fixo-para-integracao";
    public static final String TOKEN_HEADER = "X-MAGBO-WEBHOOK-TOKEN";

    /** URL da variante com o token como segmento de caminho (camera DeepinView). */
    public static String webhookPathTokenUrl(String token) {
        return WEBHOOK_URL + "/t/" + token;
    }

    /** IPs sinteticos — um mapping IP-only por cenario. */
    public static final String IP_CANTINA_ENTRADA = "10.10.0.1";
    public static final String IP_PORTAO_SAIDA = "10.10.0.2";
    public static final String IP_BIBLIO = "10.10.0.3";
    public static final String IP_CANTINA_SAIDA = "10.10.0.4";

    /** ID do aluno de teste. Convencao do projeto: id == hikvision_employee_id. */
    public static final String EMPLOYEE_PILOTO = "9999999";
    public static final String EMPLOYEE_ZERO_PADDED = "0001764";
    public static final String EMPLOYEE_INEXISTENTE = "8888888";

    // ────────────────────────── Entidades ──────────────────────────

    /**
     * Aluno ativo. id == hikvisionEmployeeId conforme o CLAUDE.md
     * ("hikvision_employee_id = mesmo id (unique)").
     */
    public static User aluno(String id, String turma) {
        return User.builder()
                .id(id)
                .nome("Aluno " + id)
                .tipo(UserType.ALUNO)
                .turma(turma)
                .ativo(true)
                .hikvisionEmployeeId(id)
                .build();
    }

    public static User alunoInativo(String id, String turma) {
        User u = aluno(id, turma);
        u.setAtivo(false);
        return u;
    }

    public static DoorMapping ipOnly(String terminalIp, String pointId, AccessAction action) {
        return DoorMapping.builder()
                .terminalIp(terminalIp)
                .pointId(pointId)
                .action(action)
                .label("Fixture " + pointId + " " + action)
                .ativo(true)
                .build();
    }

    public static MealEntitlement entitlement(String userId, EntitlementStatus status) {
        return entitlement(userId, status, null, null);
    }

    public static MealEntitlement entitlement(String userId, EntitlementStatus status,
                                              LocalDate validFrom, LocalDate validUntil) {
        return MealEntitlement.builder()
                .userId(userId)
                .status(status)
                .validFrom(validFrom)
                .validUntil(validUntil)
                .updatedBy("fixture")
                .build();
    }

    public static StudentExitPermission permission(String userId, ExitPermissionType type,
                                                   ExitPermissionStatus status) {
        return StudentExitPermission.builder()
                .userId(userId)
                .permissionType(type)
                .status(status)
                .reason("Fixture")
                .createdBy("fixture")
                .build();
    }

    public static StudentExitPermission permissionComJanela(String userId, ExitPermissionType type,
                                                            LocalTime start, LocalTime end) {
        StudentExitPermission p = permission(userId, type, ExitPermissionStatus.ACTIVE);
        p.setStartTime(start);
        p.setEndTime(end);
        return p;
    }

    // ────────────────────────── Payloads ──────────────────────────

    /**
     * Carrega um payload real capturado do hardware
     * (src/test/resources/payloads/). O dateTime vem em +08:00 — fuso de
     * fabrica do aparelho, que o backend ignora em favor da hora do servidor.
     */
    public static String payload(String fileName) {
        try {
            return new String(new ClassPathResource("payloads/" + fileName)
                    .getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Payload nao encontrado: " + fileName, e);
        }
    }

    /**
     * Linhas de um CSV de importacao Pronote (src/test/resources/pronote/).
     * Mesmo formato do export real: cabecalho + linhas separadas por ';'.
     */
    public static java.util.List<String> pronoteCsv(String fileName) {
        try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(
                new ClassPathResource("pronote/" + fileName).getInputStream(), StandardCharsets.UTF_8))) {
            return reader.lines().toList();
        } catch (IOException e) {
            throw new UncheckedIOException("CSV Pronote nao encontrado: " + fileName, e);
        }
    }

    /** Troca o employeeNoString do payload, preservando o resto do formato real. */
    public static String withEmployeeNo(String json, String employeeNo) {
        return patchEvent(json, node -> node.put("employeeNoString", employeeNo));
    }

    /** Troca o subEventType do payload, preservando o resto do formato real. */
    public static String withSubEventType(String json, int subEventType) {
        return patchEvent(json, node -> node.put("subEventType", subEventType));
    }

    /** Troca o serialNo do evento, preservando o resto do formato real. */
    public static String withSerialNo(String json, long serialNo) {
        return patchEvent(json, node -> node.put("serialNo", serialNo));
    }

    /**
     * Numerador do log de eventos, como num aparelho de verdade: cada evento
     * gerado sai com um serialNo NOVO.
     *
     * Existe porque os arquivos de payloads/ sao capturas de UM evento real e
     * portanto tem serialNo fixo (face-75 = 123). Reusar o mesmo arquivo para
     * simular duas passagens distintas produzia dois eventos com serial
     * identico — que e exatamente a assinatura de uma REENTREGA, e o dedup de
     * ingestao os engolia. O aparelho real nunca faz isso: incrementa o
     * numerador a cada evento e so repete o serial ao reenviar o mesmo pacote.
     *
     * Comeca alto (100_000) para nunca colidir com os seriais fixos das
     * capturas (123..200), que alguns testes fixam de proposito.
     */
    private static final AtomicLong SERIAL_SEQ = new AtomicLong(100_000);

    /** Proximo serialNo da sequencia — unico dentro da execucao da suite. */
    public static long nextSerialNo() {
        return SERIAL_SEQ.incrementAndGet();
    }

    /**
     * Carimba um serialNo novo no evento, se houver evento onde carimbar.
     *
     * TOLERANTE de proposito (ao contrario de withSerialNo): os construtores de
     * requisicao aplicam isto a QUALQUER corpo, inclusive os que nao tem
     * AccessControllerEvent (LocalUserChange) e os que nem sao JSON (o teste de
     * corpo invalido do WebhookJsonCameraIT). Nesses casos devolve o corpo
     * intacto — carimbar la mudaria o proprio objeto do teste.
     */
    public static String withFreshSerialNo(String json) {
        try {
            JsonNode parsed = MAPPER.readTree(json);
            if (!(parsed instanceof ObjectNode root)) {
                return json;
            }
            JsonNode alert = root.get("EventNotificationAlert");
            JsonNode container = (alert instanceof ObjectNode) ? alert : root;
            JsonNode event = container.get("AccessControllerEvent");
            if (!(event instanceof ObjectNode eventNode)) {
                return json;
            }
            eventNode.put("serialNo", nextSerialNo());
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            return json;
        }
    }

    /** Remove o serialNo do evento — aparelho hipotetico sem numerador. */
    public static String withoutSerialNo(String json) {
        return patchEvent(json, node -> node.remove("serialNo"));
    }

    /** Remove o ipAddress do ramo camera, para exercitar o fallback p/ remoteAddr. */
    public static String withoutIpAddress(String json) {
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            ObjectNode alert = (ObjectNode) root.get("EventNotificationAlert");
            if (alert != null) {
                alert.remove("ipAddress");
            } else {
                root.remove("ipAddress");
            }
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String patchEvent(String json, java.util.function.Consumer<ObjectNode> patch) {
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            ObjectNode event = locateEvent(root);
            patch.accept(event);
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** O AccessControllerEvent fica na raiz (MinMoe) ou dentro de EventNotificationAlert (camera). */
    private static ObjectNode locateEvent(ObjectNode root) {
        JsonNode alert = root.get("EventNotificationAlert");
        ObjectNode container = (alert != null) ? (ObjectNode) alert : root;
        return (ObjectNode) container.get("AccessControllerEvent");
    }

    // ────────────────────────── Requisicoes ──────────────────────────

    /**
     * Monta a requisicao multipart no formato REAL do terminal MinMoe:
     * part "AccessControllerEvent" (application/json) + part "Picture" (image/jpeg).
     *
     * SERIAL NOVO A CADA CHAMADA (withFreshSerialNo): duas chamadas com o mesmo
     * arquivo de payload representam dois eventos DISTINTOS — duas passagens da
     * pessoa —, nao a reentrega do mesmo pacote. Para reentrega de verdade
     * (serialNo repetido) use multipartWebhookSerialDoPayload.
     *
     * ATENCAO: usa MockPart, nao MockMultipartFile. O controller le
     * request.getParts() cru (servlet API), e MockMultipartFile popula apenas
     * o mapa de multipartFiles do Spring — getParts() viria VAZIO, o payload
     * seria nulo e o teste passaria por engano com 200 sem processar nada.
     */
    public static MockMultipartHttpServletRequestBuilder multipartWebhook(String json, String remoteAddr) {
        return multipartComFoto(withFreshSerialNo(json), remoteAddr);
    }

    private static MockMultipartHttpServletRequestBuilder multipartComFoto(String json, String remoteAddr) {
        MockPart eventPart = new MockPart("AccessControllerEvent", null, json.getBytes(StandardCharsets.UTF_8));
        eventPart.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        MockPart picturePart = new MockPart("Picture", "face.jpg", fakeJpeg());
        picturePart.getHeaders().setContentType(MediaType.IMAGE_JPEG);

        MockMultipartHttpServletRequestBuilder builder =
                MockMvcRequestBuilders.multipart(WEBHOOK_URL)
                        .part(eventPart)
                        .part(picturePart);
        builder.header(TOKEN_HEADER, WEBHOOK_TOKEN);
        builder.with(remoteAddr(remoteAddr));
        return builder;
    }

    /**
     * Part JSON com nome arbitrario — formato dos eventos de sync do proprio
     * aparelho (ex.: part "LocalUserChange", vista em producao em 29/07).
     */
    public static MockPart jsonPart(String name, String json) {
        MockPart part = new MockPart(name, null, json.getBytes(StandardCharsets.UTF_8));
        part.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        return part;
    }

    /** Multipart com parts arbitrarias (token + remoteAddr ja aplicados). */
    public static MockMultipartHttpServletRequestBuilder multipartWebhookParts(String remoteAddr, MockPart... parts) {
        MockMultipartHttpServletRequestBuilder builder = MockMvcRequestBuilders.multipart(WEBHOOK_URL);
        for (MockPart part : parts) {
            builder.part(part);
        }
        builder.header(TOKEN_HEADER, WEBHOOK_TOKEN);
        builder.with(remoteAddr(remoteAddr));
        return builder;
    }

    /**
     * Variante sem a part Picture (alguns eventos nao trazem imagem).
     * Tambem carimba serialNo novo — ver multipartWebhook.
     */
    public static MockMultipartHttpServletRequestBuilder multipartWebhookSemFoto(String json, String remoteAddr) {
        return multipartSemFoto(withFreshSerialNo(json), remoteAddr);
    }

    /**
     * Envia o corpo com o serialNo EXATAMENTE como esta no JSON, sem carimbar
     * um novo. E o construtor dos testes de dedup de INGESTAO, os unicos que
     * precisam controlar a identidade do pacote: repetir o serial e justamente
     * o que caracteriza a reentrega que o dedup tem que pegar.
     *
     * Em qualquer outro teste use multipartWebhookSemFoto — repetir o serial la
     * seria acidente, e o evento sumiria no dedup.
     */
    public static MockMultipartHttpServletRequestBuilder multipartWebhookSerialDoPayload(String json,
                                                                                         String remoteAddr) {
        return multipartSemFoto(json, remoteAddr);
    }

    private static MockMultipartHttpServletRequestBuilder multipartSemFoto(String json, String remoteAddr) {
        MockPart eventPart = new MockPart("AccessControllerEvent", null, json.getBytes(StandardCharsets.UTF_8));
        eventPart.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        MockMultipartHttpServletRequestBuilder builder =
                MockMvcRequestBuilders.multipart(WEBHOOK_URL).part(eventPart);
        builder.header(TOKEN_HEADER, WEBHOOK_TOKEN);
        builder.with(remoteAddr(remoteAddr));
        return builder;
    }

    /**
     * Camera DeepinView com o token no CAMINHO: JSON puro, sem header e sem
     * query string. Reproduz exatamente o que o aparelho consegue enviar — ele
     * descarta a query string e nao suporta header customizado (tcpdump 28/07).
     */
    public static MockHttpServletRequestBuilder jsonWebhookPathToken(String token, String json, String remoteAddr) {
        return MockMvcRequestBuilders.post(webhookPathTokenUrl(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(withFreshSerialNo(json))
                .with(remoteAddr(remoteAddr));
    }

    /** Ramo camera DeepinView: JSON puro, sem multipart. Serial novo a cada chamada. */
    public static MockHttpServletRequestBuilder jsonWebhook(String json, String remoteAddr) {
        return MockMvcRequestBuilders.post(WEBHOOK_URL)
                .header(TOKEN_HEADER, WEBHOOK_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(withFreshSerialNo(json))
                .with(remoteAddr(remoteAddr));
    }

    /**
     * Define o IP de origem da requisicao. E ELE que vira o terminalIp no ramo
     * multipart: o controller so le o ipAddress do payload quando o evento vem
     * como EventNotificationAlert (camera); para MinMoe cai em
     * request.getRemoteAddr() (HikvisionWebhookController:77-79).
     *
     * RequestPostProcessor vive em spring-test — nao exige spring-security-test.
     */
    public static RequestPostProcessor remoteAddr(String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }

    /** Bytes minimos com header JPEG — a imagem e ignorada pelo parse. */
    private static byte[] fakeJpeg() {
        return new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00, 0x10,
                'J', 'F', 'I', 'F', 0x00, (byte) 0xFF, (byte) 0xD9};
    }

    // ────────────────────────── Tempo ──────────────────────────

    /** Uma segunda-feira as 12h — dentro da janela Lycee (11h-15h). */
    public static LocalDateTime segundaAoMeioDia() {
        return LocalDateTime.of(LocalDate.of(2026, 7, 13), LocalTime.of(12, 0));
    }
}
