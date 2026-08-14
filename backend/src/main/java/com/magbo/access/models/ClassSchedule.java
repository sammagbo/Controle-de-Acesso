package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "class_schedules")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class ClassSchedule {

    @Id
    @EqualsAndHashCode.Include
    private String classe;

    @Column(name = "lun_midi", length = 8)
    private String lunMidi;

    @Column(name = "mar_midi", length = 8)
    private String marMidi;

    @Column(name = "mer_midi", length = 8)
    private String merMidi;

    @Column(name = "jeu_midi", length = 8)
    private String jeuMidi;

    @Column(name = "ven_midi", length = 8)
    private String venMidi;

    /**
     * O valor de midi DESTA turma NESTE dia — "11H00", "12H30", "N" (sem
     * refeicao) ou null (fim de semana / sem dado).
     *
     * Vive no modelo para o mapeamento dia-da-semana -> coluna existir UMA vez:
     * a cantina (AccessDecisionService) e o regime de sortie
     * (RegimeSortieService) leem a MESMA grade, e duas copias deste switch
     * seriam duas chances de uma so divergir.
     */
    public String midiDoDia(java.time.DayOfWeek dia) {
        switch (dia) {
            case MONDAY: return lunMidi;
            case TUESDAY: return marMidi;
            case WEDNESDAY: return merMidi;
            case THURSDAY: return jeuMidi;
            case FRIDAY: return venMidi;
            default: return null;
        }
    }
}
