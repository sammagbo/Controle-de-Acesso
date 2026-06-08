package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OverviewStats {
    private long totalMovements;
    private long uniqueStudents;
    private List<AreaStat> areas;          // por área: cantine, infirmerie, cdi, portail
    private List<HourStat> byHour;         // movimentos por hora (0-23)
    private long longInfirmaryStays;       // séjours prolongés (>30min)
    private long offScheduleMeals;         // repas hors horaire (flag FORA_HORARIO)
    private long unregisteredExits;        // entradas sem saída (cantina+enfermaria)
    private Long previousTotal;            // total do período anterior (tendência)
    private long presentToday;        // alunos distintos com ENTRADA em portão hoje
    private long currentlyInSectors;  // alunos atualmente dentro de algum setor (entrada sem saída)

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class AreaStat {
        private String area;
        private long movements;
        private long uniqueStudents;
        private long entries;
        private long currentOccupancy;   // quantos estão dentro deste setor agora
        private Integer avgDurationMin;   // permanência média (min) no período, null se n/a
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class HourStat {
        private int hour;
        private long count;
    }
}
