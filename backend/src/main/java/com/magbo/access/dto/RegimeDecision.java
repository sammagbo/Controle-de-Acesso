package com.magbo.access.dto;

import com.magbo.access.models.RegimeGeneral;
import com.magbo.access.models.RegimeSortie;
import com.magbo.access.models.RegimeVerdict;

/**
 * A resposta do sistema para "este aluno pode sair agora?".
 *
 * Carrega o veredicto E o que o produziu. O "porque" nao e enfeite de log: e o
 * que o AED le no portao para decidir em dois segundos, e e o que a direcao le
 * seis meses depois para saber com que informacao a decisao foi tomada.
 *
 * @param verdict        o veredicto — ver {@link RegimeVerdict}
 * @param motivo         chave i18n do motivo (nunca frase pronta: a tela e
 *                       bilingue, e uma frase montada aqui chegaria em uma
 *                       lingua so — mesma decisao de importPlan e importColumns)
 * @param regimeSortie   regime vigente, ou null se nao ha
 * @param regimeGeneral  regime geral vigente, ou null se nao ha
 * @param permissionId   id da permissao pontual que autorizou, quando foi ela
 *                       que decidiu — o que permite consumir uma SINGLE e o que
 *                       prova, depois, qual papel autorizou aquela saida
 * @param dependeDeGrade true quando a resposta completa exigiria a grade
 *                       horaria do Pronote. E o que a tela usa para dizer ao
 *                       AED o que ele precisa conferir, em vez de so mostrar
 *                       amarelo sem explicacao
 */
public record RegimeDecision(
        RegimeVerdict verdict,
        String motivo,
        RegimeSortie regimeSortie,
        RegimeGeneral regimeGeneral,
        Long permissionId,
        boolean dependeDeGrade) {

    public boolean liberado() {
        return verdict == RegimeVerdict.AUTORISE;
    }

    /** Precisa de olho humano: amarelo ou vermelho. */
    public boolean exigeAtencao() {
        return verdict == RegimeVerdict.NON_AUTORISE || verdict == RegimeVerdict.A_VERIFIER;
    }
}
