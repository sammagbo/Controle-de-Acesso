package com.magbo.access.controllers;

import com.magbo.access.models.PasswordResetRequest;
import com.magbo.access.repositories.PasswordResetRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * "ESQUECI A SENHA" de um sistema offline: um pedido REGISTRADO, não um e-mail.
 *
 * A criação é o único caminho sem autenticação (quem pede é justamente quem
 * não consegue entrar), e por isso carrega três guardas:
 *
 *  1. RESPOSTA SEMPRE IGUAL — username existente, inexistente ou repetido
 *     recebem o mesmo 200 genérico. Um endpoint público que responda
 *     diferente é uma lista de contas para quem enumerar.
 *  2. DEDUPE — um pendente por username (case-insensitive): pedir de novo
 *     atualiza a data do pedido existente, não cria fila.
 *  3. TETO de pendentes — além de {@link #MAX_PENDENTES}, o pedido é aceito
 *     na resposta e descartado com WARN no log. Rede interna não é imune a
 *     um script travado num teclado.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class PasswordResetRequestController {

    static final int MAX_PENDENTES = 200;

    private final PasswordResetRequestRepository repo;

    /** A criação — SEM autenticação (liberada no SecurityConfig). */
    @PostMapping("/api/auth/password-reset-request")
    public ResponseEntity<Map<String, String>> criar(@RequestBody Map<String, String> body) {
        String username = body == null ? null : body.get("username");
        String limpo = username == null ? "" : username.trim();
        // A resposta genérica de sempre — inclusive para pedido vazio: o
        // formulário da tela já valida, e o endpoint não dá dica nenhuma.
        Map<String, String> generica = Map.of(
                "message", "Demande enregistrée. Un administrateur va vous contacter.");
        if (limpo.isEmpty() || limpo.length() > 50) {
            return ResponseEntity.ok(generica);
        }

        var pendente = repo.findFirstByUsernameIgnoreCaseAndStatus(
                limpo, PasswordResetRequest.Status.PENDING);
        if (pendente.isPresent()) {
            PasswordResetRequest r = pendente.get();
            r.setRequestedAt(LocalDateTime.now());
            repo.save(r);
            return ResponseEntity.ok(generica);
        }

        if (repo.countByStatus(PasswordResetRequest.Status.PENDING) >= MAX_PENDENTES) {
            log.warn("Pedido de senha DESCARTADO (teto de {} pendentes): username='{}'",
                    MAX_PENDENTES, limpo);
            return ResponseEntity.ok(generica);
        }

        repo.save(PasswordResetRequest.builder()
                .username(limpo)
                .requestedAt(LocalDateTime.now())
                .status(PasswordResetRequest.Status.PENDING)
                .build());
        log.info("Pedido de redefinição de senha registrado para '{}'", limpo);
        return ResponseEntity.ok(generica);
    }

    /** A fila do admin: pendentes primeiro, mais novos primeiro. */
    @GetMapping("/api/admin/password-reset-requests")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<PasswordResetRequest>> listar() {
        return ResponseEntity.ok(repo.findTop100ByOrderByStatusAscRequestedAtDesc());
    }

    /**
     * Marca como tratado. A redefinição em si acontece na gestão de
     * operadores, que já existe — este endpoint só fecha o bilhete, com o
     * nome de quem fechou.
     */
    @PostMapping("/api/admin/password-reset-requests/{id}/handle")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> tratar(@PathVariable Long id) {
        return repo.findById(id).map(r -> {
            r.setStatus(PasswordResetRequest.Status.HANDLED);
            r.setHandledBy(SecurityContextHolder.getContext().getAuthentication().getName());
            r.setHandledAt(LocalDateTime.now());
            repo.save(r);
            return ResponseEntity.ok(Map.of("status", "HANDLED"));
        }).orElse(ResponseEntity.notFound().build());
    }
}
