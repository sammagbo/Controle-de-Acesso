package com.magbo.access.controllers;

import com.magbo.access.dto.AdminVerifyRequest;
import com.magbo.access.dto.AdminVerifyResponse;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@Slf4j
public class AdminController {

    @Value("${admin.pin}")
    private String configuredPin;

    private static final java.util.concurrent.atomic.AtomicInteger PIN_FAILURES =
            new java.util.concurrent.atomic.AtomicInteger(0);
    private static volatile long pinLockedUntil = 0L;

    @PostMapping("/verify")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<AdminVerifyResponse> verify(@Valid @RequestBody AdminVerifyRequest request) {
        long now = System.currentTimeMillis();
        if (now < pinLockedUntil) {
            log.warn("Tentativa de acesso admin durante lockout");
            return ResponseEntity.ok(AdminVerifyResponse.builder()
                    .valid(false)
                    .message("Trop de tentatives. R\u00e9essayez dans 1 minute.")
                    .build());
        }

        boolean valid = configuredPin != null && request.getPin() != null
                && java.security.MessageDigest.isEqual(
                        configuredPin.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                        request.getPin().getBytes(java.nio.charset.StandardCharsets.UTF_8));

        if (valid) {
            PIN_FAILURES.set(0);
            log.info("Acesso admin liberado");
        } else {
            int f = PIN_FAILURES.incrementAndGet();
            if (f >= 5) {
                pinLockedUntil = now + 60_000L;
                PIN_FAILURES.set(0);
                log.warn("PIN inv\u00e1lido \u2014 5 falhas consecutivas, lockout de 60s ativado");
            } else {
                log.warn("Tentativa de acesso admin com PIN inv\u00e1lido ({}/5)", f);
            }
        }

        AdminVerifyResponse response = AdminVerifyResponse.builder()
                .valid(valid)
                .message(valid ? "Acesso liberado" : "PIN incorreto")
                .build();

        return ResponseEntity.ok(response);
    }
}
