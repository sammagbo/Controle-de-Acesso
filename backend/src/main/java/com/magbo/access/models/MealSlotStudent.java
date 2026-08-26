package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

/**
 * A EXCECAO de um aluno: ele come noutro creneau que nao o da turma dele.
 *
 * Existe porque os grupos de Terminale/Premiere/2nde nao seguem a turma. Sem
 * ela, a unica forma de acertar um aluno seria mover a turma inteira.
 *
 * ⚠️ SEM FK para `app_users`, como `access_logs` e `cantine_removals`: um
 * cadastro apagado nao pode fazer falhar um INSERT operacional.
 */
@Entity
@Table(name = "meal_slot_students",
       uniqueConstraints = @UniqueConstraint(name = "uq_meal_slot_students",
                                             columnNames = {"user_id", "slot_id"}))
@Getter @Setter @ToString @NoArgsConstructor @AllArgsConstructor @Builder
public class MealSlotStudent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(name = "slot_id", nullable = false)
    private Long slotId;

    @Column(name = "motivo", length = 255)
    private String motivo;

    @Column(name = "created_by", nullable = false, length = 50)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private java.time.LocalDateTime createdAt = java.time.LocalDateTime.now();
}
