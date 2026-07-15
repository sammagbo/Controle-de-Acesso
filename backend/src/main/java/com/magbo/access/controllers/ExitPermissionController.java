package com.magbo.access.controllers;

import com.magbo.access.dto.ExitPermissionDto;
import com.magbo.access.dto.ExitPermissionRequest;
import com.magbo.access.models.ExitPermissionStatus;
import com.magbo.access.models.ExitPermissionType;
import com.magbo.access.models.StudentExitPermission;
import com.magbo.access.models.User;
import com.magbo.access.repositories.StudentExitPermissionRepository;
import com.magbo.access.services.ExitPermissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/exit-permissions")
@RequiredArgsConstructor
public class ExitPermissionController {

    private final ExitPermissionService exitPermissionService;
    private final StudentExitPermissionRepository repository;

    @GetMapping
    @PreAuthorize("@areaSecurity.can('portail')")
    public ResponseEntity<Page<ExitPermissionDto>> getFiltered(
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) ExitPermissionStatus status,
            @RequestParam(required = false) ExitPermissionType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        
        if (size > 200) size = 200;

        Page<Object[]> result = repository.findFiltered(userId, status, type, from, to, PageRequest.of(page, size));
        
        Page<ExitPermissionDto> dtoPage = result.map(row -> {
            StudentExitPermission p = (StudentExitPermission) row[0];
            String nome = (String) row[1];
            String turma = (String) row[2];
            return toDto(p, nome, turma);
        });

        return ResponseEntity.ok(dtoPage);
    }

    @GetMapping("/active")
    @PreAuthorize("@areaSecurity.can('portail')")
    public ResponseEntity<List<ExitPermissionDto>> getActive() {
        return ResponseEntity.ok(repository.findByStatusOrderByCreatedAtDesc(ExitPermissionStatus.ACTIVE).stream()
                .map(p -> toDto(p, null, null)) // TODO: fetch names if needed
                .toList());
    }

    @GetMapping("/user/{userId}")
    @PreAuthorize("@areaSecurity.can('portail')")
    public ResponseEntity<List<ExitPermissionDto>> getByUser(@PathVariable String userId) {
        return ResponseEntity.ok(repository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(p -> toDto(p, null, null))
                .toList());
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('EXIT_PERMISSION_WRITE')")
    public ResponseEntity<?> create(@Valid @RequestBody ExitPermissionRequest req) {
        try {
            String createdBy = SecurityContextHolder.getContext().getAuthentication().getName();
            StudentExitPermission saved = exitPermissionService.create(req, createdBy);
            return ResponseEntity.ok(toDto(saved, null, null));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    public static class RevokeRequest {
        public String note;
    }

    @PostMapping("/{id}/revoke")
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('EXIT_PERMISSION_WRITE')")
    public ResponseEntity<?> revoke(@PathVariable Long id, @RequestBody(required = false) RevokeRequest req) {
        try {
            String revokedBy = SecurityContextHolder.getContext().getAuthentication().getName();
            String note = req != null ? req.note : null;
            StudentExitPermission revoked = exitPermissionService.revoke(id, revokedBy, note);
            return ResponseEntity.ok(toDto(revoked, null, null));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    private ExitPermissionDto toDto(StudentExitPermission p, String nome, String turma) {
        return ExitPermissionDto.builder()
                .id(p.getId())
                .userId(p.getUserId())
                .nome(nome)
                .turma(turma)
                .permissionType(p.getPermissionType())
                .validFrom(p.getValidFrom())
                .validUntil(p.getValidUntil())
                .startTime(p.getStartTime())
                .endTime(p.getEndTime())
                .daysOfWeek(p.getDaysOfWeek())
                .status(p.getStatus())
                .reason(p.getReason())
                .note(p.getNote())
                .createdBy(p.getCreatedBy())
                .createdAt(p.getCreatedAt())
                .revokedBy(p.getRevokedBy())
                .revokedAt(p.getRevokedAt())
                .usedAt(p.getUsedAt())
                .build();
    }
}
