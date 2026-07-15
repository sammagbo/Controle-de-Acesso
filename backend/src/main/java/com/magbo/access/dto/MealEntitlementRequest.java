package com.magbo.access.dto;

import com.magbo.access.models.EntitlementStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

@Data
public class MealEntitlementRequest {
    @NotNull
    private EntitlementStatus status;

    private LocalDate validFrom;

    private LocalDate validUntil;

    @Size(max = 255)
    private String note;
}
