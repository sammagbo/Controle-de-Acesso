package com.magbo.access.dto;

import lombok.Data;
import java.time.LocalDate;

@Data
public class MealEntitlementBulkItem {
    private String userId;
    private String status;
    private LocalDate validFrom;
    private LocalDate validUntil;
    private String note;
}
