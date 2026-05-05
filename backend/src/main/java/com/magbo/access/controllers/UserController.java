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
}
