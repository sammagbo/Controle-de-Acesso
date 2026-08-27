package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * QUEM NAO DEVE ENTRAR NO CDI, e ate quando.
 *
 * ⚠️ NAO IMPEDE NINGUEM DE ENTRAR. O terminal abre a porta de qualquer forma
 * (ADR-003: o MAGBO e observacional), e nao se transforma uma exclusao
 * pedagogica num ferrolho fisico. O que isto faz e AVISAR o adulto presente,
 * no momento em que a pessoa passa o cracha. O que acontece a seguir e decisao
 * dele.
 *
 * ⚠️ DADO SENSIVEL SOBRE UM MENOR: nomeia uma crianca e conta uma sancao.
 * Legivel SO com `CDI_EXCLUSION_WRITE` — nao por setor, nao por «esta
 * autenticado».
 *
 * ⚠️ LEVANTAR NAO APAGA. `revogadoEm`/`revogadoPor` sao preenchidos e a linha
 * FICA. Mesma doutrina de `student_exit_permissions` e `student_regimes`: uma
 * medida tomada sobre uma crianca e prova, e prova nao se apaga por ter
 * expirado.
 */
@Entity
@Table(name = "cdi_exclusions")
@Getter @Setter @ToString @NoArgsConstructor @AllArgsConstructor @Builder
public class CdiExclusion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Exatamente UM destes dois e preenchido (CHECK na V025). */
    @Column(name = "user_id", length = 64)
    private String userId;

    @Column(name = "turma", length = 32)
    private String turma;

    /**
     * Texto livre e FACULTATIVO.
     *
     * ⚠️ Deliberadamente sem lista de motivos: uma lista predefinida viraria
     * uma taxonomia de faltas de criancas, e nao e ao sistema mante-la.
     */
    @Column(name = "motivo", length = 255)
    private String motivo;

    /**
     * NULL = sem fim, ate alguem levantar.
     *
     * E o caso mais frequente. Obrigar uma data faria inventar um prazo
     * arbitrario — e um prazo inventado expira sozinho sem ninguem decidir.
     */
    @Column(name = "ate")
    private LocalDate ate;

    @Column(name = "criado_por", nullable = false, length = 50)
    private String criadoPor;

    @Column(name = "criado_em", nullable = false)
    @Builder.Default
    private LocalDateTime criadoEm = LocalDateTime.now();

    @Column(name = "revogado_por", length = 50)
    private String revogadoPor;

    @Column(name = "revogado_em")
    private LocalDateTime revogadoEm;

    /**
     * A exclusao vale NESTE dia?
     *
     * ⚠️ `ate` e INCLUSIVO: «ate sexta» quer dizer que sexta ainda conta. Um
     * limite exclusivo faria a exclusao acabar um dia antes do que o adulto
     * que a escreveu tinha em mente — e ninguem iria perceber.
     */
    @Transient
    public boolean ativaEm(LocalDate dia) {
        if (revogadoEm != null) return false;
        if (ate == null) return true;
        return dia != null && !dia.isAfter(ate);
    }
}
