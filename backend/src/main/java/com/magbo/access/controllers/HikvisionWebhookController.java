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

        if (webhookToken == null || webhookToken.isBlank()) {
            log.error("Webhook rejected: token not configured (deny-by-default). Defina MAGBO_WEBHOOK_TOKEN.");
            return ResponseEntity.status(503).body("Webhook token not configured");
        }
        String trimmedIncoming = incomingToken != null ? incomingToken.trim() : null;
        if (trimmedIncoming == null || !java.security.MessageDigest.isEqual(
                webhookToken.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                trimmedIncoming.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            log.warn("Webhook rejected: invalid or missing token (len expected={}, got={})",
                    webhookToken.length(), trimmedIncoming != null ? trimmedIncoming.length() : -1);
            return ResponseEntity.status(401).body("Unauthorized");
        }

        HikvisionEventDto payload = parsePayload(request);
        if (payload == null) {
            return ResponseEntity.ok("Success");
        }

        log.info("Received Hikvision Webhook: {}", payload);

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

            if (event == null || event.getEmployeeNoString() == null || event.getEmployeeNoString().isBlank()) {
                log.warn("Payload ignored: no employeeNoString");
                return ResponseEntity.ok("Success");
            }

            accessDecisionService.process(event, terminalIp);
            return ResponseEntity.ok("Success");
        } catch (Exception e) {
            log.error("Error processing webhook", e);
            return ResponseEntity.status(500).body("Error");
        }
    }

    /**
     * F6b: extrai o HikvisionEventDto do corpo da requisicao.
     * Terminais MinMoe (DS-K1T344) enviam multipart/form-data com o JSON na
     * part 'AccessControllerEvent' + uma part 'Picture' (jpeg). Cameras
     * DeepinView enviam JSON puro (EventNotificationAlert). Retorna null se
     * nao houver JSON parseavel (o chamador responde 200 para evitar
     * tempestade de retries do aparelho).
     */
    private HikvisionEventDto parsePayload(jakarta.servlet.http.HttpServletRequest request) {
        try {
            String json = null;
            String ct = request.getContentType() != null ? request.getContentType().toLowerCase() : "";
            if (ct.contains("multipart")) {
                for (jakarta.servlet.http.Part part : request.getParts()) {
                    String pct = part.getContentType();
                    boolean isJson = (pct != null && pct.toLowerCase().contains("json"))
                            || "AccessControllerEvent".equalsIgnoreCase(part.getName());
                    if (isJson) {
                        json = new String(part.getInputStream().readAllBytes(),
                                java.nio.charset.StandardCharsets.UTF_8);
                        break;
                    }
                }
            } else {
                json = new String(request.getInputStream().readAllBytes(),
                        java.nio.charset.StandardCharsets.UTF_8);
            }
            if (json == null || json.isBlank()) {
                log.warn("Webhook: corpo vazio ou sem part JSON (contentType={})", request.getContentType());
                return null;
            }
            return objectMapper.readValue(json, HikvisionEventDto.class);
        } catch (Exception e) {
            log.warn("Webhook: payload nao parseavel (contentType={}): {}",
                    request.getContentType(), e.getMessage());
            return null;
        }
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
            log.error("Capture rejected: token not configured (deny-by-default).");
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
            log.warn("Capture rejected: invalid or missing token");
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
            log.error("Capture error: {}", e.getMessage(), e);
            return ResponseEntity.ok("Captured with errors");
        }
    }
}
