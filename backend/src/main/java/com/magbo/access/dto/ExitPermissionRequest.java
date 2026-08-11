package com.magbo.access.dto;

import com.magbo.access.models.ExitPermissionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;

@Data
public class ExitPermissionRequest {
    @NotBlank
    private String userId;

    @NotNull
    private ExitPermissionType permissionType;

    /**
     * As duas autoridades. Pelo menos UMA tem de vir preenchida — a checagem
     * e no ExitPermissionService e nao aqui, porque bean validation nao
     * expressa "um destes dois" sem uma anotacao de classe propria.
     */
    @Size(max = 255)
    private String authorizedByFamily;

    @Size(max = 255)
    private String authorizedBySchool;

    private LocalDate validFrom;
    private LocalDate validUntil;
    private LocalTime startTime;
    private LocalTime endTime;
    
    @Size(max = 16)
    private String daysOfWeek;

    @Size(max = 255)
    private String note;
}
