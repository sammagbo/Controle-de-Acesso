package com.magbo.access.dto;

import com.magbo.access.models.EntitlementStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Builder
public class MealEntitlementHistoryDto {
    private LocalDateTime changedAt;
    private String changedBy;
    private EntitlementStatus oldStatus;
    private EntitlementStatus newStatus;
    private LocalDate oldValidFrom;
    private LocalDate oldValidUntil;
    private LocalDate newValidFrom;
    private LocalDate newValidUntil;
    private String note;
    private String source;
}
