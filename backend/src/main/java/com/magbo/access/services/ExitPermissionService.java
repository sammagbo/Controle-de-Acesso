package com.magbo.access.services;

import com.magbo.access.dto.ExitDecision;
import com.magbo.access.dto.ExitPermissionRequest;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.ExitPermissionStatus;
import com.magbo.access.models.ExitPermissionType;
import com.magbo.access.models.StudentExitPermission;
import com.magbo.access.repositories.StudentExitPermissionRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ExitPermissionService {

    private final StudentExitPermissionRepository permissionRepository;
    private final UserRepository userRepository;

    public ExitDecision evaluate(String userId, LocalDateTime now) {
        List<StudentExitPermission> actives = permissionRepository.findByUserIdAndStatus(userId, ExitPermissionStatus.ACTIVE);

        if (actives.isEmpty()) {
            return new ExitDecision(false, DenialReason.EXIT_NOT_AUTHORIZED, null, null);
        }

        // Ordenar por ID para ser determinístico ao pegar a primeira
        actives.sort((p1, p2) -> p1.getId().compareTo(p2.getId()));

        for (StudentExitPermission p : actives) {
            if (isValidNow(p, now)) {
                return new ExitDecision(true, null, p.getId(), p.getPermissionType());
            }
        }

        return new ExitDecision(false, DenialReason.OUTSIDE_EXIT_WINDOW, null, null);
    }

    private boolean isValidNow(StudentExitPermission p, LocalDateTime now) {
        // 1. Janela horária
        if (p.getStartTime() != null && p.getEndTime() != null) {
            if (now.toLocalTime().isBefore(p.getStartTime()) || now.toLocalTime().isAfter(p.getEndTime())) {
                return false;
            }
        }

        // 2. Por tipo
        switch (p.getPermissionType()) {
            case PERMANENT:
                return true;
            case DATE_RANGE:
                if (p.getValidFrom() != null && p.getValidUntil() != null) {
                    return !now.toLocalDate().isBefore(p.getValidFrom()) && !now.toLocalDate().isAfter(p.getValidUntil());
                }
                return false; // se falta data, é inválida
            case RECURRING:
                if (p.getDaysOfWeek() != null && !p.getDaysOfWeek().isEmpty()) {
                    try {
                        Set<Integer> allowedDays = Arrays.stream(p.getDaysOfWeek().split(","))
                                .map(String::trim)
                                .map(Integer::parseInt)
                                .collect(Collectors.toSet());
                        int currentDayIso = now.getDayOfWeek().getValue();
                        if (!allowedDays.contains(currentDayIso)) {
                            return false;
                        }
                    } catch (Exception e) {
                        return false;
                    }
                } else {
                    return false;
                }
                // Check dates if present
                if (p.getValidFrom() != null && now.toLocalDate().isBefore(p.getValidFrom())) {
                    return false;
                }
                if (p.getValidUntil() != null && now.toLocalDate().isAfter(p.getValidUntil())) {
                    return false;
                }
                return true;
            case SINGLE:
                return p.getStatus() == ExitPermissionStatus.ACTIVE;
            default:
                return false;
        }
    }

    @Transactional
    public void consumeIfSingle(Long permissionId) {
        Optional<StudentExitPermission> opt = permissionRepository.findById(permissionId);
        if (opt.isPresent()) {
            StudentExitPermission p = opt.get();
            if (p.getPermissionType() == ExitPermissionType.SINGLE && p.getStatus() == ExitPermissionStatus.ACTIVE) {
                p.setStatus(ExitPermissionStatus.USED);
                p.setUsedAt(LocalDateTime.now());
                permissionRepository.save(p);
                log.info("Consumed SINGLE exit permission id={}", p.getId());
            }
        }
    }

    @Transactional
    public StudentExitPermission create(ExitPermissionRequest req, String createdBy) {
        if (!userRepository.existsById(req.getUserId())) {
            throw new IllegalArgumentException("Aluno não encontrado: " + req.getUserId());
        }
        if (req.getReason() == null || req.getReason().isBlank()) {
            throw new IllegalArgumentException("reason é obrigatório");
        }
        if (req.getPermissionType() == ExitPermissionType.DATE_RANGE) {
            if (req.getValidFrom() == null || req.getValidUntil() == null) {
                throw new IllegalArgumentException("validFrom e validUntil são obrigatórios para DATE_RANGE");
            }
        }
        if (req.getValidFrom() != null && req.getValidUntil() != null) {
            if (req.getValidFrom().isAfter(req.getValidUntil())) {
                throw new IllegalArgumentException("validFrom não pode ser posterior a validUntil");
            }
        }
        if (req.getPermissionType() == ExitPermissionType.RECURRING) {
            if (req.getDaysOfWeek() == null || req.getDaysOfWeek().isBlank()) {
                throw new IllegalArgumentException("daysOfWeek é obrigatório para RECURRING");
            }
            try {
                Set<Integer> days = Arrays.stream(req.getDaysOfWeek().split(","))
                        .map(String::trim)
                        .map(Integer::parseInt)
                        .collect(Collectors.toSet());
                for (Integer d : days) {
                    if (d < 1 || d > 7) throw new IllegalArgumentException();
                }
            } catch (Exception e) {
                throw new IllegalArgumentException("daysOfWeek deve ser uma lista separada por vírgulas de 1 a 7");
            }
        }
        if (req.getStartTime() != null || req.getEndTime() != null) {
            if (req.getStartTime() == null || req.getEndTime() == null) {
                throw new IllegalArgumentException("Ambos startTime e endTime devem ser informados se um deles for preenchido");
            }
            if (req.getStartTime().isAfter(req.getEndTime())) {
                throw new IllegalArgumentException("startTime deve ser antes de endTime");
            }
        }

        StudentExitPermission p = StudentExitPermission.builder()
                .userId(req.getUserId())
                .permissionType(req.getPermissionType())
                .validFrom(req.getValidFrom())
                .validUntil(req.getValidUntil())
                .startTime(req.getStartTime())
                .endTime(req.getEndTime())
                .daysOfWeek(req.getDaysOfWeek())
                .status(ExitPermissionStatus.ACTIVE)
                .reason(req.getReason())
                .note(req.getNote())
                .createdBy(createdBy)
                .build();

        StudentExitPermission saved = permissionRepository.save(p);
        log.info("Created exit permission id={}, type={}, user={}, by={}", saved.getId(), saved.getPermissionType(), saved.getUserId(), createdBy);
        return saved;
    }

    @Transactional
    public StudentExitPermission revoke(Long id, String revokedBy, String note) {
        StudentExitPermission p = permissionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Permissão não encontrada"));

        if (p.getStatus() == ExitPermissionStatus.REVOKED) {
            throw new IllegalArgumentException("Permissão já revogada");
        }

        p.setStatus(ExitPermissionStatus.REVOKED);
        p.setRevokedBy(revokedBy);
        p.setRevokedAt(LocalDateTime.now());
        
        if (note != null && !note.isBlank()) {
            if (p.getNote() != null) {
                p.setNote(p.getNote() + " | Revoked: " + note);
            } else {
                p.setNote("Revoked: " + note);
            }
        }
        
        StudentExitPermission saved = permissionRepository.save(p);
        log.info("Revoked exit permission id={} by={}", saved.getId(), revokedBy);
        return saved;
    }
}
