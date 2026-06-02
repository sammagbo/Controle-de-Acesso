package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RefectoryMeal {
    private String userId;
    private String nome;
    private String turma;
    private String date;          // yyyy-MM-dd
    private String entryTime;     // HH:mm (null se sem entrada)
    private String exitTime;      // HH:mm (null se não registrou saída)
    private Integer durationMinutes; // null se saída não registrada
    private boolean onTime;       // true = entrou na hora certa (flag da entrada == null)
    private boolean exitRegistered;
}
