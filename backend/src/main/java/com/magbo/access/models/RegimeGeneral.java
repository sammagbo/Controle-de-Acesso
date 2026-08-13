package com.magbo.access.models;

/**
 * REGIME GENERAL — como o aluno passa o dia na escola.
 *
 * Fixado pelos responsaveis no inicio do ano, junto com o
 * {@link RegimeSortie}, e igualmente anual.
 *
 * Importa para a saida porque muda ONDE termina a jornada da crianca: o
 * externo pode ir embora no fim da manha; o demi-pensionnaire almoca aqui e so
 * termina no fim da tarde. Dois alunos com o MESMO regime de sortie tem
 * direitos diferentes ao meio-dia por causa deste campo.
 *
 * ⚠️ Relacao com os DIREITOS DE REFEICAO (meal_entitlements): sao coisas
 * distintas e deliberadamente NAO ligadas neste passo. Este campo diz o que a
 * familia CONTRATOU; meal_entitlements diz quem a cantina esta autorizada a
 * servir hoje. Costumam coincidir e nao sao a mesma verdade — juntar os dois
 * automaticamente faria uma inadimplencia virar um direito de saida, ou o
 * contrario. Se um dia forem cruzados, que seja por decisao registrada.
 */
public enum RegimeGeneral {

    /** Almoca fora. A jornada pode terminar no fim da manha. */
    EXTERNE,

    /** Almoca na escola. A jornada termina no fim da tarde. */
    DEMI_PENSIONNAIRE,

    /**
     * Interno: dorme na escola.
     *
     * Modelado por completude do vocabulario oficial. Esta escola nao tem
     * internato hoje; o valor existe para que o dia em que tiver nao precise
     * de migracao de enum (que arrastaria o CHECK do banco — ver
     * .claude/rules/database.md).
     */
    INTERNE
}
