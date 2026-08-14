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
    /**
     * true = a entrada NAO foi marcada FORA_HORARIO.
     *
     * ⚠️ NAO e "a flag da entrada e nula", que era a regra ate 14/08/2026 e
     * estava errada. `access_logs.flag` e um campo UNICO que tambem recebe
     * POSTO_FIXO, JA_PRESENTE e FECHAMENTO_AUTO: pela regra antiga, uma passagem
     * que o proprio sistema classificou como ROTINA era apresentada ao operador
     * como refeicao fora do horario — uma acusacao de irregularidade contra quem
     * nao cometeu nenhuma. O KPI equivalente da Vue d'ensemble sempre contou
     * pela flag certa (AccessLogRepository: flag='FORA_HORARIO'), e as duas
     * telas divergiam.
     *
     * Coberto por RefectoryOnTimeTest.
     */
    private boolean onTime;
    private boolean exitRegistered;
}
