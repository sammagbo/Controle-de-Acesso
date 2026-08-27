package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "access_logs")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class AccessLog {

    /**
     * A familia «fora do seu creneau» de `access_logs.flag`.
     *
     * ⚠️ VIVE AQUI, no modelo que possui a coluna, e nao num controller: ela e
     * lida pela REGRA (AccessDecisionService), pelo RAPPORT (AccessController)
     * e pelo KPI. Uma copia por consumidor e uma copia que envelhece — e o
     * modo de falha e mudo: o consumidor esquecido para simplesmente de ver a
     * familia inteira e o numero congela sem erro.
     *
     * `FORA_HORARIO` e o valor HISTORICO (linhas anteriores a 27/08/2026),
     * quando a janela tinha um flag unico sem direcao. Nao se reescreve
     * historia: ele fica, e conta.
     *
     * ⚠️ Espelhada em js/utils/cantine.js (FLAGS_FORA_CRENEAU) — mudar juntas.
     */
    public static final java.util.Set<String> FLAGS_FORA_DO_CRENEAU =
            java.util.Set.of("FORA_HORARIO", "AVANT_CRENEAU", "APRES_CRENEAU");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "point_id", nullable = false)
    private String pointId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccessAction action;

    @Column(nullable = false)
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    @Column(name = "created_by_user", length = 50)
    private String createdByUser;

    @Column(name = "flag", length = 32)
    private String flag;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_method", length = 8)
    private AuthMethod authMethod;

    @Column(name = "hikvision_sub_event_type")
    private Integer hikvisionSubEventType;
}
