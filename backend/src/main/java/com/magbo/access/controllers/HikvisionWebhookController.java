package com.magbo.access.controllers;

import com.magbo.access.dto.hikvision.HikvisionEventDto;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.ClassSchedule;
import com.magbo.access.models.User;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.ClassScheduleRepository;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.DoorMappingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;
import java.util.Set;

@RestController
@RequestMapping("/api/hikvision")
@RequiredArgsConstructor
@Slf4j
public class HikvisionWebhookController {

    private final AccessLogRepository accessLogRepository;
    private final DoorMappingService doorMappingService;
    private final UserRepository userRepository;
    private final ClassScheduleRepository classScheduleRepository;

    @Value("${magbo.webhook.token:}")
    private String webhookToken;

    // Turmas com prioridade total (entram 11h-15h sem restrição de horário de turma)
    private static final Set<String> LYCEE_CLASSES = Set.of(
            "T1", "T2",
            "1E1", "1E2", "1E3",
            "2E1", "2E2", "2E3"
    );

    private static final LocalTime LYCEE_START = LocalTime.of(11, 0);
    private static final LocalTime LYCEE_END = LocalTime.of(15, 0);
    private static final Duration MAX_CANTINA_TIME = Duration.ofHours(1);
    private static final Duration LUNCH_WINDOW = Duration.ofHours(1);

    @PostMapping("/webhook")
    public ResponseEntity<String> receiveWebhook(
            @RequestHeader(value = "X-MAGBO-WEBHOOK-TOKEN", required = false) String incomingToken,
            @RequestBody HikvisionEventDto payload,
            jakarta.servlet.http.HttpServletRequest request) {

        if (webhookToken == null || webhookToken.isBlank()) {
            log.error("Webhook rejected: token not configured (deny-by-default). Defina MAGBO_WEBHOOK_TOKEN.");
            return ResponseEntity.status(503).body("Webhook token not configured");
        }
        if (incomingToken == null || !java.security.MessageDigest.isEqual(
                webhookToken.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                incomingToken.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            log.warn("Webhook rejected: invalid or missing token");
            return ResponseEntity.status(401).body("Unauthorized");
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

            if (event == null || event.getEmployeeNoString() == null || event.getEmployeeNoString().isEmpty()) {
                log.warn("Payload ignored: no employeeNoString");
                return ResponseEntity.ok("Success");
            }

            String hikvisionId = event.getEmployeeNoString();
            Optional<User> userOpt = userRepository.findByHikvisionEmployeeId(hikvisionId);

            // Pessoa reconhecida pelo terminal mas ausente/desativada no banco:
            // NAO gravar em access_logs (evita poluir estatisticas com ID externo cru).
            // F5e tratara o registro de eventos nao resolvidos quando houver payload real.
            if (userOpt.isEmpty()) {
                log.warn("Evento ignorado: employeeNoString '{}' sem correspondencia no banco (doorNo={}, readerNo={})",
                        hikvisionId, event.getDoorNo(), event.getReaderNo());
                return ResponseEntity.ok("Success");
            }

            String userId = userOpt.get().getId();
            boolean isMapped = true;

            DoorMappingService.ResolvedMapping resolved = doorMappingService.resolve(
                    event.getDoorNo(),
                    event.getReaderNo(),
                    terminalIp
            );

            LocalDateTime now = LocalDateTime.now();
            String flag = null;

            // Lógica de refeitório (pointId começa com "REFEI" ou "CANTINA")
            String pid = resolved.pointId() == null ? "" : resolved.pointId().toUpperCase();
            boolean isRefectory = pid.startsWith("REFEI") || pid.startsWith("CANTINA");

            if (isRefectory && isMapped) {
                User user = userOpt.get();

                if (resolved.action() == AccessAction.ENTRADA) {
                    flag = validateEntryWindow(user, now);
                } else if (resolved.action() == AccessAction.SAIDA) {
                    flag = validateExitTime(userId, pid, now);
                }
            }

            AccessLog accessLog = AccessLog.builder()
                    .userId(userId)
                    .pointId(resolved.pointId())
                    .action(resolved.action())
                    .timestamp(now)
                    .flag(flag)
                    .build();

            accessLogRepository.save(accessLog);
            log.info("Access Log: user={}, point={}, action={}, flag={}, fallback={}",
                    userId, resolved.pointId(), resolved.action(), flag, resolved.isFallback());

            return ResponseEntity.ok("Success");
        } catch (Exception e) {
            log.error("Error processing webhook", e);
            return ResponseEntity.status(500).body("Error");
        }
    }

    /**
     * Valida janela de entrada na cantina.
     * Retorna null se OK, "FORA_HORARIO" se fora da janela.
     */
    private String validateEntryWindow(User user, LocalDateTime now) {
        String turma = user.getTurma();
        if (turma == null) return null;

        LocalTime time = now.toLocalTime();

        // Lycée: janela fixa 11h-15h, qualquer dia
        if (LYCEE_CLASSES.contains(turma)) {
            if (time.isBefore(LYCEE_START) || time.isAfter(LYCEE_END)) {
                return "FORA_HORARIO";
            }
            return null;
        }

        // Outras turmas: usa horário da turma para o dia da semana
        Optional<ClassSchedule> schedOpt = classScheduleRepository.findById(turma);
        if (schedOpt.isEmpty()) return null; // sem horário definido = não alerta

        ClassSchedule sched = schedOpt.get();
        String dayHour = getLunchTimeForDay(sched, now.getDayOfWeek());

        if (dayHour == null || "N".equalsIgnoreCase(dayHour) || dayHour.isEmpty()) {
            return "FORA_HORARIO"; // dia sem refeição = alerta
        }

        LocalTime expected = parseHour(dayHour);
        if (expected == null) return null;

        LocalTime windowEnd = expected.plus(LUNCH_WINDOW);
        if (time.isBefore(expected) || time.isAfter(windowEnd)) {
            return "FORA_HORARIO";
        }
        return null;
    }

    /**
     * Valida tempo dentro da cantina (na SAIDA).
     * Retorna "EXCEDEU_TEMPO" se passou mais de 1h desde a ENTRADA mais recente.
     */
    private String validateExitTime(String userId, String pointId, LocalDateTime now) {
        Optional<AccessLog> lastEntry = accessLogRepository
                .findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(userId, pointId, AccessAction.ENTRADA);

        if (lastEntry.isEmpty()) return null;

        Duration inside = Duration.between(lastEntry.get().getTimestamp(), now);
        if (inside.compareTo(MAX_CANTINA_TIME) > 0) {
            return "EXCEDEU_TEMPO";
        }
        return null;
    }

    private String getLunchTimeForDay(ClassSchedule s, DayOfWeek day) {
        switch (day) {
            case MONDAY: return s.getLunMidi();
            case TUESDAY: return s.getMarMidi();
            case WEDNESDAY: return s.getMerMidi();
            case THURSDAY: return s.getJeuMidi();
            case FRIDAY: return s.getVenMidi();
            default: return null;
        }
    }

    private LocalTime parseHour(String h) {
        if (h == null || h.isEmpty()) return null;
        try {
            // Formato "11H00", "12H30", "13H00"
            String clean = h.toUpperCase().replace("H", ":");
            return LocalTime.parse(clean);
        } catch (Exception e) {
            log.warn("Could not parse lunch time: {}", h);
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
