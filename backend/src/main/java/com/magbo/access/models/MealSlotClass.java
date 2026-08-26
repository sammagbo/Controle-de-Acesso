package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

/**
 * A afetacao de uma TURMA a um creneau.
 *
 * ⚠️ SEM UNIQUE em (turma, dia) — de proposito, e e o facto que ditou o modelo:
 * na afixacao de 2026, a 1ere 2 e a 1ere 3 aparecem nos DOIS passagens da
 * terca-feira (parte do grupo come as 12h30, parte as 13h00). Uma regra «uma
 * turma, um creneau» tornaria a afixacao irrepresentavel e obrigaria alguem a
 * escolher qual metade mentir.
 */
@Entity
@Table(name = "meal_slot_classes",
       uniqueConstraints = @UniqueConstraint(name = "uq_meal_slot_classes",
                                             columnNames = {"slot_id", "turma"}))
@Getter @Setter @ToString @NoArgsConstructor @AllArgsConstructor @Builder
public class MealSlotClass {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "slot_id", nullable = false)
    private Long slotId;

    @Column(name = "turma", nullable = false, length = 32)
    private String turma;

    /**
     * Transcrito da afixacao COM DUVIDA (um iman tapava o badge).
     *
     * ⚠️ A duvida vive no DADO, nao na cabeca de quem transcreveu. A regra
     * trata esta linha como qualquer outra — ela nao acusa ninguem — e a tela
     * de administracao mostra-a marcada, para que a Vie Scolaire confirme.
     */
    @Column(name = "a_confirmar", nullable = false)
    @Builder.Default
    private Boolean aConfirmar = false;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private java.time.LocalDateTime createdAt = java.time.LocalDateTime.now();
}
