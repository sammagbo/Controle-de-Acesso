package com.magbo.access.controllers;

import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

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

    @PostMapping("/import-match")
    public ResponseEntity<MatchReport> importAndMatch(@RequestParam("file") MultipartFile file) {
        MatchReport report = new MatchReport();

        Map<String, List<User>> magboByTokens = new HashMap<>();
        for (User u : userRepository.findAll()) {
            if (u.getTipo() == UserType.ALUNO && u.getNome() != null) {
                magboByTokens.computeIfAbsent(tokenSet(u.getNome()), k -> new ArrayList<>()).add(u);
            }
        }

        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean first = true;
            while ((line = br.readLine()) != null) {
                if (first) { first = false; continue; }
                if (line.trim().isEmpty()) continue;

                String[] parts = line.split(";", -1);
                if (parts.length < 2) continue;
                String hikId = parts[0].trim();
                String nome = parts[1].trim();
                if (hikId.isEmpty() || nome.isEmpty()) continue;

                List<User> candidates = magboByTokens.get(tokenSet(nome));

                if (candidates == null || candidates.isEmpty()) {
                    report.notMatched.add(hikId + ";" + nome);
                } else if (candidates.size() > 1) {
                    report.ambiguous.add(hikId + ";" + nome + " -> " +
                            candidates.stream().map(User::getId).collect(Collectors.joining(",")));
                } else {
                    User u = candidates.get(0);
                    var existing = userRepository.findByHikvisionEmployeeId(hikId);
                    if (existing.isPresent() && !existing.get().getId().equals(u.getId())) {
                        report.ambiguous.add(hikId + ";" + nome + " -> hikId ja usado por " + existing.get().getId());
                    } else if (hikId.equals(u.getHikvisionEmployeeId())) {
                        report.alreadyMapped.add(u.getId() + ";" + u.getNome());
                    } else {
                        u.setHikvisionEmployeeId(hikId);
                        userRepository.save(u);
                        report.matched.add(u.getId() + ";" + u.getNome() + " <- " + hikId);
                    }
                }
            }
        } catch (Exception e) {
            return ResponseEntity.status(500).body(report);
        }

        return ResponseEntity.ok(report);
    }

    private String tokenSet(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s.toLowerCase().trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replaceAll("[^a-z0-9 ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return java.util.Arrays.stream(n.split(" ")).sorted().collect(Collectors.joining(" "));
    }

    public static class MatchReport {
        public List<String> matched = new ArrayList<>();
        public List<String> notMatched = new ArrayList<>();
        public List<String> ambiguous = new ArrayList<>();
        public List<String> alreadyMapped = new ArrayList<>();
        public int getMatchedCount() { return matched.size(); }
        public int getNotMatchedCount() { return notMatched.size(); }
        public int getAmbiguousCount() { return ambiguous.size(); }
        public int getAlreadyMappedCount() { return alreadyMapped.size(); }
    }

    public record MappingDto(String userId, String nome, String hikvisionEmployeeId) {}
}
