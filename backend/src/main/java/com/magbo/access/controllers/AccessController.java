package com.magbo.access.controllers;

import com.magbo.access.dto.AccessRequest;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.SystemUserRepository;
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
}
