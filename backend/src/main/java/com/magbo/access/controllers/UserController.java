package com.magbo.access.controllers;

import com.magbo.access.dto.UserListResponse;
import com.magbo.access.models.Responsavel;
import com.magbo.access.models.User;
import com.magbo.access.repositories.ResponsavelRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;
    private final ResponsavelRepository responsavelRepository;

    @GetMapping("/{id}")
    public ResponseEntity<?> getUserById(@PathVariable String id) {
        return userRepository.findById(id)
                .map(user -> {
                    Map<String, Object> response = new HashMap<>();
                    response.put("user", user);

                    if (user.getResponsavelId() != null) {
                        responsavelRepository.findById(user.getResponsavelId())
                                .ifPresent(resp -> response.put("responsavel", resp));
                    }

                    return ResponseEntity.ok(response);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    public ResponseEntity<UserListResponse> searchUsers(
            @RequestParam(name = "q", defaultValue = "") String q,
            @RequestParam(name = "limit", defaultValue = "20") Integer limit) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        Pageable pageable = PageRequest.of(0, safeLimit);
        List<User> users = q.isBlank()
            ? userRepository.findByAtivoTrue().stream().limit(safeLimit).toList()
            : userRepository.searchActive(q.trim(), pageable);
        return ResponseEntity.ok(
            UserListResponse.builder()
                .users(users)
                .total(users.size())
                .build()
        );
    }

    @GetMapping
    public ResponseEntity<UserListResponse> listActiveUsers() {
        List<User> users = userRepository.findByAtivoTrue();
        return ResponseEntity.ok(
            UserListResponse.builder()
                .users(users)
                .total(users.size())
                .build()
        );
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> createUser(@RequestBody com.magbo.access.dto.UserRegistrationDto dto) {
        Map<String, String> response = new HashMap<>();
        try {
            if ("RESPONSAVEL".equalsIgnoreCase(dto.getTipo())) {
                Responsavel responsavel = Responsavel.builder()
                        .id(dto.getId() != null && !dto.getId().isEmpty() ? dto.getId() : "USR" + System.currentTimeMillis())
                        .nome(dto.getNome())
                        .parentesco(dto.getParentesco())
                        .telefone(dto.getTelefone())
                        .fotoUrl(dto.getFotoUrl())
                        .build();
                responsavelRepository.save(responsavel);
            } else {
                com.magbo.access.models.UserType type;
                try {
                    type = com.magbo.access.models.UserType.valueOf(dto.getTipo() != null ? dto.getTipo().toUpperCase() : "ALUNO");
                } catch (Exception e) {
                    type = com.magbo.access.models.UserType.ALUNO;
                }
                
                User user = User.builder()
                        .id(dto.getId() != null && !dto.getId().isEmpty() ? dto.getId() : "USR" + System.currentTimeMillis())
                        .nome(dto.getNome())
                        .tipo(type)
                        .turma(dto.getTurma())
                        .fotoUrl(dto.getFotoUrl())
                        .responsavelId(dto.getResponsavelId())
                        .ativo(true)
                        .mealCount(0)
                        .build();
                userRepository.save(user);
            }
            response.put("status", "success");
            response.put("message", "Usuário cadastrado com sucesso!");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", "Erro ao cadastrar usuário: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // BULK IMPORT — POST /api/users/bulk
    // Receives an array of UserRegistrationDto from Excel import.
    // Sorts: RESPONSAVEL first (so aluno.responsavelId can reference them).
    // Returns detailed per-row error report.
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/bulk")
    public ResponseEntity<Map<String, Object>> createUsersBulk(
            @RequestBody List<com.magbo.access.dto.UserRegistrationDto> users) {
        Map<String, Object> response = new HashMap<>();
        List<Map<String, String>> errors = new ArrayList<>();
        int successCount = 0;

        // Sort: RESPONSAVEL first, then others (resolves responsavelId dependencies)
        users.sort((a, b) -> {
            boolean aIsResp = "RESPONSAVEL".equalsIgnoreCase(a.getTipo());
            boolean bIsResp = "RESPONSAVEL".equalsIgnoreCase(b.getTipo());
            return Boolean.compare(!aIsResp, !bIsResp);
        });

        for (int i = 0; i < users.size(); i++) {
            com.magbo.access.dto.UserRegistrationDto dto = users.get(i);
            try {
                if (dto.getNome() == null || dto.getNome().isBlank()) {
                    throw new IllegalArgumentException("Nome obrigatório");
                }
                if ("RESPONSAVEL".equalsIgnoreCase(dto.getTipo())) {
                    Responsavel r = Responsavel.builder()
                            .id(dto.getId() != null && !dto.getId().isEmpty() ? dto.getId() : "RESP" + System.currentTimeMillis() + i)
                            .nome(dto.getNome())
                            .parentesco(dto.getParentesco())
                            .telefone(dto.getTelefone())
                            .fotoUrl(dto.getFotoUrl())
                            .build();
                    responsavelRepository.save(r);
                } else {
                    com.magbo.access.models.UserType type;
                    try {
                        type = com.magbo.access.models.UserType.valueOf(
                            dto.getTipo() != null ? dto.getTipo().toUpperCase() : "ALUNO");
                    } catch (Exception e) {
                        type = com.magbo.access.models.UserType.ALUNO;
                    }
                    User u = User.builder()
                            .id(dto.getId() != null && !dto.getId().isEmpty() ? dto.getId() : "USR" + System.currentTimeMillis() + i)
                            .nome(dto.getNome())
                            .tipo(type)
                            .turma(dto.getTurma())
                            .fotoUrl(dto.getFotoUrl())
                            .responsavelId(dto.getResponsavelId())
                            .ativo(true)
                            .mealCount(0)
                            .build();
                    userRepository.save(u);
                }
                successCount++;
            } catch (Exception e) {
                Map<String, String> err = new HashMap<>();
                err.put("linha", String.valueOf(i + 2)); // +2: header is row 1 in Excel
                err.put("nome", dto.getNome() != null ? dto.getNome() : "(vazio)");
                err.put("erro", e.getMessage() != null ? e.getMessage() : "Erro desconhecido");
                errors.add(err);
            }
        }

        response.put("status", errors.isEmpty() ? "success" : "partial");
        response.put("totalRecebido", users.size());
        response.put("sucesso", successCount);
        response.put("falhas", errors.size());
        response.put("detalheErros", errors);
        return ResponseEntity.ok(response);
    }
}
