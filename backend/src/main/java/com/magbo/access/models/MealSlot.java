package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.DayOfWeek;
import java.time.LocalTime;

/**
 * UM CRENEAU DE CANTINA: um dia da semana e uma hora de passagem.
 *
 * ⚠️ ESTA E A UNICA FONTE DE VERDADE DA JANELA DE ACESSO AO REFEITORIO desde a
 * V021 (ADR-005). `class_schedules` NAO e mais lido pela cantina — ele
 * sobrevive para outra pergunta, a do `RegimeSortieService` («a que horas acaba
 * a manha desta turma»), que decide janela de SAIDA e nao de refeicao.
 *
 * ⚠️ SEM COLUNA DE ENUM. `dia_semana` e um SMALLINT ISO (1=segunda..7=domingo)
 * e nao um @Enumerated: a licao da V014/V017 e que a migracao que CRIA a tabela
 * escreve o schema naquele ambiente, e o `ddl-auto=update` nunca corrige um
 * CHECK depois. Sem enum, nao ha CHECK a divergir entre uma VM atualizada pelo
 * procedimento e uma VM nova nascida do Hibernate. A conversao para
 * {@link DayOfWeek} vive aqui, num sitio so.
 */
@Entity
@Table(name = "meal_slots",
       uniqueConstraints = @UniqueConstraint(name = "uq_meal_slots_dia_hora",
                                             columnNames = {"dia_semana", "hora"}))
@Getter @Setter @ToString @NoArgsConstructor @AllArgsConstructor @Builder
public class MealSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** ISO-8601: 1 = segunda ... 7 = domingo. Ver o javadoc da classe. */
    @Column(name = "dia_semana", nullable = false)
    private Short diaSemana;

    @Column(name = "hora", nullable = false)
    private LocalTime hora;

    /**
     * Tolerancia ANTES da hora do creneau.
     *
     * Por creneau e nao global: o servico das 11h da maternal e o das 13h do
     * liceu nao se espalham do mesmo jeito, e um numero unico obrigaria a
     * escolher entre alertar de menos num e de mais no outro.
     */
    @Column(name = "tolerancia_antes_minutos", nullable = false)
    @Builder.Default
    private Short toleranciaAntesMinutos = 15;

    @Column(name = "tolerancia_depois_minutos", nullable = false)
    @Builder.Default
    private Short toleranciaDepoisMinutos = 45;

    /** «12H30 — prioritaire». Rotulo de afixacao: nenhuma regra depende dele. */
    @Column(name = "rotulo", length = 64)
    private String rotulo;

    /** Ordem na afixacao impressa (1 = primeiro passagem). */
    @Column(name = "ordem", nullable = false)
    @Builder.Default
    private Short ordem = 1;

    @Column(name = "ativo", nullable = false)
    @Builder.Default
    private Boolean ativo = true;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private java.time.LocalDateTime createdAt = java.time.LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private java.time.LocalDateTime updatedAt = java.time.LocalDateTime.now();

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    /** O dia como {@link DayOfWeek}. Conversao num sitio so. */
    @Transient
    public DayOfWeek dia() {
        return diaSemana == null ? null : DayOfWeek.of(diaSemana);
    }

    /**
     * A passagem cai dentro deste creneau?
     *
     * ⚠️ A hora recebida e a do EVENTO, nunca a do processamento — ver
     * `MealSlotService`. Aqui so se compara.
     */
    @Transient
    public boolean contem(LocalTime t) {
        if (t == null || hora == null) return false;
        int antes = toleranciaAntesMinutos == null ? 0 : toleranciaAntesMinutos;
        int depois = toleranciaDepoisMinutos == null ? 0 : toleranciaDepoisMinutos;
        return !t.isBefore(hora.minusMinutes(antes)) && !t.isAfter(hora.plusMinutes(depois));
    }
}
