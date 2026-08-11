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
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
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
                .authorizedByFamily("Fixture")
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
     * fabrica do aparelho. O backend converte esse INSTANTE para
     * America/Sao_Paulo e o grava como timestamp (ver EventTimeResolver), entao
     * a hora da captura importa: os construtores de requisicao a substituem
     * pela hora corrente, exceto nas variantes ...Verbatim.
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

    /**
     * Troca o dateTime do ENVELOPE — a hora do evento segundo o aparelho.
     *
     * Fica na raiz (MinMoe) ou dentro do EventNotificationAlert (camera), nunca
     * dentro do AccessControllerEvent: por isso nao usa patchEvent.
     */
    public static String withDateTime(String json, String dateTime) {
        return patchEnvelope(json, node -> node.put("dateTime", dateTime));
    }

    /** Remove o dateTime do envelope — aparelho que nao informa a hora do evento. */
    public static String withoutDateTime(String json) {
        return patchEnvelope(json, node -> node.remove("dateTime"));
    }

    /**
     * Carimba no envelope o instante ATUAL expresso no fuso do aparelho
     * (+08:00, fuso de fabrica dos MinMoe da escola).
     *
     * Mesma razao de existir do withFreshSerialNo: os arquivos de payloads/ sao
     * capturas de UM evento real e trazem a hora daquele dia (14/07/2026). Desde
     * que o backend passou a gravar a hora do EVENTO, reusar a captura verbatim
     * significaria "um evento de julho" — e todo teste com semantica de hoje
     * (countPresentToday, totalToday) passaria a contar zero. Pior: o payload
     * envelheceria sozinho e um dia cruzaria a guarda de 30 dias, quebrando a
     * suite por passagem do tempo. Um aparelho de verdade manda a hora corrente.
     *
     * TOLERANTE como o withFreshSerialNo: corpo que nao e objeto JSON volta
     * intacto (o teste de corpo invalido depende disso).
     */
    public static String withFreshDateTime(String json) {
        try {
            JsonNode parsed = MAPPER.readTree(json);
            if (!(parsed instanceof ObjectNode root)) {
                return json;
            }
            JsonNode alert = root.get("EventNotificationAlert");
            ObjectNode envelope = (alert instanceof ObjectNode alertNode) ? alertNode : root;
            envelope.put("dateTime", agoraNoFusoDoAparelho());
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            return json;
        }
    }

    /** Instante atual em +08:00, formatado como o aparelho formata. */
    public static String agoraNoFusoDoAparelho() {
        return noFusoDoAparelho(LocalDateTime.now());
    }

    /**
     * O MESMO instante que `local` (hora local do servidor), reescrito no fuso
     * de fabrica do aparelho. E assim que o payload real chega: hora deslocada,
     * offset explicito — o backend tem que reconstruir o instante, nao ler os
     * digitos.
     */
    public static String noFusoDoAparelho(LocalDateTime local) {
        return local.atZone(ZoneId.systemDefault())
                .withZoneSameInstant(FUSO_DO_APARELHO)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    /** Fuso de fabrica dos terminais da escola (CLAUDE.md, gotcha do GMT+8). */
    public static final ZoneOffset FUSO_DO_APARELHO = ZoneOffset.ofHours(8);

    /**
     * Carimba a hora do evento `segundosAtras` no passado — uma passagem
     * SEPARADA, nao uma leitura repetida.
     *
     * Existe por causa da regra de MESMA PASSAGEM (30s): dois eventos do mesmo
     * usuario, ponto e acao a segundos de distancia sao UMA passagem fisica, e
     * o segundo e descartado de proposito. Teste que precisa de duas passagens
     * de verdade tem que afasta-las no tempo — como acontece na vida real, onde
     * ninguem entra duas vezes no mesmo minuto.
     *
     * NAO mexe no serialNo: quem controla a identidade do pacote (os testes de
     * dedup de ingestao) continua no comando dela.
     */
    public static String passagemSeparada(String json, long segundosAtras) {
        return withDateTime(json, noFusoDoAparelho(LocalDateTime.now().minusSeconds(segundosAtras)));
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

    /** Igual ao patchEvent, mas no ENVELOPE (onde vive o dateTime). */
    private static String patchEnvelope(String json, java.util.function.Consumer<ObjectNode> patch) {
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            JsonNode alert = root.get("EventNotificationAlert");
            patch.accept((alert != null) ? (ObjectNode) alert : root);
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
     * HORA DO EVENTO NOVA A CADA CHAMADA (withFreshDateTime), pela mesma razao
     * do serial: o backend grava a hora do EVENTO, e a captura traz a hora do
     * dia em que foi capturada. Testes que precisam controlar a hora do evento
     * usam multipartWebhookVerbatim.
     *
     * ATENCAO: usa MockPart, nao MockMultipartFile. O controller le
     * request.getParts() cru (servlet API), e MockMultipartFile popula apenas
     * o mapa de multipartFiles do Spring — getParts() viria VAZIO, o payload
     * seria nulo e o teste passaria por engano com 200 sem processar nada.
     */
    public static MockMultipartHttpServletRequestBuilder multipartWebhook(String json, String remoteAddr) {
        return multipartComFoto(withFreshDateTime(withFreshSerialNo(json)), remoteAddr);
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
     * Tambem carimba serialNo e dateTime novos — ver multipartWebhook.
     */
    public static MockMultipartHttpServletRequestBuilder multipartWebhookSemFoto(String json, String remoteAddr) {
        return multipartSemFoto(withFreshDateTime(withFreshSerialNo(json)), remoteAddr);
    }

    /**
     * Como multipartWebhookSemFoto, mas a passagem aconteceu `segundosAtras`
     * atras — evento novo E separado no tempo.
     *
     * Use quando o teste precisa de DUAS passagens do mesmo usuario no mesmo
     * ponto e acao: a regra de mesma passagem (30s) descarta a segunda se as
     * duas cairem no mesmo instante. Ver TestFixtures#passagemSeparada.
     */
    public static MockMultipartHttpServletRequestBuilder multipartWebhookHaSegundos(
            String json, String remoteAddr, long segundosAtras) {
        return multipartSemFoto(passagemSeparada(withFreshSerialNo(json), segundosAtras), remoteAddr);
    }

    /**
     * Envia o corpo EXATAMENTE como esta no JSON — nem serialNo nem dateTime
     * sao carimbados. E o construtor de quem precisa controlar a identidade do
     * pacote ou a hora do evento; em qualquer outro teste use
     * multipartWebhookSemFoto, onde repetir o serial seria acidente (o evento
     * sumiria no dedup) e a hora seria a do dia da captura.
     */
    public static MockMultipartHttpServletRequestBuilder multipartWebhookVerbatim(String json,
                                                                                  String remoteAddr) {
        return multipartSemFoto(json, remoteAddr);
    }

    /**
     * Nome historico do multipartWebhookVerbatim, usado pelos testes de dedup de
     * INGESTAO: repetir o serial e justamente o que caracteriza a reentrega que
     * o dedup tem que pegar.
     */
    public static MockMultipartHttpServletRequestBuilder multipartWebhookSerialDoPayload(String json,
                                                                                         String remoteAddr) {
        return multipartWebhookVerbatim(json, remoteAddr);
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
                .content(withFreshDateTime(withFreshSerialNo(json)))
                .with(remoteAddr(remoteAddr));
    }

    /** Ramo camera DeepinView: JSON puro, sem multipart. Serial e hora novos a cada chamada. */
    public static MockHttpServletRequestBuilder jsonWebhook(String json, String remoteAddr) {
        return jsonWebhookVerbatim(withFreshDateTime(withFreshSerialNo(json)), remoteAddr);
    }

    /** Ramo camera com o corpo intacto — ver multipartWebhookVerbatim. */
    public static MockHttpServletRequestBuilder jsonWebhookVerbatim(String json, String remoteAddr) {
        return MockMvcRequestBuilders.post(WEBHOOK_URL)
                .header(TOKEN_HEADER, WEBHOOK_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json)
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

    // ────────────────────── Cameras da portaria ──────────────────────

    /** IPs sinteticos das cameras — um por sentido, como os mappings reais. */
    public static final String IP_CAMERA_ENTRADA = "10.10.0.5";
    public static final String IP_CAMERA_SAIDA = "10.10.0.6";

    /**
     * Reescreve o ipAddress do envelope da camera.
     *
     * O controller prefere o IP que o APARELHO anuncia ao IP de origem da
     * requisicao, e e ele que resolve o ponto e o sentido. Os fixtures trazem
     * 192.168.1.167 (o IP real da escola); os ITs precisam apontar para o IP
     * sintetico que o proprio teste mapeou, senao caem no fallback legado e
     * testariam outra coisa.
     */
    public static String comIpDeCamera(String json, String ip) {
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            root.put("ipAddress", ip);
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Carimba a hora do evento da camera `segundosAtras` no passado.
     *
     * Mesma razao do withFreshDateTime dos MinMoe: o fixture e uma captura com
     * a data do dia em que foi feita, e a guarda de 30 dias do
     * EventTimeResolver acabaria por rejeita-la sozinha com o passar do tempo.
     */
    public static String cameraHaSegundos(String json, long segundosAtras) {
        String iso = LocalDateTime.now().minusSeconds(segundosAtras)
                .atZone(ZoneId.systemDefault())
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            root.put("dateTime", iso);
            JsonNode ar = root.get("alarmResult");
            if (ar != null && ar.isArray() && ar.size() > 0 && ar.get(0).isObject()) {
                JsonNode alvo = ar.get(0).get("targetAttrs");
                if (alvo instanceof ObjectNode alvoNode) alvoNode.put("faceTime", iso);
            }
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Troca o faceId — a chave do dedup de INGESTAO das cameras.
     *
     * Duas passagens de verdade tem faceId diferente; uma reentrega do mesmo
     * pacote repete o mesmo. Teste que quer duas leituras REAIS (para exercitar
     * a regra de mesma passagem, que e outra camada) precisa troca-lo, senao o
     * dedup de ingestao engole a segunda antes.
     */
    public static String comFaceId(String json, String faceId) {
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            JsonNode ar = root.get("alarmResult");
            if (ar != null && ar.isArray() && ar.size() > 0) {
                JsonNode faces = ar.get(0).get("faces");
                if (faces != null && faces.isArray() && faces.size() > 0
                        && faces.get(0) instanceof ObjectNode face) {
                    face.put("faceId", faceId);
                }
            }
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Troca o dateTime do envelope da camera.
     *
     * Por patch de JSON e nao por replace de texto: o corpo passa pelo Jackson
     * nos helpers acima, que reserializa sem a formatacao do arquivo — um
     * replace casando o texto original vira no-op SILENCIOSO, e o teste passa a
     * exercitar outra coisa sem avisar.
     */
    public static String comDateTimeDeCamera(String json, String valor) {
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            if (valor == null) root.remove("dateTime");
            else root.put("dateTime", valor);
            // faceTime tambem, senao ele vira a segunda fonte e mascara o teste.
            JsonNode ar = root.get("alarmResult");
            if (ar != null && ar.isArray() && ar.size() > 0 && ar.get(0).isObject()) {
                JsonNode alvo = ar.get(0).get("targetAttrs");
                if (alvo instanceof ObjectNode alvoNode) {
                    if (valor == null) alvoNode.remove("faceTime");
                    else alvoNode.put("faceTime", valor);
                }
            }
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Troca o pId — o identificador da PESSOA rastreada (estavel entre deteccoes). */
    public static String comPId(String json, String pId) {
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            JsonNode ar = root.get("alarmResult");
            if (ar != null && ar.isArray() && ar.size() > 0 && ar.get(0).isObject()) {
                JsonNode alvo = ar.get(0).get("targetAttrs");
                if (alvo instanceof ObjectNode alvoNode) alvoNode.put("pId", pId);
            }
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Troca o certificateNumber do primeiro candidato. */
    public static String comCertificateNumber(String json, String numero) {
        return patchReserveField(json, node -> node.put("certificateNumber", numero));
    }

    /** Troca o nome do primeiro candidato (reserve_field.name). */
    public static String comNomeDeCamera(String json, String nome) {
        return patchReserveField(json, node -> node.put("name", nome));
    }

    /** Troca a similaridade do primeiro candidato. */
    public static String comSimilaridade(String json, double similaridade) {
        return patchCandidate(json, node -> node.put("similarity", similaridade));
    }

    /** Troca o limiar da biblioteca (FDLibThreshold) do primeiro candidato. */
    public static String comLimiarDaBiblioteca(String json, double limiar) {
        return patchCandidate(json, node -> node.put("FDLibThreshold", limiar));
    }

    private static String patchReserveField(String json, java.util.function.Consumer<ObjectNode> patch) {
        return patchCandidate(json, cand -> {
            JsonNode rf = cand.get("reserve_field");
            if (rf instanceof ObjectNode rfNode) patch.accept(rfNode);
        });
    }

    private static String patchCandidate(String json, java.util.function.Consumer<ObjectNode> patch) {
        try {
            ObjectNode root = (ObjectNode) MAPPER.readTree(json);
            JsonNode ar = root.get("alarmResult");
            if (ar != null && ar.isArray() && ar.size() > 0) {
                JsonNode faces = ar.get(0).get("faces");
                if (faces != null && faces.isArray() && faces.size() > 0) {
                    JsonNode identify = faces.get(0).get("identify");
                    if (identify != null && identify.isArray() && identify.size() > 0) {
                        JsonNode candidates = identify.get(0).get("candidate");
                        if (candidates != null && candidates.isArray() && candidates.size() > 0
                                && candidates.get(0) instanceof ObjectNode cand) {
                            patch.accept(cand);
                        }
                    }
                }
            }
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Multipart no formato REAL das cameras DeepinView da portaria, tal como
     * na captura de 07/08/2026: part "alarmResult" (json) + as TRES parts de
     * imagem que a camera manda junto.
     *
     * Carimba ipAddress e hora frescos — ver comIpDeCamera e cameraHaSegundos.
     */
    public static MockMultipartHttpServletRequestBuilder cameraWebhook(String json, String ip) {
        return cameraWebhookHaSegundos(json, ip, 0);
    }

    /** Como cameraWebhook, com a passagem `segundosAtras` no passado. */
    public static MockMultipartHttpServletRequestBuilder cameraWebhookHaSegundos(
            String json, String ip, long segundosAtras) {
        String corpo = cameraHaSegundos(comIpDeCamera(json, ip), segundosAtras);
        return cameraMultipart(ip, jsonPart("alarmResult", corpo),
                imagemDeRosto(), imagemDeFundo(), imagemDaBiblioteca());
    }

    /** Part de imagem do rosto — o parser tem de ignora-la sem armazenar nada. */
    public static MockPart imagemDeRosto() {
        return imagemJpeg("faceImage");
    }

    /**
     * Cena inteira (2560x1504). Na captura real pesa 453-467KB — e a part que
     * quase estoura o limite default de multipart do Spring.
     */
    public static MockPart imagemDeFundo() {
        return imagemJpeg("backgroundImage");
    }

    /** Foto que a camera tem na biblioteca facial; so vem quando ha comparacao. */
    public static MockPart imagemDaBiblioteca() {
        return imagemJpeg("faceLibImage");
    }

    /**
     * Part de imagem generica. O nome varia (faceImage, backgroundImage,
     * faceLibImage) e o parser NAO pode depender dele: o descarte e por
     * Content-Type, senao um nome novo de firmware vira "payload nao
     * parseavel" em WARN.
     */
    private static MockPart imagemJpeg(String nome) {
        MockPart p = new MockPart(nome, nome + ".jpg", fakeJpeg());
        p.getHeaders().setContentType(MediaType.IMAGE_JPEG);
        return p;
    }

    /**
     * Part de deteccao de movimento, como a camera a envia: nome com extensao
     * .xml e Content-Type application/xml. Tem de ser descartada em silencio.
     */
    public static MockPart moveDetectionPart() {
        MockPart p = new MockPart("MoveDetection.xml", null,
                payload("camera-move-detection.xml").getBytes(StandardCharsets.UTF_8));
        p.getHeaders().setContentType(MediaType.APPLICATION_XML);
        return p;
    }

    /** Multipart de camera com parts arbitrarias (token + remoteAddr aplicados). */
    public static MockMultipartHttpServletRequestBuilder cameraMultipart(String remoteAddr, MockPart... parts) {
        MockMultipartHttpServletRequestBuilder builder =
                MockMvcRequestBuilders.multipart(WEBHOOK_URL);
        for (MockPart part : parts) {
            builder.part(part);
        }
        builder.header(TOKEN_HEADER, WEBHOOK_TOKEN);
        builder.with(remoteAddr(remoteAddr));
        return builder;
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
