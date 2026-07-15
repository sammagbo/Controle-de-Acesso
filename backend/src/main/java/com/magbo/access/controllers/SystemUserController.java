package com.magbo.access.controllers;

import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.Role;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/system-users")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class SystemUserController {

    private final SystemUserRepository repo;
    private final PasswordEncoder encoder;

    @GetMapping
    public List<Map<String, Object>> list() {
        return repo.findAll().stream().map(u -> Map.<String, Object>of(
                "id", u.getId(),
                "username", u.getUsername(),
                "nomeCompleto", u.getNomeCompleto(),
                "role", u.getRole().name(),
                "setoresPermitidos", u.getSetoresPermitidos() != null ? u.getSetoresPermitidos() : "",
                "permissoes", u.getPermissoes() != null ? u.getPermissoes() : "",
                "ativo", u.getAtivo(),
                "lastLogin", u.getLastLogin() != null ? u.getLastLogin().toString() : ""
        )).toList();
    }

    private void validatePermissoes(String permissoes) {
        if (permissoes == null || permissoes.isBlank()) return;
        String[] parts = permissoes.split(",");
        for (String p : parts) {
            String val = p.trim();
            if (!val.equals("*") &&
                !val.equals(com.magbo.access.security.Permissions.MEAL_ENTITLEMENT_WRITE) &&
                !val.equals(com.magbo.access.security.Permissions.EXIT_PERMISSION_WRITE) &&
                !val.equals(com.magbo.access.security.Permissions.ATTEMPTS_READ)) {
                throw new IllegalArgumentException("Permissão inválida: " + val + ". Valores válidos: *, MEAL_ENTITLEMENT_WRITE, EXIT_PERMISSION_WRITE, ATTEMPTS_READ");
            }
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody CreateUserDto dto) {
        if (repo.existsByUsername(dto.getUsername())) {
            return ResponseEntity.status(409).body(Map.of("error", "Username já existe"));
        }
        try {
            validatePermissoes(dto.getPermissoes());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }

        SystemUser u = SystemUser.builder()
                .username(dto.getUsername())
                .passwordHash(encoder.encode(dto.getPassword()))
                .nomeCompleto(dto.getNomeCompleto())
                .role(Role.valueOf(dto.getRole().toUpperCase()))
                .setoresPermitidos(dto.getSetoresPermitidos())
                .permissoes(dto.getPermissoes())
                .ativo(true)
                .build();
        repo.save(u);
        return ResponseEntity.ok(Map.of("id", u.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody UpdateUserDto dto) {
        SystemUser u = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Não encontrado"));

        try {
            if (dto.getPermissoes() != null) validatePermissoes(dto.getPermissoes());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }

        if (dto.getNomeCompleto() != null) u.setNomeCompleto(dto.getNomeCompleto());
        if (dto.getRole() != null) u.setRole(Role.valueOf(dto.getRole().toUpperCase()));
        if (dto.getSetoresPermitidos() != null) u.setSetoresPermitidos(dto.getSetoresPermitidos());
        if (dto.getPermissoes() != null) u.setPermissoes(dto.getPermissoes());
        if (dto.getAtivo() != null) u.setAtivo(dto.getAtivo());
        if (dto.getNewPassword() != null && !dto.getNewPassword().isBlank()) {
            u.setPasswordHash(encoder.encode(dto.getNewPassword()));
        }
        repo.save(u);
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deactivate(@PathVariable Long id) {
        SystemUser u = repo.findById(id).orElseThrow();
        u.setAtivo(false);
        repo.save(u);
        return ResponseEntity.ok(Map.of("status", "deactivated"));
    }

    @Data
    public static class CreateUserDto {
        private String username;
        private String password;
        private String nomeCompleto;
        private String role;
        private String setoresPermitidos;
        private String permissoes;
    }

    @Data
    public static class UpdateUserDto {
        private String nomeCompleto;
        private String role;
        private String setoresPermitidos;
        private String permissoes;
        private Boolean ativo;
        private String newPassword;
    }
}
