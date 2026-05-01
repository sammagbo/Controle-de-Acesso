package com.magbo.access.controllers;

import com.magbo.access.dto.AdminVerifyRequest;
import com.magbo.access.dto.AdminVerifyResponse;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
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

    @PostMapping("/verify")
    public ResponseEntity<AdminVerifyResponse> verify(@Valid @RequestBody AdminVerifyRequest request) {
        boolean valid = configuredPin != null && configuredPin.equals(request.getPin());

        if (valid) {
            log.info("Acesso admin liberado");
        } else {
            log.warn("Tentativa de acesso admin com PIN inválido");
        }

        AdminVerifyResponse response = AdminVerifyResponse.builder()
                .valid(valid)
                .message(valid ? "Acesso liberado" : "PIN incorreto")
                .build();

        return ResponseEntity.ok(response);
    }
}
