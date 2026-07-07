package com.magbo.access.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@Slf4j
public class HealthController {

    private final DataSource dataSource;

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> result = new LinkedHashMap<>();

        boolean dbUp = checkDatabase();

        result.put("status", dbUp ? "UP" : "DEGRADED");
        result.put("database", dbUp ? "CONNECTED" : "DOWN");
        result.put("service", "MAGBO Access Control Backend");
        result.put("timestamp", Instant.now().toString());
        result.put("version", "1.0.0");

        return ResponseEntity.ok(result);
    }

    private boolean checkDatabase() {
        try (Connection conn = dataSource.getConnection()) {
            return conn.isValid(3); // 3-second timeout
        } catch (Exception e) {
            log.warn("Database health check failed: {}", e.getMessage());
            return false;
        }
    }
}
