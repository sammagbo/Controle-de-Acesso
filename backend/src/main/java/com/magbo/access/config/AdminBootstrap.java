package com.magbo.access.config;

import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.Role;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class AdminBootstrap implements CommandLineRunner {

    private final SystemUserRepository repo;
    private final PasswordEncoder encoder;

    @Value("${magbo.admin.username:admin}")
    private String adminUsername;

    @Value("${magbo.admin.password:admin1234}")
    private String adminPassword;

    @Value("${magbo.admin.nome:Administrador}")
    private String adminNome;

    @Override
    public void run(String... args) {
        if (repo.existsByUsername(adminUsername)) {
            log.info("Admin '{}' já existe, pulando bootstrap.", adminUsername);
            return;
        }

        SystemUser admin = SystemUser.builder()
                .username(adminUsername)
                .passwordHash(encoder.encode(adminPassword))
                .nomeCompleto(adminNome)
                .role(Role.ADMIN)
                .setoresPermitidos("*")
                .ativo(true)
                .build();

        repo.save(admin);
        log.warn("⚠️  Admin inicial criado: {} (TROQUE A SENHA PADRÃO)", adminUsername);
    }
}
