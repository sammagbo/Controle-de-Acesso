package com.magbo.access.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * Fase 3 — gate de deploy: avisa no startup (perfil prod) enquanto
 * segredos de desenvolvimento estiverem em uso.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProdSecurityStartupCheck {

    private static final String DEV_DB_PASSWORD = "magbo_dev_pass_2026";
    private static final String DEV_JWT_SECRET =
            "ZGV2U2VjcmV0Q2hhbmdlSW5Qcm9kdWN0aW9uV2l0aEVudlZhckxvbmdFbm91Z2hGb3JIUzM4NEFsZ29yaXRobVNlY3VyZUtleQ==";

    private final Environment environment;

    @Value("${spring.datasource.password:}")
    private String dbPassword;

    @Value("${magbo.jwt.secret:}")
    private String jwtSecret;

    @Value("${magbo.webhook.token:}")
    private String webhookToken;

    @EventListener(ApplicationReadyEvent.class)
    public void checkProdSecrets() {
        boolean prod = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        if (!prod) return;

        if (DEV_DB_PASSWORD.equals(dbPassword)) {
            log.warn("SECURITY [prod]: senha de banco de DEV em uso. Defina MAGBO_DB_PASSWORD e troque a senha do Postgres antes do deploy real.");
        }
        if (DEV_JWT_SECRET.equals(jwtSecret)) {
            log.warn("SECURITY [prod]: JWT secret de DEV em uso. Defina MAGBO_JWT_SECRET (>= 48 bytes aleatorios, base64) antes do deploy real.");
        }
        if (webhookToken == null || webhookToken.isBlank()) {
            log.warn("SECURITY [prod]: MAGBO_WEBHOOK_TOKEN nao configurado — webhook Hikvision em deny-by-default (nenhum evento sera aceito).");
        }
    }
}
