package com.magbo.access.controllers;

import com.magbo.access.dto.AccessRequest;
import com.magbo.access.models.AccessLog;
import com.magbo.access.repositories.AccessLogRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/access")
@RequiredArgsConstructor
public class AccessController {

    private final AccessLogRepository accessLogRepository;

    @PostMapping
    public ResponseEntity<AccessLog> registerAccess(@Valid @RequestBody AccessRequest request) {
        AccessLog log = AccessLog.builder()
                .userId(request.getUserId())
                .pointId(request.getPointId())
                .action(request.getAction())
                .timestamp(LocalDateTime.now())
                .build();

        AccessLog saved = accessLogRepository.save(log);
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
