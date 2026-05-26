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
}
