package com.magbo.access.dto;

import com.magbo.access.models.ExitPermissionStatus;
import com.magbo.access.models.ExitPermissionType;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@Builder
public class ExitPermissionDto {
    private Long id;
    private String userId;
    private String nome;
    private String turma;
    private ExitPermissionType permissionType;
    private LocalDate validFrom;
    private LocalDate validUntil;
    private LocalTime startTime;
    private LocalTime endTime;
    private String daysOfWeek;
    private ExitPermissionStatus status;
    private String reason;
    private String note;
    private String createdBy;
    private LocalDateTime createdAt;
    private String revokedBy;
    private LocalDateTime revokedAt;
    private LocalDateTime usedAt;
}
