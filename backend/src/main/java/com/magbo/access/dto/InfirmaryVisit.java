package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InfirmaryVisit {
    private String userId;
    private String nome;
    private String turma;
    private String date;          // yyyy-MM-dd
    private String entryTime;     // HH:mm
    private String exitTime;      // HH:mm (null se não registrou saída)
    private Integer durationMinutes; // null se saída não registrada
    private boolean longStay;     // true se permanência > 30 min
    private boolean exitRegistered;
}
