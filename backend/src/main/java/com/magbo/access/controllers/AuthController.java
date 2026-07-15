package com.magbo.access.controllers;

import com.magbo.access.dto.auth.LoginRequest;
import com.magbo.access.dto.auth.LoginResponse;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.JwtService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthenticationManager authManager;
    private final SystemUserRepository userRepo;
    private final JwtService jwtService;

    @Value("${magbo.jwt.expiration-ms:28800000}")
    private long expirationMs;

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req) {
        try {
            authManager.authenticate(
                    new UsernamePasswordAuthenticationToken(req.getUsername(), req.getPassword())
            );
        } catch (Exception e) {
            log.warn("Tentativa de login inválida: username={}", req.getUsername());
            Map<String, String> error = new HashMap<>();
            error.put("error", "Credenciais inválidas");
            return ResponseEntity.status(401).body(error);
        }

        SystemUser user = userRepo.findByUsername(req.getUsername()).orElseThrow();
        user.setLastLogin(LocalDateTime.now());
        userRepo.save(user);

        String token = jwtService.generateToken(user);
        log.info("Login bem-sucedido: {} ({})", user.getUsername(), user.getRole());

        return ResponseEntity.ok(LoginResponse.builder()
                .token(token)
                .username(user.getUsername())
                .nomeCompleto(user.getNomeCompleto())
                .role(user.getRole().name())
                .setoresPermitidos(user.getSetoresPermitidos())
                .permissoes(user.getPermissoes())
                .expiresInMs(expirationMs)
                .build());
    }

    @GetMapping("/me")
    public ResponseEntity<?> me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return ResponseEntity.status(401).build();
        }
        SystemUser user = userRepo.findByUsername(auth.getName()).orElseThrow();
        return ResponseEntity.ok(Map.of(
                "username", user.getUsername(),
                "nomeCompleto", user.getNomeCompleto(),
                "role", user.getRole().name(),
                "setoresPermitidos", user.getSetoresPermitidos() != null ? user.getSetoresPermitidos() : "",
                "permissoes", user.getPermissoes() != null ? user.getPermissoes() : ""
        ));
    }
}
