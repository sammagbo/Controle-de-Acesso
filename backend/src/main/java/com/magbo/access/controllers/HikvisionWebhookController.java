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
            @RequestBody HikvisionEventDto payload) {

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

            if (event == null || event.getEmployeeNoString() == null || event.getEmployeeNoString().isEmpty()) {
                log.warn("Payload ignored: no employeeNoString");
                return ResponseEntity.ok("Success");
            }

            String hikvisionId = event.getEmployeeNoString();
            Optional<User> userOpt = userRepository.findByHikvisionEmployeeId(hikvisionId);
            String userId = userOpt.map(User::getId).orElse(hikvisionId);
            boolean isMapped = userOpt.isPresent();

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
}
