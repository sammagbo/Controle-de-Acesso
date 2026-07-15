package com.magbo.access.services;

import com.magbo.access.config.PolicyProperties;
import com.magbo.access.dto.EntitlementDecision;
import com.magbo.access.dto.EventClassification;
import com.magbo.access.dto.ExitDecision;
import com.magbo.access.dto.hikvision.HikvisionEventDto;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.ClassSchedule;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.PolicyMode;
import com.magbo.access.models.User;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.ClassScheduleRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccessDecisionService {

    private final DoorMappingService doorMappingService;
    private final UserRepository userRepository;
    private final ClassScheduleRepository classScheduleRepository;
    private final AccessLogRepository accessLogRepository;
    private final HikvisionEventClassifier classifier;
    private final DeduplicationService dedupService;
    private final AccessAttemptService attemptService;
    private final PolicyProperties policyProperties;
    private final MealEntitlementService mealEntitlementService;
    private final ExitPermissionService exitPermissionService;

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

    @Transactional
    public void process(HikvisionEventDto.AccessControllerEvent event, String terminalIp) {
        Integer subType = event.getSubEventType();
        EventClassification classification = classifier.classify(subType);

        String employeeNoRaw = event.getEmployeeNoString();
        String nomeSnapshot = event.getName();

        DoorMappingService.ResolvedMapping resolved = doorMappingService.resolve(event.getDoorNo(), event.getReaderNo(), terminalIp);

        if (resolved.isFallback() && "ATTEMPT".equals(policyProperties.getPolicy().getMissingDoorMapping())) {
            attemptService.record(
                    null, // sem userId, falha rapida
                    employeeNoRaw, nomeSnapshot,
                    resolved.pointId(), resolved.action(), terminalIp,
                    classification.method(), classification.result(),
                    AuthorizationResult.DENIED, DenialReason.MISSING_DOOR_MAPPING,
                    subType, true
            );
            return;
        }

        if (classification.result() == AuthResult.DENIED) {
            Optional<User> userOpt = userRepository.findByHikvisionEmployeeId(employeeNoRaw);
            String userId = userOpt.map(User::getId).orElse(null);
            attemptService.record(
                    userId, employeeNoRaw, nomeSnapshot,
                    resolved.pointId(), resolved.action(), terminalIp,
                    classification.method(), AuthResult.DENIED,
                    AuthorizationResult.DENIED, DenialReason.DEVICE_DENIED,
                    subType, resolved.isFallback()
            );
            return;
        }

        if (!classification.isAccessCandidate()) {
            attemptService.record(
                    null, employeeNoRaw, nomeSnapshot,
                    resolved.pointId(), resolved.action(), terminalIp,
                    classification.method(), AuthResult.UNKNOWN,
                    AuthorizationResult.NOT_APPLICABLE, DenialReason.DEVICE_DENIED,
                    subType, resolved.isFallback()
            );
            return;
        }

        Optional<User> userOpt = userRepository.findByHikvisionEmployeeId(employeeNoRaw);
        if (userOpt.isEmpty()) {
            attemptService.record(
                    null, employeeNoRaw, nomeSnapshot,
                    resolved.pointId(), resolved.action(), terminalIp,
                    classification.method(), classification.result(),
                    AuthorizationResult.DENIED, DenialReason.UNKNOWN_USER,
                    subType, resolved.isFallback()
            );
            return;
        }

        User user = userOpt.get();
        String userId = user.getId();

        if (Boolean.FALSE.equals(user.getAtivo())) {
            PolicyMode mode = policyProperties.getPolicy().getUserInactive();
            if (mode == PolicyMode.DENY) {
                attemptService.record(
                        userId, employeeNoRaw, nomeSnapshot,
                        resolved.pointId(), resolved.action(), terminalIp,
                        classification.method(), classification.result(),
                        AuthorizationResult.DENIED, DenialReason.USER_INACTIVE,
                        subType, resolved.isFallback()
                );
                return;
            } else if (mode == PolicyMode.OBSERVATION) {
                attemptService.record(
                        userId, employeeNoRaw, nomeSnapshot,
                        resolved.pointId(), resolved.action(), terminalIp,
                        classification.method(), classification.result(),
                        AuthorizationResult.OBSERVATION, DenialReason.USER_INACTIVE,
                        subType, resolved.isFallback()
                );
            }
        }

        LocalDateTime now = LocalDateTime.now();
        String pid = resolved.pointId() == null ? "" : resolved.pointId().toUpperCase();
        boolean isRefectory = pid.startsWith("REFEI") || pid.startsWith("CANTINA");
        String flag = null;

        if (isRefectory) {
            if (resolved.action() == AccessAction.ENTRADA) {
                if (dedupService.isDuplicate(userId, pid, AccessAction.ENTRADA, now)) {
                    PolicyMode mode = policyProperties.getPolicy().getDuplicateMeal();
                    if (mode == PolicyMode.DENY) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.DENIED, DenialReason.DUPLICATE_MEAL,
                                subType, resolved.isFallback()
                        );
                        return;
                    } else if (mode == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION, DenialReason.DUPLICATE_MEAL,
                                subType, resolved.isFallback()
                        );
                    }
                }
                
                // FASE C:
                EntitlementDecision decision = mealEntitlementService.evaluate(userId, now.toLocalDate());

                if (decision.effectiveStatus() == EntitlementStatus.NOT_AUTHORIZED
                        || (decision.effectiveStatus() == EntitlementStatus.AUTHORIZED && !decision.entitled())) {
                    PolicyMode mode = policyProperties.getPolicy().getMealNotEntitled();
                    if (mode == PolicyMode.DENY) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.DENIED, DenialReason.MEAL_NOT_ENTITLED,
                                subType, resolved.isFallback()
                        );
                        return;
                    } else if (mode == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION, DenialReason.MEAL_NOT_ENTITLED,
                                subType, resolved.isFallback()
                        );
                    }
                } else if (decision.effectiveStatus() == EntitlementStatus.PENDING) {
                    PolicyMode mode = policyProperties.getPolicy().getMealPending();
                    if (mode == PolicyMode.DENY) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.DENIED, DenialReason.MEAL_NOT_ENTITLED,
                                subType, resolved.isFallback()
                        );
                        return;
                    } else if (mode == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION, DenialReason.MEAL_NOT_ENTITLED,
                                subType, resolved.isFallback()
                        );
                    }
                }
                flag = validateEntryWindow(user, now);
                if ("FORA_HORARIO".equals(flag)) {
                    PolicyMode mode = policyProperties.getPolicy().getOutsideMealTime();
                    if (mode == PolicyMode.DENY) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.DENIED, DenialReason.OUTSIDE_MEAL_TIME,
                                subType, resolved.isFallback()
                        );
                        return;
                    } else if (mode == PolicyMode.OBSERVATION) {
                        attemptService.record(
                                userId, employeeNoRaw, nomeSnapshot,
                                resolved.pointId(), resolved.action(), terminalIp,
                                classification.method(), classification.result(),
                                AuthorizationResult.OBSERVATION, DenialReason.OUTSIDE_MEAL_TIME,
                                subType, resolved.isFallback()
                        );
                    }
                }
            } else if (resolved.action() == AccessAction.SAIDA) {
                flag = validateExitTime(userId, pid, now);
            }
        }
        
        // FASE D:
        boolean isGate = pid.startsWith("PORT");
        Long consumedPermissionId = null;

        if (isGate && resolved.action() == AccessAction.SAIDA) {
            ExitDecision exitDecision = exitPermissionService.evaluate(userId, now);
            if (!exitDecision.allowed()) {
                PolicyMode mode = policyProperties.getPolicy().getExitNotAuthorized();
                if (mode == PolicyMode.DENY) {
                    attemptService.record(
                            userId, employeeNoRaw, nomeSnapshot,
                            resolved.pointId(), resolved.action(), terminalIp,
                            classification.method(), classification.result(),
                            AuthorizationResult.DENIED, exitDecision.reason(),
                            subType, resolved.isFallback()
                    );
                    return;
                } else if (mode == PolicyMode.OBSERVATION) {
                    attemptService.record(
                            userId, employeeNoRaw, nomeSnapshot,
                            resolved.pointId(), resolved.action(), terminalIp,
                            classification.method(), classification.result(),
                            AuthorizationResult.OBSERVATION, exitDecision.reason(),
                            subType, resolved.isFallback()
                    );
                }
            } else {
                consumedPermissionId = exitDecision.permissionId();
            }
        }

        AccessLog accessLog = AccessLog.builder()
                .userId(userId)
                .pointId(resolved.pointId())
                .action(resolved.action())
                .timestamp(now)
                .flag(flag)
                .authMethod(classification.method())
                .hikvisionSubEventType(subType)
                .build();

        accessLogRepository.save(accessLog);
        
        if (consumedPermissionId != null) {
            exitPermissionService.consumeIfSingle(consumedPermissionId);
        }
        
        log.info("Access Log: user={}, point={}, action={}, flag={}, method={}, subType={}, fallback={}",
                userId, resolved.pointId(), resolved.action(), flag,
                classification.method(), subType, resolved.isFallback());
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
