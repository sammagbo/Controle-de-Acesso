package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * O regime de UM aluno, valido por um periodo — na pratica, um ano letivo.
 *
 * ⚠️ TABELA PROPRIA, nao colunas em app_users, e a razao nao e estilo:
 *
 *   1. O regime tem VALIDADE. Colunas em app_users guardariam so o valor de
 *      hoje, e a pergunta "que regime ele tinha em marco?" — a pergunta que a
 *      direcao faz depois de um incidente — nao teria resposta.
 *   2. O regime tem ORIGEM. Alguem assinou um papel numa data. Isso e prova, e
 *      prova nao mora numa coluna que o proximo import sobrescreve.
 *   3. app_users.findAll() roda em caminho quente (listStaff, GET /api/users);
 *      cada coluna nova ali e arrastada em toda chamada.
 *
 * UMA linha VIGENTE por aluno de cada vez. Nao ha constraint de banco para
 * isso, e a escolha e consciente: a exclusao seria por intervalo de datas
 * (EXCLUDE USING gist), que o Hibernate nao gera, que `ddl-auto=update` nunca
 * criaria no PC e que existiria so onde a migracao rodou — a mesma armadilha
 * ja documentada em .claude/rules/database.md. A regra vive no
 * {@link com.magbo.access.services.RegimeSortieService}, com teste, e a
 * consulta de vigencia e deterministica (ordem por valid_from desc, id desc)
 * para que duas linhas sobrepostas nunca produzam resposta que varia entre
 * chamadas.
 */
@Entity
@Table(name = "student_regimes", indexes = {
        @Index(name = "idx_student_regimes_user", columnList = "user_id"),
        @Index(name = "idx_student_regimes_vigencia", columnList = "user_id,valid_from")
})
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class StudentRegime {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    /**
     * Matricula do aluno. String, como todo id de pessoa neste sistema (Pronote,
     * 7 digitos com zeros a esquerda).
     *
     * Sem FK, seguindo o que o projeto ja faz em student_exit_permissions e
     * meal_entitlements: o cadastro de alunos e reimportado do Pronote e uma FK
     * transformaria uma reimportacao em erro de integridade no meio do dia.
     */
    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "regime_general", nullable = false, length = 32)
    private RegimeGeneral regimeGeneral;

    @Enumerated(EnumType.STRING)
    @Column(name = "regime_sortie", nullable = false, length = 32)
    private RegimeSortie regimeSortie;

    /** Primeiro dia de vigencia (inclusive). */
    @Column(name = "valid_from", nullable = false)
    private LocalDate validFrom;

    /**
     * Ultimo dia de vigencia (inclusive), ou null para "ate segunda ordem".
     *
     * Nullable de proposito: o regime e anual, mas a data exata do fim do ano
     * letivo nao e conhecida quando a Vie Scolaire cadastra em agosto, e
     * obrigar um chute produziria regimes que expiram sozinhos numa data que
     * ninguem escolheu — no meio de junho, todo aluno viraria INCONNU.
     */
    @Column(name = "valid_until")
    private LocalDate validUntil;

    /**
     * QUEM autorizou, do lado da familia. O nome do responsavel que assinou.
     *
     * ⚠️ Obrigatorio, e esta e a diferenca entre um registro e uma prova. O
     * regime de sortie e uma declaracao dos responsaveis legais; uma linha sem
     * autor e a afirmacao de que uma crianca pode sair sozinha sem que ninguem
     * tenha dito isso. Mesma disciplina de student_exit_permissions, onde a
     * regra e "pelo menos uma das duas autoridades" — aqui e mais estrita,
     * porque a escola nao decide o regime: a familia decide.
     */
    @Column(name = "authorized_by_family", nullable = false, length = 255)
    private String authorizedByFamily;

    /**
     * Referencia do documento assinado (numero do carnet, data da ficha, "fiche
     * de rentree 2026"...). Texto livre.
     *
     * Nullable: nem toda escola numera o papel. Quando existe, e o que permite
     * ir buscar o original no arquivo.
     */
    @Column(name = "documento_ref", length = 255)
    private String documentoRef;

    /** Data em que o responsavel assinou — nao a data em que foi digitado. */
    @Column(name = "assinado_em")
    private LocalDate assinadoEm;

    @Column(name = "note", length = 500)
    private String note;

    /** Quem DIGITOU. Nunca confundir com quem AUTORIZOU. */
    @Column(name = "created_by", nullable = false, length = 64)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_by", length = 64)
    private String updatedBy;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /**
     * Encerrado em (soft delete).
     *
     * Regime NUNCA e apagado — e prova de uma decisao dos responsaveis. Quando
     * muda no meio do ano (a familia reviu a autorizacao), a linha antiga
     * recebe encerrado_em e uma nova nasce. As duas ficam.
     */
    @Column(name = "encerrado_em")
    private LocalDateTime encerradoEm;

    @Column(name = "encerrado_por", length = 64)
    private String encerradoPor;

    /** Vigente na data dada: dentro do intervalo e nao encerrado. */
    public boolean vigenteEm(LocalDate dia) {
        if (encerradoEm != null) return false;
        if (dia == null || validFrom == null) return false;
        if (dia.isBefore(validFrom)) return false;
        return validUntil == null || !dia.isAfter(validUntil);
    }
}
