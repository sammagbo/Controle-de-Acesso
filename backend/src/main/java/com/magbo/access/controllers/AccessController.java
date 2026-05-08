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

    @GetMapping("/logs/{pointId}")
    public ResponseEntity<List<AccessLog>> getLogsByPoint(@PathVariable String pointId) {
        List<AccessLog> logs = accessLogRepository.findByPointIdOrderByTimestampDesc(pointId);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/logs/all")
    public ResponseEntity<List<AccessLog>> getAllRecentLogs(
            @RequestParam(defaultValue = "50") Integer limit) {
        // Validação: limit deve estar entre 1 e 500
        int safeLimit = Math.max(1, Math.min(limit, 500));
        Pageable pageable = PageRequest.of(0, safeLimit);
        List<AccessLog> logs = accessLogRepository.findAllByOrderByTimestampDesc(pageable);
        return ResponseEntity.ok(logs);
    }
}
