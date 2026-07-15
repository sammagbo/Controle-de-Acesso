package com.magbo.access.dto;

import com.magbo.access.models.EntitlementStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Builder
public class MealEntitlementDto {
    private String userId;
    private String nome;
    private String turma;
    private EntitlementStatus status;
    private LocalDate validFrom;
    private LocalDate validUntil;
    private String note;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
