package com.magbo.access.controllers;

import com.magbo.access.dto.hikvision.HikvisionEventDto;
import com.magbo.access.services.AccessDecisionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/hikvision")
@RequiredArgsConstructor
@Slf4j
public class HikvisionWebhookController {

    private final AccessDecisionService accessDecisionService;
    private final com.magbo.access.services.WebhookIngestionDedupService ingestionDedup;
    private final com.magbo.access.services.EventTimeResolver eventTimeResolver;
    private final com.magbo.access.services.CameraIdentityService cameraIdentityService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    @Value("${magbo.webhook.token:}")
    private String webhookToken;

    @jakarta.annotation.PostConstruct
    private void trimToken() {
        if (webhookToken != null) webhookToken = webhookToken.trim();
    }

    /**
     * Endpoint de producao dos MinMoe: token no header X-MAGBO-WEBHOOK-TOKEN OU
     * na query string (?token=). O header, quando presente, tem precedencia —
     * header errado NAO cai para a query.
     */
    @PostMapping("/webhook")
    public ResponseEntity<String> receiveWebhook(
            @RequestHeader(value = "X-MAGBO-WEBHOOK-TOKEN", required = false) String incomingToken,
            jakarta.servlet.http.HttpServletRequest request) {

        String provided = incomingToken != null ? incomingToken : queryToken(request);
        return handleEvent(provided, request);
    }

    /**
     * Mesma logica do /webhook, com o token como SEGMENTO DE CAMINHO.
     *
     * A camera DeepinView da portaria (canal "Serveur d'alarme") nao envia o
     * token de jeito nenhum: descarta a query string da URL configurada e nao
     * suporta header customizado. Comprovado com tcpdump em 28/07/2026 — o
     * aparelho reenviava em loop (~1 req/s, milhares de 401) ate a entrada ser
     * removida dele. Segmento de caminho e o unico formato que ela preserva.
     *
     * O "/t/" e obrigatorio: um mapping "/webhook/{token}" capturaria tambem
     * /webhook/capture, com token="capture".
     *
     * OPERACIONAL: por esta rota o token precisa ser seguro em caminho de URL.
     * '/' quebraria o segmento e '%' e barrado pelo StrictHttpFirewall do Spring
     * Security (400, antes de chegar aqui). Token alfanumerico do .env funciona;
     * se algum dia mudar para um com esses caracteres, use header ou ?token=.
     */
    @PostMapping("/webhook/t/{token}")
    public ResponseEntity<String> receiveWebhookPathToken(
            @PathVariable("token") String pathToken,
            jakarta.servlet.http.HttpServletRequest request) {

        return handleEvent(pathToken, request);
    }

    /** Extrai o token da query string (?token=...), ou null se ausente. */
    private String queryToken(jakarta.servlet.http.HttpServletRequest request) {
        String qs = request.getQueryString();
        if (qs == null) return null;
        for (String p : qs.split("&")) {
            if (p.startsWith("token=")) {
                return java.net.URLDecoder.decode(p.substring(6), java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    /**
     * Valida o token ja resolvido e processa o evento. Unico caminho de
     * autenticacao e persistencia do webhook — as variantes de URL apenas
     * escolhem de onde o token vem.
     */
    private ResponseEntity<String> handleEvent(String incomingToken,
                                               jakarta.servlet.http.HttpServletRequest request) {

        // IP de ORIGEM da requisicao em toda linha de log: um loop de POSTs
        // malformados (~1/s, visto em producao) precisa ser atribuivel ao
        // aparelho sem tcpdump.
        String sourceIp = request.getRemoteAddr();

        if (webhookToken == null || webhookToken.isBlank()) {
            log.error("Webhook rejected: token not configured (deny-by-default). Defina MAGBO_WEBHOOK_TOKEN. (ip={})",
                    sourceIp);
            return ResponseEntity.status(503).body("Webhook token not configured");
        }
        String trimmedIncoming = incomingToken != null ? incomingToken.trim() : null;
        if (trimmedIncoming == null || !java.security.MessageDigest.isEqual(
                webhookToken.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                trimmedIncoming.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            log.warn("Webhook rejected: invalid or missing token (len expected={}, got={}, ip={})",
                    webhookToken.length(), trimmedIncoming != null ? trimmedIncoming.length() : -1, sourceIp);
            return ResponseEntity.status(401).body("Unauthorized");
        }

        ParsedBody body = parsePayload(request, sourceIp);
        if (body == null) {
            return ResponseEntity.ok("Success");
        }

        // Ramo das CAMERAS da portaria (DeepinView): formato proprio, sem
        // AccessControllerEvent. Ate 07/08/2026 todo evento delas caia em
        // "Evento nao tratado, descartado" — a portaria inteira era invisivel.
        if (body.alarmResultJson() != null) {
            return handleCameraAlarm(body.alarmResultJson(), sourceIp, request);
        }

        HikvisionEventDto payload = body.dto();

        // Evento de tipo desconhecido (ex.: part "LocalUserChange", sync do
        // proprio aparelho — visto em producao em 29/07/2026): nao traz
        // AccessControllerEvent nem EventNotificationAlert. Aceita, registra
        // UMA linha concisa e descarta. Sem stack trace e sem WARN por
        // requisicao — senao um aparelho em loop enche o log sozinho.
        if (payload.getAccessControllerEvent() == null && payload.getEventNotificationAlert() == null) {
            logUnknownEvent(sourceIp, body);
            return ResponseEntity.ok("Success");
        }

        try {
            HikvisionEventDto.AccessControllerEvent event = null;
            String terminalIp = null;

            if (payload.getAccessControllerEvent() != null) {
                event = payload.getAccessControllerEvent();
            } else if (payload.getEventNotificationAlert() != null) {
                event = payload.getEventNotificationAlert().getAccessControllerEvent();
                terminalIp = payload.getEventNotificationAlert().getIpAddress();
            }

            // Cameras em LAN direta: se o payload nao traz ipAddress, o IP de
            // origem da requisicao e o proprio dispositivo (nao ha proxy interno)
            if (terminalIp == null || terminalIp.isBlank()) {
                terminalIp = request.getRemoteAddr();
            }

            // Dedup de ingestao ANTES de qualquer log por evento: os MinMoe
            // enfileiram e reenviam quando o destino falha, e a reentrega
            // repete o serialNo. Duplicata: 200, nada no banco — mas NUNCA em
            // silencio.
            //
            // O descarte sai em INFO, nao em DEBUG: em producao o nivel do
            // pacote e INFO, entao DEBUG some do arquivo e o evento de acesso
            // desapareceria sem deixar rastro nenhum. Descartar acesso sem
            // rastro e inaceitavel aqui — se um aluno jura ter passado e nao ha
            // access_log, a linha abaixo e a unica prova de que o pacote chegou
            // e por que foi descartado. A linha carrega o que identifica o
            // pacote (IP de origem + serialNo do aparelho) e a janela aplicada.
            //
            // Custo aceito conscientemente: um aparelho preso em loop de ~1
            // req/s gera ~1 linha INFO/s enquanto durar. E o preco de nao ter
            // descarte invisivel — e a propria linha e o alarme que denuncia o
            // loop.
            Long serialNo = event != null ? event.getSerialNo() : null;
            if (ingestionDedup.isDuplicateEvent(sourceIp, serialNo)) {
                log.info("Webhook duplicado descartado (ip={}, serialNo={}, janela={}s)",
                        sourceIp, serialNo, ingestionDedup.ttlSeconds());
                return ResponseEntity.ok("Success");
            }

            boolean semPessoa = event == null || event.getEmployeeNoString() == null
                    || event.getEmployeeNoString().isBlank();

            // Heartbeat (major 5 / sub 9, sem pessoa — payloads/heartbeat.txt):
            // chega a cada ~30s por aparelho; INFO por batida inunda o log.
            // No maximo um INFO por aparelho por janela; o resto em DEBUG.
            if (semPessoa && event != null && Integer.valueOf(9).equals(event.getSubEventType())) {
                if (ingestionDedup.heartbeatInfoDue(sourceIp)) {
                    log.info("Heartbeat do terminal ip={} (proximos heartbeats em DEBUG ate a janela vencer)",
                            sourceIp);
                } else {
                    log.debug("Heartbeat (ip={}, serialNo={})", sourceIp, serialNo);
                }
                return ResponseEntity.ok("Success");
            }

            log.info("Received Hikvision Webhook (ip={}): {}", sourceIp, payload);

            if (semPessoa) {
                log.warn("Payload ignored: no employeeNoString (ip={})", sourceIp);
                return ResponseEntity.ok("Success");
            }

            // Hora do EVENTO, nao da recepcao: os MinMoe enfileiram e reenviam,
            // e uma fila esvaziada entrega passagens de horas atras (incidente
            // de 03/08/2026). Resolvido aqui, depois dos descartes, para que
            // pacote descartado nunca gere linha de fallback de hora.
            java.time.LocalDateTime eventTime =
                    eventTimeResolver.resolve(rawEventTime(payload), sourceIp, java.time.LocalDateTime.now());

            accessDecisionService.process(event, terminalIp, eventTime);
            return ResponseEntity.ok("Success");
        } catch (Exception e) {
            log.error("Error processing webhook (ip={})", sourceIp, e);
            return ResponseEntity.status(500).body("Error");
        }
    }

    /**
     * Evento de comparacao facial das cameras da PORTARIA.
     *
     * Passa pelas MESMAS camadas do ramo dos terminais, na mesma ordem:
     *   dedup de ingestao -> hora do evento -> identidade -> decisao,
     * onde a decisao (permissao de saida, mesma passagem, gravacao) e o codigo
     * compartilhado do AccessDecisionService.
     *
     * Sempre 200, inclusive em erro: a camera reenvia em loop de ~1 req/s
     * quando recebe qualquer coisa diferente disso (tcpdump 28/07/2026), e um
     * loop de milhares de requisicoes e pior que um evento perdido.
     */
    private ResponseEntity<String> handleCameraAlarm(String alarmJson, String sourceIp,
                                                     jakarta.servlet.http.HttpServletRequest request) {
        try {
            com.magbo.access.dto.hikvision.CameraAlarmDto alarme =
                    objectMapper.readValue(alarmJson, com.magbo.access.dto.hikvision.CameraAlarmDto.class);

            // A camera nao manda serialNo — a chave numerica do dedup dos
            // MinMoe nao existe aqui. faceId/pId identificam a deteccao, e uma
            // reentrega do mesmo pacote os repete.
            String chave = alarme.chaveDeIngestao();
            if (ingestionDedup.isDuplicateCameraEvent(sourceIp, chave)) {
                log.info("Evento de camera duplicado descartado (ip={}, pId={}, reentrega={}, janela={}s)",
                        sourceIp, chave, alarme.getIsDataRetransmission(), ingestionDedup.ttlSeconds());
                return ResponseEntity.ok("Success");
            }
            if (Boolean.TRUE.equals(alarme.getIsDataRetransmission())) {
                // A camera declara reentrega mas o pId nao estava no cache: ou
                // a entrega original nunca chegou, ou a janela venceu. Processa
                // — perder o evento seria pior —, mas deixa a linha, que e o
                // que explica um access_log com hora "estranha" depois.
                log.info("Camera declarou REENTREGA de um evento nao visto antes (ip={}, pId={})",
                        sourceIp, chave);
            }

            // IP do aparelho: o que ele anuncia, com o IP de origem como
            // fallback. E ele que resolve o ponto E o sentido — .167 e a
            // ENTRADA de PORT1, .166 a SAIDA (door_mappings).
            String terminalIp = alarme.getIpAddress();
            if (terminalIp == null || terminalIp.isBlank()) {
                terminalIp = request.getRemoteAddr();
            }

            java.time.LocalDateTime eventTime = eventTimeResolver.resolve(
                    alarme.horaDoEvento(), sourceIp, java.time.LocalDateTime.now());

            var identidade = cameraIdentityService.resolver(alarme);

            if (identidade.resultado() == com.magbo.access.services.CameraIdentityService.Resultado.IDENTIFICADO) {
                accessDecisionService.processCameraRecognition(
                        identidade.user(), alarme.identificadorBruto(), terminalIp, eventTime);
            } else {
                accessDecisionService.processCameraDenied(
                        alarme.identificadorBruto(), identidade.nome(), terminalIp,
                        identidade.motivoDeNegacao(), eventTime);
            }
            return ResponseEntity.ok("Success");
        } catch (Exception e) {
            log.error("Erro processando evento de camera (ip={})", sourceIp, e);
            // 200 mesmo assim: ver o javadoc. O erro fica no log com stack.
            return ResponseEntity.ok("Success");
        }
    }

    /**
     * dateTime do ENVELOPE do payload. Fica na raiz (MinMoe) ou dentro do
     * EventNotificationAlert (camera) — nunca dentro do AccessControllerEvent.
     * O do alerta tem precedencia quando existe; o da raiz cobre o resto.
     */
    private String rawEventTime(HikvisionEventDto payload) {
        HikvisionEventDto.EventNotificationAlert alert = payload.getEventNotificationAlert();
        if (alert != null && alert.getDateTime() != null && !alert.getDateTime().isBlank()) {
            return alert.getDateTime();
        }
        return payload.getDateTime();
    }

    /**
     * JSON bruto + nome da part de onde veio + DTO ja desserializado.
     *
     * `alarmResultJson` so vem preenchido no ramo das CAMERAS da portaria: e a
     * part "alarmResult", que carrega o resultado da comparacao facial. Quando
     * ela existe, e ela que manda — o resto do corpo (faceCapture, faceImage)
     * e contexto da mesma deteccao.
     */
    private record ParsedBody(String json, String partName, HikvisionEventDto dto,
                              String alarmResultJson) {
    }

    /**
     * F6b: extrai o HikvisionEventDto do corpo da requisicao.
     * Terminais MinMoe (DS-K1T344) enviam multipart/form-data com o JSON na
     * part 'AccessControllerEvent' + uma part 'Picture' (jpeg). Retorna null se
     * nao houver JSON parseavel (o chamador responde 200 para evitar
     * tempestade de retries do aparelho).
     *
     * Cameras DeepinView tambem mandam multipart, com estas parts (nomes
     * conferidos na captura de 07/08/2026, boundary literal "boundary"):
     * 'faceCapture' ou 'alarmResult' (application/json) · 'faceImage',
     * 'backgroundImage' e 'faceLibImage' (image/jpeg, com filename e
     * Content-ID iguais a um pId). As tres de imagem sao descartadas pelo
     * Content-Type, NAO pelo nome — por isso 'backgroundImage' e
     * 'faceLibImage', que so apareceram na captura, ja passavam em silencio.
     *
     * A part 'AccessControllerEvent' tem PRECEDENCIA sobre qualquer outra part
     * JSON: aparelhos que mandam a part de evento junto com uma part de sync
     * (LocalUserChange) nao podem fazer o evento de acesso ser perdido pela
     * ordem das parts. Com o formato conhecido (evento + Picture) o resultado
     * e identico ao anterior.
     */
    private ParsedBody parsePayload(jakarta.servlet.http.HttpServletRequest request, String sourceIp) {
        try {
            String json = null;
            String partName = null;
            String alarmJson = null;
            boolean viuPartDescartavel = false;
            String ct = request.getContentType() != null ? request.getContentType().toLowerCase() : "";
            if (ct.contains("multipart")) {
                jakarta.servlet.http.Part chosen = null;
                for (jakarta.servlet.http.Part part : request.getParts()) {
                    String pct = part.getContentType();
                    String nome = part.getName();

                    // Part de comparacao facial das cameras DeepinView. Lida
                    // SEMPRE, mesmo quando outra part JSON aparece antes: ela e
                    // o evento, as outras sao contexto da mesma deteccao.
                    if (PART_ALARM_RESULT.equalsIgnoreCase(nome)) {
                        alarmJson = new String(part.getInputStream().readAllBytes(),
                                java.nio.charset.StandardCharsets.UTF_8);
                        continue;
                    }

                    // Deteccao de movimento: a camera manda a part quando a
                    // funcao esta ligada. Nao e passagem de ninguem — descarte
                    // silencioso, em DEBUG. Um WARN por movimento na portaria
                    // encheria o log sozinho, e um 500 poria a camera em loop.
                    if (ehXml(nome, pct)) {
                        viuPartDescartavel = true;
                        log.debug("Webhook: part XML descartada (part={}, type={}, ip={})",
                                nome, pct, sourceIp);
                        continue;
                    }

                    // Imagem do rosto: NUNCA armazenada. O MAGBO registra
                    // passagem, nao acervo biometrico.
                    if (pct != null && pct.toLowerCase().startsWith("image/")) {
                        viuPartDescartavel = true;
                        continue;
                    }

                    boolean isJson = (pct != null && pct.toLowerCase().contains("json"))
                            || "AccessControllerEvent".equalsIgnoreCase(nome);
                    if (!isJson) continue;
                    if ("AccessControllerEvent".equalsIgnoreCase(nome)) {
                        chosen = part;
                        continue;
                    }
                    if (chosen == null) chosen = part;
                }
                if (chosen != null) {
                    partName = chosen.getName();
                    json = new String(chosen.getInputStream().readAllBytes(),
                            java.nio.charset.StandardCharsets.UTF_8);
                }
            } else {
                json = new String(request.getInputStream().readAllBytes(),
                        java.nio.charset.StandardCharsets.UTF_8);
            }

            // Ha part de camera: e ela que manda, com ou sem outra part JSON.
            if (alarmJson != null && !alarmJson.isBlank()) {
                return new ParsedBody(json, partName, vazio(json), alarmJson);
            }

            if (json == null || json.isBlank()) {
                // Requisicao que so trazia XML e/ou imagem (ex.: MoveDetection
                // com a deteccao de movimento ligada): nao e evento, nao e
                // defeito. DEBUG, nunca WARN.
                if (viuPartDescartavel) {
                    log.debug("Webhook: requisicao sem part de evento, so partes descartaveis (ip={})", sourceIp);
                } else {
                    log.warn("Webhook: corpo vazio ou sem part JSON (contentType={}, ip={})",
                            request.getContentType(), sourceIp);
                }
                return null;
            }
            return new ParsedBody(json, partName,
                    objectMapper.readValue(json, HikvisionEventDto.class), null);
        } catch (Exception e) {
            log.warn("Webhook: payload nao parseavel (contentType={}, ip={}): {}",
                    request.getContentType(), sourceIp, e.getMessage());
            return null;
        }
    }

    /** Nome da part que carrega o resultado da comparacao facial da camera. */
    private static final String PART_ALARM_RESULT = "alarmResult";

    /** Nome da part de deteccao de movimento, tal como a camera a envia. */
    private static final String PART_MOVE_DETECTION = "MoveDetection.xml";

    /**
     * Part XML — por Content-Type ou pelo nome.
     *
     * Pelos DOIS porque nenhum dos dois e garantido: o nome vem de uma
     * configuracao do aparelho, e o Content-Type de uma part multipart pode
     * chegar nulo. Exigir os dois deixaria a part passar adiante e virar
     * "payload nao parseavel" em WARN, que e exatamente o ruido a evitar.
     */
    private boolean ehXml(String nome, String contentType) {
        if (contentType != null && contentType.toLowerCase().contains("xml")) return true;
        if (nome == null) return false;
        String n = nome.toLowerCase(java.util.Locale.ROOT);
        return n.endsWith(".xml") || PART_MOVE_DETECTION.equalsIgnoreCase(nome);
    }

    /** DTO vazio para o ramo da camera, que nao usa o formato dos MinMoe. */
    private HikvisionEventDto vazio(String json) {
        if (json == null || json.isBlank()) return new HikvisionEventDto();
        try {
            return objectMapper.readValue(json, HikvisionEventDto.class);
        } catch (Exception e) {
            return new HikvisionEventDto();
        }
    }

    /**
     * UMA linha INFO por evento desconhecido, com o que permite identificar a
     * origem: ip + part + eventType + serialNo. Reentregas do mesmo evento
     * (mesmo ip+serialNo) caem para DEBUG — um aparelho em loop de sync nao
     * pode gerar INFO por requisicao.
     */
    private void logUnknownEvent(String sourceIp, ParsedBody body) {
        String eventType = null;
        Long serialNo = null;
        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(body.json());
            com.fasterxml.jackson.databind.JsonNode typeNode = root.get("eventType");
            if (typeNode != null && typeNode.isValueNode()) eventType = typeNode.asText();
            serialNo = findSerialNo(root);
        } catch (Exception e) {
            // JSON valido para o Jackson mas de forma inesperada: a linha sai
            // sem os campos extras. Nunca propaga — o aparelho receberia erro
            // e reenviaria em loop.
            log.debug("Evento desconhecido sem metadados legiveis (ip={}): {}", sourceIp, e.getMessage());
        }

        // Keep-alive do aparelho (eventType "heartBeat", ~30s por aparelho):
        // chega SEM AccessControllerEvent, entao entra por aqui, e sem serialNo
        // — o dedup de desconhecido nao tem chave e deixa passar tudo. Sem este
        // desvio sai uma linha INFO por batida por aparelho (~2900/dia com 1
        // terminal), afogando no log exatamente os eventos que importam.
        // Roteado para o limitador que ja existe para heartbeat: no maximo um
        // INFO por aparelho por janela, o resto em DEBUG. O tratamento de
        // evento desconhecido abaixo segue inalterado para todo o resto.
        if (ehHeartbeat(eventType)) {
            if (ingestionDedup.heartbeatInfoDue(sourceIp)) {
                log.info("Heartbeat do terminal ip={} (proximos heartbeats em DEBUG ate a janela vencer)",
                        sourceIp);
            } else {
                log.debug("Heartbeat (ip={}, serialNo={})", sourceIp, serialNo);
            }
            return;
        }

        String partLabel = body.partName() != null ? body.partName() : "(json)";
        if (ingestionDedup.isDuplicateUnknown(sourceIp, serialNo)) {
            log.debug("Evento desconhecido reentregue (ip={}, part={}, serialNo={})",
                    sourceIp, partLabel, serialNo);
            return;
        }
        log.info("Evento nao tratado, descartado: ip={}, part={}, eventType={}, serialNo={}",
                sourceIp, partLabel, eventType, serialNo);
    }

    /**
     * Keep-alive pelo eventType do envelope. Comparacao case-insensitive de
     * proposito: o campo aparece como "heartBeat" nos MinMoe, e nao vale
     * arriscar que uma familia de firmware escreva "heartbeat" e o limitador
     * pare de valer justamente onde o volume aparece.
     *
     * Nao confundir com o heartbeat major 5 / sub 9 tratado em handleEvent:
     * aquele vem COM AccessControllerEvent e ja e limitado la. Sao dois
     * formatos do mesmo ruido, e os dois passam pelo mesmo limitador.
     */
    private boolean ehHeartbeat(String eventType) {
        return eventType != null
                && eventType.trim().toLowerCase(java.util.Locale.ROOT).contains("heartbeat");
    }

    /** serialNo na raiz ou um nivel abaixo (ex.: LocalUserChange.serialNo). */
    private Long findSerialNo(com.fasterxml.jackson.databind.JsonNode root) {
        com.fasterxml.jackson.databind.JsonNode direct = root.get("serialNo");
        if (direct != null && direct.canConvertToLong()) return direct.asLong();
        java.util.Iterator<com.fasterxml.jackson.databind.JsonNode> children = root.elements();
        while (children.hasNext()) {
            com.fasterxml.jackson.databind.JsonNode child = children.next();
            if (!child.isObject()) continue;
            com.fasterxml.jackson.databind.JsonNode nested = child.get("serialNo");
            if (nested != null && nested.canConvertToLong()) return nested.asLong();
        }
        return null;
    }

    // ── F6a: endpoint de captura — descoberta do payload real do terminal ──
    // Apontar o terminal para /api/hikvision/webhook/capture na primeira ligacao.
    // Aceita QUALQUER content-type (JSON, multipart, form) e loga headers + corpo bruto.
    // Token via header X-MAGBO-WEBHOOK-TOKEN OU via URL (?token=...), para terminais
    // que nao suportam headers customizados. Nao grava nada no banco.
    @PostMapping("/webhook/capture")
    public ResponseEntity<String> captureWebhook(
            @RequestHeader(value = "X-MAGBO-WEBHOOK-TOKEN", required = false) String headerToken,
            jakarta.servlet.http.HttpServletRequest request) {

        if (webhookToken == null || webhookToken.isBlank()) {
            log.error("Capture rejected: token not configured (deny-by-default). (ip={})", request.getRemoteAddr());
            return ResponseEntity.status(503).body("Webhook token not configured");
        }
        String queryToken = null;
        String qs = request.getQueryString();
        if (qs != null) {
            for (String p : qs.split("&")) {
                if (p.startsWith("token=")) {
                    queryToken = java.net.URLDecoder.decode(p.substring(6), java.nio.charset.StandardCharsets.UTF_8);
                    break;
                }
            }
        }
        String provided = headerToken != null ? headerToken : queryToken;
        if (provided == null || !java.security.MessageDigest.isEqual(
                webhookToken.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                provided.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            log.warn("Capture rejected: invalid or missing token (ip={})", request.getRemoteAddr());
            return ResponseEntity.status(401).body("Unauthorized");
        }

        try {
            StringBuilder headers = new StringBuilder();
            java.util.Enumeration<String> names = request.getHeaderNames();
            while (names.hasMoreElements()) {
                String n = names.nextElement();
                if (n.equalsIgnoreCase("X-MAGBO-WEBHOOK-TOKEN")) continue;
                headers.append(n).append(": ").append(request.getHeader(n)).append(" | ");
            }
            byte[] body = request.getInputStream().readAllBytes();
            int limit = Math.min(body.length, 8192);
            String preview = new String(body, 0, limit, java.nio.charset.StandardCharsets.UTF_8);

            log.info("=== HIKVISION CAPTURE ===");
            log.info("Remote IP: {}", request.getRemoteAddr());
            log.info("Content-Type: {} | Content-Length: {} bytes", request.getContentType(), body.length);
            log.info("Headers: {}", headers);
            log.info("Body (primeiros {} bytes):\n{}", limit, preview);
            if (body.length > limit) {
                log.info("(corpo truncado — total {} bytes; provavel imagem embutida)", body.length);
            }
            if (body.length == 0 && request.getContentType() != null
                    && request.getContentType().toLowerCase().contains("multipart")) {
                log.info("Requisicao multipart — listando parts:");
                for (jakarta.servlet.http.Part part : request.getParts()) {
                    byte[] pb = part.getInputStream().readAllBytes();
                    boolean texto = part.getContentType() == null
                            || part.getContentType().contains("json")
                            || part.getContentType().contains("text");
                    if (texto && pb.length <= 8192) {
                        log.info("Part '{}' | type={} | {} bytes:\n{}", part.getName(), part.getContentType(),
                                pb.length, new String(pb, java.nio.charset.StandardCharsets.UTF_8));
                    } else {
                        log.info("Part '{}' | type={} | {} bytes (binario/omitido)", part.getName(),
                                part.getContentType(), pb.length);
                    }
                }
            }
            log.info("=== FIM CAPTURE ===");
            return ResponseEntity.ok("Captured");
        } catch (Exception e) {
            log.error("Capture error (ip={}): {}", request.getRemoteAddr(), e.getMessage(), e);
            return ResponseEntity.ok("Captured with errors");
        }
    }
}
