package com.magbo.access.controllers;

import com.magbo.access.models.Responsavel;
import com.magbo.access.models.User;
import com.magbo.access.repositories.ResponsavelRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
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
}
