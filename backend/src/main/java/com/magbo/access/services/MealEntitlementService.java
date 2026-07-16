package com.magbo.access.services;

import com.magbo.access.dto.EntitlementDecision;
import com.magbo.access.dto.MealEntitlementDto;
import com.magbo.access.dto.MealEntitlementHistoryDto;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.MealEntitlement;
import com.magbo.access.models.MealEntitlementEvent;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.MealEntitlementEventRepository;
import com.magbo.access.repositories.MealEntitlementRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class MealEntitlementService {

    private final MealEntitlementRepository mealEntitlementRepository;
    private final MealEntitlementEventRepository mealEntitlementEventRepository;
    private final UserRepository userRepository;

    public EntitlementDecision evaluate(String userId, LocalDate date) {
        Optional<MealEntitlement> opt = mealEntitlementRepository.findById(userId);

        if (opt.isEmpty()) {
            return new EntitlementDecision(EntitlementStatus.PENDING, false, null);
        }

        MealEntitlement e = opt.get();

        if (e.getStatus() == EntitlementStatus.NOT_AUTHORIZED) {
            return new EntitlementDecision(EntitlementStatus.NOT_AUTHORIZED, false, DenialReason.MEAL_NOT_ENTITLED);
        }

        if (e.getStatus() == EntitlementStatus.PENDING) {
            return new EntitlementDecision(EntitlementStatus.PENDING, false, null);
        }

        if (e.getStatus() == EntitlementStatus.AUTHORIZED) {
            if (e.getValidFrom() != null && date.isBefore(e.getValidFrom())) {
                return new EntitlementDecision(EntitlementStatus.AUTHORIZED, false, DenialReason.MEAL_NOT_ENTITLED);
            }
            if (e.getValidUntil() != null && date.isAfter(e.getValidUntil())) {
                return new EntitlementDecision(EntitlementStatus.AUTHORIZED, false, DenialReason.MEAL_NOT_ENTITLED);
            }
            return new EntitlementDecision(EntitlementStatus.AUTHORIZED, true, null);
        }

        return new EntitlementDecision(EntitlementStatus.PENDING, false, null);
    }

    @org.springframework.context.annotation.Lazy
    @org.springframework.beans.factory.annotation.Autowired
    private MealEntitlementService self;

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public MealEntitlement upsert(String userId, EntitlementStatus status, LocalDate validFrom,
                                  LocalDate validUntil, String note, String changedBy, String source) {
        
        if (!userRepository.existsById(userId)) {
            throw new IllegalArgumentException("Aluno não encontrado: " + userId);
        }

        if (validFrom != null && validUntil != null && validFrom.isAfter(validUntil)) {
            throw new IllegalArgumentException("validFrom não pode ser posterior a validUntil");
        }

        Optional<MealEntitlement> opt = mealEntitlementRepository.findById(userId);
        
        EntitlementStatus oldStatus = null;
        LocalDate oldValidFrom = null;
        LocalDate oldValidUntil = null;
        
        MealEntitlement entitlement;
        
        if (opt.isPresent()) {
            entitlement = opt.get();
            oldStatus = entitlement.getStatus();
            oldValidFrom = entitlement.getValidFrom();
            oldValidUntil = entitlement.getValidUntil();
        } else {
            entitlement = new MealEntitlement();
            entitlement.setUserId(userId);
        }

        entitlement.setStatus(status);
        entitlement.setValidFrom(validFrom);
        entitlement.setValidUntil(validUntil);
        entitlement.setNote(note);
        entitlement.setUpdatedBy(changedBy);
        
        MealEntitlement saved = mealEntitlementRepository.save(entitlement);

        MealEntitlementEvent event = MealEntitlementEvent.builder()
                .userId(userId)
                .oldStatus(oldStatus)
                .newStatus(status)
                .oldValidFrom(oldValidFrom)
                .newValidFrom(validFrom)
                .oldValidUntil(oldValidUntil)
                .newValidUntil(validUntil)
                .changedBy(changedBy)
                .changedAt(LocalDateTime.now())
                .note(note)
                .source(source)
                .build();
                
        mealEntitlementEventRepository.save(event);

        log.info("Meal entitlement: user={}, {} -> {}, validFrom={}, validUntil={}, by={}, source={}",
                userId, oldStatus, status, validFrom, validUntil, changedBy, source);

        return saved;
    }

    public MealEntitlementDto getOrPending(String userId) {
        return mealEntitlementRepository.findById(userId)
                .map(this::toDto)
                .orElseGet(() -> MealEntitlementDto.builder()
                        .userId(userId)
                        .status(EntitlementStatus.PENDING)
                        .build());
    }

    public List<MealEntitlementHistoryDto> history(String userId) {
        return mealEntitlementEventRepository.findByUserIdOrderByChangedAtDesc(userId).stream()
                .map(e -> MealEntitlementHistoryDto.builder()
                        .changedAt(e.getChangedAt())
                        .changedBy(e.getChangedBy())
                        .oldStatus(e.getOldStatus())
                        .newStatus(e.getNewStatus())
                        .oldValidFrom(e.getOldValidFrom())
                        .oldValidUntil(e.getOldValidUntil())
                        .newValidFrom(e.getNewValidFrom())
                        .newValidUntil(e.getNewValidUntil())
                        .note(e.getNote())
                        .source(e.getSource())
                        .build())
                .toList();
    }

    public Map<String, Long> summary() {
        long authorized = mealEntitlementRepository.countByStatus(EntitlementStatus.AUTHORIZED);
        long notAuthorized = mealEntitlementRepository.countByStatus(EntitlementStatus.NOT_AUTHORIZED);
        long totalStudents = userRepository.countByTipoAndAtivoTrue(UserType.ALUNO);
        long pending = totalStudents - authorized - notAuthorized;

        return Map.of(
                "authorized", authorized,
                "notAuthorized", notAuthorized,
                "pending", pending,
                "totalStudents", totalStudents
        );
    }
    
    public Page<MealEntitlementDto> search(String q, String turma, String status, Pageable pageable) {
        Page<Object[]> page = mealEntitlementRepository.findEntitlementsWithUsers(q, turma, status, pageable);
        return page.map(row -> {
            String uId = (String) row[0];
            String uNome = (String) row[1];
            String uTurma = (String) row[2];
            String mStatus = (String) row[3];
            
            LocalDate mValidFrom = row[4] != null ? ((Date) row[4]).toLocalDate() : null;
            LocalDate mValidUntil = row[5] != null ? ((Date) row[5]).toLocalDate() : null;
            String mNote = (String) row[6];
            String mUpdatedBy = (String) row[7];
            LocalDateTime mUpdatedAt = row[8] != null ? ((Timestamp) row[8]).toLocalDateTime() : null;
            
            return MealEntitlementDto.builder()
                    .userId(uId)
                    .nome(uNome)
                    .turma(uTurma)
                    .status(EntitlementStatus.valueOf(mStatus))
                    .validFrom(mValidFrom)
                    .validUntil(mValidUntil)
                    .note(mNote)
                    .updatedBy(mUpdatedBy)
                    .updatedAt(mUpdatedAt)
                    .build();
        });
    }

    private MealEntitlementDto toDto(MealEntitlement entity) {
        return MealEntitlementDto.builder()
                .userId(entity.getUserId())
                .status(entity.getStatus())
                .validFrom(entity.getValidFrom())
                .validUntil(entity.getValidUntil())
                .note(entity.getNote())
                .updatedBy(entity.getUpdatedBy())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }

    public com.magbo.access.dto.BulkResultDto importBulk(List<com.magbo.access.dto.MealEntitlementBulkItem> items, boolean overwrite, String changedBy) {
        com.magbo.access.dto.BulkResultDto result = new com.magbo.access.dto.BulkResultDto();
        result.setTotalRecebido(items.size());

        for (int i = 0; i < items.size(); i++) {
            com.magbo.access.dto.MealEntitlementBulkItem item = items.get(i);
            int linha = i + 1;
            String uId = item.getUserId();
            
            try {
                if (uId == null || uId.isBlank()) {
                    throw new IllegalArgumentException("ID obrigatório");
                }
                if (!userRepository.existsById(uId)) {
                    throw new IllegalArgumentException("Aluno não encontrado");
                }
                
                EntitlementStatus parsedStatus;
                try {
                    if (item.getStatus() == null || item.getStatus().isBlank()) {
                        throw new IllegalArgumentException("Status obrigatório");
                    }
                    parsedStatus = EntitlementStatus.valueOf(item.getStatus().trim().toUpperCase());
                } catch (IllegalArgumentException e) {
                    throw new IllegalArgumentException("Status inválido: " + item.getStatus() + ". Válidos: AUTHORIZED, NOT_AUTHORIZED, PENDING");
                }
                
                if (item.getValidFrom() != null && item.getValidUntil() != null && item.getValidFrom().isAfter(item.getValidUntil())) {
                    throw new IllegalArgumentException("Data inicial posterior à data final");
                }
                
                boolean exists = mealEntitlementRepository.findById(uId).isPresent();
                if (exists && !overwrite) {
                    result.setTotalIgnorado(result.getTotalIgnorado() + 1);
                    result.getErros().add(Map.of(
                        "linha", String.valueOf(linha),
                        "userId", uId,
                        "erro", "Já existe — use overwrite=true para atualizar"
                    ));
                    continue;
                }
                
                self.upsert(uId, parsedStatus, item.getValidFrom(), item.getValidUntil(), item.getNote(), changedBy, "BULK");
                
                if (exists) {
                    result.setTotalAtualizado(result.getTotalAtualizado() + 1);
                } else {
                    result.setTotalCriado(result.getTotalCriado() + 1);
                }
                
            } catch (Exception e) {
                result.setTotalFalhas(result.getTotalFalhas() + 1);
                result.getErros().add(Map.of(
                    "linha", String.valueOf(linha),
                    "userId", uId != null ? uId : "",
                    "erro", e.getMessage() != null ? e.getMessage() : "Erro desconhecido"
                ));
            }
        }
        
        log.info("Bulk meal entitlements by {}: recebido={}, criado={}, atualizado={}, ignorado={}, falhas={}",
                changedBy, result.getTotalRecebido(), result.getTotalCriado(),
                result.getTotalAtualizado(), result.getTotalIgnorado(), result.getTotalFalhas());
        
        return result;
    }
}
