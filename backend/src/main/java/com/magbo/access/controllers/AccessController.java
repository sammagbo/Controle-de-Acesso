package com.magbo.access.controllers;

import com.magbo.access.dto.AccessRequest;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.models.User;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.repositories.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/access")
@RequiredArgsConstructor
public class AccessController {

    private final AccessLogRepository accessLogRepository;
    private final SystemUserRepository systemUserRepository;
    private final UserRepository userRepository;

    @PostMapping
    public ResponseEntity<?> registerAccess(@Valid @RequestBody AccessRequest request) {
        // ── Sector validation ──
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        SystemUser operator = systemUserRepository.findByUsername(username)
                .orElseThrow(() -> new SecurityException("Operador não encontrado: " + username));

        if (!operator.canOperateSector(request.getPointId())) {
            log.warn("Operador {} (role={}) tentou operar setor não permitido: {}",
                     username, operator.getRole(), request.getPointId());
            return ResponseEntity.status(403).body(Map.of(
                "error", "Você não tem permissão para operar o setor " + request.getPointId()
            ));
        }

        AccessLog accessLog = AccessLog.builder()
                .userId(request.getUserId())
                .pointId(request.getPointId())
                .action(request.getAction())
                .timestamp(LocalDateTime.now())
                .createdByUser(username)
                .build();

        AccessLog saved = accessLogRepository.save(accessLog);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @GetMapping("/logs/refectory")
    public List<AccessLog> refectoryLogs(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String action,
            @RequestParam(defaultValue = "500") Integer limit) {

        List<String> refIds = List.of("REFEI1", "REFEI2", "CANTINA1");

        LocalDateTime from = (dateFrom != null && !dateFrom.isEmpty())
                ? java.time.LocalDate.parse(dateFrom).atStartOfDay()
                : LocalDateTime.now().minusDays(30);
        LocalDateTime to = (dateTo != null && !dateTo.isEmpty())
                ? java.time.LocalDate.parse(dateTo).atTime(23, 59, 59)
                : LocalDateTime.now();

        List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(refIds, from, to);

        if (action != null && !action.isEmpty()) {
            com.magbo.access.models.AccessAction act =
                    com.magbo.access.models.AccessAction.valueOf(action);
            logs = logs.stream()
                    .filter(l -> l.getAction() == act)
                    .collect(java.util.stream.Collectors.toList());
        }
        if (logs.size() > limit) {
            logs = logs.subList(0, limit);
        }
        return logs;
    }

    @GetMapping("/refectory/meals")
    public java.util.List<com.magbo.access.dto.RefectoryMeal> refectoryMeals(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {

        java.util.List<String> refIds = java.util.List.of("REFEI1", "REFEI2", "CANTINA1");

        java.time.LocalDateTime from = (dateFrom != null && !dateFrom.isEmpty())
                ? java.time.LocalDate.parse(dateFrom).atStartOfDay()
                : java.time.LocalDate.now().atStartOfDay();
        java.time.LocalDateTime to = (dateTo != null && !dateTo.isEmpty())
                ? java.time.LocalDate.parse(dateTo).atTime(23, 59, 59)
                : java.time.LocalDateTime.now();

        java.util.List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(refIds, from, to);

        // agrupa por (userId + dia), ordena cronológico, pareia 1a entrada + 1a saída seguinte
        java.util.Map<String, java.util.List<AccessLog>> byUserDay = new java.util.HashMap<>();
        java.time.format.DateTimeFormatter dayFmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd");
        for (AccessLog log : logs) {
            String day = log.getTimestamp().format(dayFmt);
            String key = log.getUserId() + "|" + day;
            byUserDay.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(log);
        }

        java.time.format.DateTimeFormatter hm = java.time.format.DateTimeFormatter.ofPattern("HH:mm");
        java.util.List<com.magbo.access.dto.RefectoryMeal> meals = new java.util.ArrayList<>();

        for (java.util.Map.Entry<String, java.util.List<AccessLog>> entry : byUserDay.entrySet()) {
            java.util.List<AccessLog> dayLogs = entry.getValue();
            dayLogs.sort(java.util.Comparator.comparing(AccessLog::getTimestamp)); // cronológico

            AccessLog entrada = null, saida = null;
            for (AccessLog l : dayLogs) {
                if (entrada == null && l.getAction() == com.magbo.access.models.AccessAction.ENTRADA) {
                    entrada = l;
                } else if (entrada != null && saida == null && l.getAction() == com.magbo.access.models.AccessAction.SAIDA) {
                    saida = l;
                    break;
                }
            }
            if (entrada == null) continue; // só saída solta, ignora

            String userId = entrada.getUserId();
            User u = userRepository.findById(userId).orElse(null);
            String day = entrada.getTimestamp().format(dayFmt);

            Integer duration = null;
            String exitTime = null;
            boolean exitRegistered = false;
            if (saida != null) {
                exitTime = saida.getTimestamp().format(hm);
                exitRegistered = true;
                duration = (int) java.time.Duration.between(entrada.getTimestamp(), saida.getTimestamp()).toMinutes();
            }

            meals.add(com.magbo.access.dto.RefectoryMeal.builder()
                    .userId(userId)
                    .nome(u != null ? u.getNome() : userId)
                    .turma(u != null ? u.getTurma() : "")
                    .date(day)
                    .entryTime(entrada.getTimestamp().format(hm))
                    .exitTime(exitTime)
                    .durationMinutes(duration)
                    .onTime(entrada.getFlag() == null)   // flag null = entrou na hora certa
                    .exitRegistered(exitRegistered)
                    .build());
        }

        // ordena por data desc, depois por hora de entrada
        meals.sort(java.util.Comparator
                .comparing(com.magbo.access.dto.RefectoryMeal::getDate).reversed()
                .thenComparing(com.magbo.access.dto.RefectoryMeal::getEntryTime));

        return meals;
    }

    @GetMapping("/logs/{pointId}")
    public ResponseEntity<List<AccessLog>> getLogsByPoint(@PathVariable String pointId) {
        List<AccessLog> logs = accessLogRepository.findByPointIdOrderByTimestampDesc(pointId);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/logs/all")
    public ResponseEntity<List<AccessLog>> getAllRecentLogs(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String pointId,
            @RequestParam(required = false) String action,
            @RequestParam(defaultValue = "50") Integer limit) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        Pageable pageable = PageRequest.of(0, safeLimit);

        LocalDateTime start = null;
        LocalDateTime end = null;
        if (dateFrom != null && !dateFrom.isBlank()) {
            start = java.time.LocalDate.parse(dateFrom).atStartOfDay();
        }
        if (dateTo != null && !dateTo.isBlank()) {
            end = java.time.LocalDate.parse(dateTo).atTime(23, 59, 59);
        }

        com.magbo.access.models.AccessAction actionEnum = null;
        if (action != null && !action.isBlank()) {
            try {
                actionEnum = com.magbo.access.models.AccessAction.valueOf(action.toUpperCase());
            } catch (Exception ignored) {}
        }

        List<AccessLog> logs = accessLogRepository.findFilteredLogs(start, end, pointId, actionEnum, pageable);
        return ResponseEntity.ok(logs);
    }

    private static final int INFIRMARY_LONG_STAY_MIN = 30;

    @GetMapping("/infirmary/visits")
    public java.util.List<com.magbo.access.dto.InfirmaryVisit> infirmaryVisits(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {

        java.util.List<String> infIds = java.util.List.of("ENFERM");

        java.time.LocalDateTime from = (dateFrom != null && !dateFrom.isEmpty())
                ? java.time.LocalDate.parse(dateFrom).atStartOfDay()
                : java.time.LocalDate.now().atStartOfDay();
        java.time.LocalDateTime to = (dateTo != null && !dateTo.isEmpty())
                ? java.time.LocalDate.parse(dateTo).atTime(23, 59, 59)
                : java.time.LocalDateTime.now();

        java.util.List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(infIds, from, to);

        java.util.Map<String, java.util.List<AccessLog>> byUserDay = new java.util.HashMap<>();
        java.time.format.DateTimeFormatter dayFmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd");
        for (AccessLog log : logs) {
            String day = log.getTimestamp().format(dayFmt);
            String key = log.getUserId() + "|" + day;
            byUserDay.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(log);
        }

        java.time.format.DateTimeFormatter hm = java.time.format.DateTimeFormatter.ofPattern("HH:mm");
        java.util.List<com.magbo.access.dto.InfirmaryVisit> visits = new java.util.ArrayList<>();

        for (java.util.Map.Entry<String, java.util.List<AccessLog>> entry : byUserDay.entrySet()) {
            java.util.List<AccessLog> dayLogs = entry.getValue();
            dayLogs.sort(java.util.Comparator.comparing(AccessLog::getTimestamp));

            AccessLog entrada = null, saida = null;
            for (AccessLog l : dayLogs) {
                if (entrada == null && l.getAction() == com.magbo.access.models.AccessAction.ENTRADA) {
                    entrada = l;
                } else if (entrada != null && saida == null && l.getAction() == com.magbo.access.models.AccessAction.SAIDA) {
                    saida = l;
                    break;
                }
            }
            if (entrada == null) continue;

            String userId = entrada.getUserId();
            User u = userRepository.findById(userId).orElse(null);
            String day = entrada.getTimestamp().format(dayFmt);

            Integer duration = null;
            String exitTime = null;
            boolean exitRegistered = false;
            boolean longStay = false;
            if (saida != null) {
                exitTime = saida.getTimestamp().format(hm);
                exitRegistered = true;
                duration = (int) java.time.Duration.between(entrada.getTimestamp(), saida.getTimestamp()).toMinutes();
                longStay = duration > INFIRMARY_LONG_STAY_MIN;
            }

            visits.add(com.magbo.access.dto.InfirmaryVisit.builder()
                    .userId(userId)
                    .nome(u != null ? u.getNome() : userId)
                    .turma(u != null ? u.getTurma() : "")
                    .date(day)
                    .entryTime(entrada.getTimestamp().format(hm))
                    .exitTime(exitTime)
                    .durationMinutes(duration)
                    .longStay(longStay)
                    .exitRegistered(exitRegistered)
                    .build());
        }

        visits.sort(java.util.Comparator
                .comparing(com.magbo.access.dto.InfirmaryVisit::getDate).reversed()
                .thenComparing(com.magbo.access.dto.InfirmaryVisit::getEntryTime));

        return visits;
    }
}
