package com.magbo.access.controllers;

import com.magbo.access.models.User;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/admin/hikvision-mapping")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class HikvisionMappingController {

    private final UserRepository userRepository;

    @GetMapping
    public List<MappingDto> list() {
        return userRepository.findAll().stream()
                .filter(u -> u.getHikvisionEmployeeId() != null)
                .map(u -> new MappingDto(u.getId(), u.getNome(), u.getHikvisionEmployeeId()))
                .toList();
    }

    @GetMapping("/unmapped")
    public List<MappingDto> listUnmapped() {
        return userRepository.findAll().stream()
                .filter(u -> u.getHikvisionEmployeeId() == null && Boolean.TRUE.equals(u.getAtivo()))
                .map(u -> new MappingDto(u.getId(), u.getNome(), null))
                .toList();
    }

    @PutMapping("/{userId}")
    public ResponseEntity<MappingDto> setMapping(
            @PathVariable String userId,
            @RequestBody Map<String, String> body) {

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        String hikId = body.get("hikvisionEmployeeId");
        if (hikId != null) hikId = hikId.trim();
        if (hikId != null && hikId.isEmpty()) hikId = null;

        if (hikId != null) {
            Optional<User> existing = userRepository.findByHikvisionEmployeeId(hikId);
            if (existing.isPresent() && !existing.get().getId().equals(userId)) {
                return ResponseEntity.status(409).build();
            }
        }

        User user = userOpt.get();
        user.setHikvisionEmployeeId(hikId);
        userRepository.save(user);

        return ResponseEntity.ok(new MappingDto(user.getId(), user.getNome(), user.getHikvisionEmployeeId()));
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> clearMapping(@PathVariable String userId) {
        return userRepository.findById(userId)
                .map(user -> {
                    user.setHikvisionEmployeeId(null);
                    userRepository.save(user);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElse(ResponseEntity.notFound().<Void>build());
    }

    public record MappingDto(String userId, String nome, String hikvisionEmployeeId) {}
}
