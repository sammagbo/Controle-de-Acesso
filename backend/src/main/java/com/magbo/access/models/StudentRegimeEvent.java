package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * HISTORICO do regime — toda alteracao grava uma linha, na MESMA transacao.
 *
 * Mesma disciplina de meal_entitlement_events, e pela mesma razao, aqui ainda
 * mais forte: o regime de sortie e a autorizacao dos responsaveis legais para
 * uma crianca sair sozinha de um estabelecimento escolar. Se ela mudar e
 * ninguem souber quando nem por ordem de quem, a escola perdeu a unica prova de
 * que agiu conforme o que a familia autorizou.
 *
 * ⚠️ Nunca alterar student_regimes sem escrever aqui. A transacao e a mesma de
 * proposito: um historico que pode faltar quando a escrita principal deu certo
 * nao e historico, e sorte.
 */
@Entity
@Table(name = "student_regime_events", indexes = {
        @Index(name = "idx_regime_events_user", columnList = "user_id"),
        @Index(name = "idx_regime_events_quando", columnList = "changed_at")
})
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class StudentRegimeEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    /** Linha de student_regimes afetada. */
    @Column(name = "regime_id")
    private Long regimeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "old_regime_sortie", length = 32)
    private RegimeSortie oldRegimeSortie;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_regime_sortie", length = 32)
    private RegimeSortie newRegimeSortie;

    @Enumerated(EnumType.STRING)
    @Column(name = "old_regime_general", length = 32)
    private RegimeGeneral oldRegimeGeneral;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_regime_general", length = 32)
    private RegimeGeneral newRegimeGeneral;

    /**
     * QUEM autorizou, antes e depois.
     *
     * ⚠️ E o unico campo que a propria entidade chama de PROVA, e ate 14/08/2026
     * ele era o unico que o historico NAO guardava: trocar "a avo assinou" por
     * "a mae assinou" nao deixava diferenca nenhuma na linha do tempo que a tela
     * mostra. Apanhado pela enfermeira no painel de revisao.
     */
    @Column(name = "old_authorized_by", length = 255)
    private String oldAuthorizedBy;

    @Column(name = "new_authorized_by", length = 255)
    private String newAuthorizedBy;

    @Column(name = "changed_by", nullable = false, length = 64)
    private String changedBy;

    @Column(name = "changed_at", nullable = false)
    @Builder.Default
    private LocalDateTime changedAt = LocalDateTime.now();

    @Column(name = "note", length = 500)
    private String note;

    /**
     * Origem da alteracao: UI, BULK ou API.
     *
     * ⚠️ String livre no Java, e o CHECK correspondente e MANUAL (vive so na
     * migracao V014). O Hibernate nao gera CHECK para String, e `ddl-auto` nunca
     * altera um CHECK existente — exatamente a armadilha de
     * meal_entitlement_events.source, que ja mordeu duas vezes. Valor novo aqui
     * exige atualizar o CHECK na mesma entrega, senao o INSERT falha SO NA VM.
     */
    @Column(name = "source", nullable = false, length = 16)
    private String source;
}
