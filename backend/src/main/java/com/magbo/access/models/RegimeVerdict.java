package com.magbo.access.models;

/**
 * O que o MAGBO tem a dizer quando um aluno se apresenta para SAIR.
 *
 * ⚠️ CINCO valores, e nao dois, porque a verdade tem cinco estados. Um veredicto
 * binario (pode / nao pode) obrigaria o sistema a mentir em tres deles: teria de
 * inventar "pode" para quem depende da grade horaria, "nao pode" para quem
 * simplesmente nao tem regime cadastrado, e alguma coisa para o professor que
 * passa pelo portao e nao tem regime nenhum por nao ser aluno.
 *
 * O que cada um significa para quem esta no portao:
 */
public enum RegimeVerdict {

    /**
     * VERDE. Pode sair, e o sistema sabe por que: ha permissao pontual valida
     * agora, ou o regime anual autoriza a saida autonoma.
     */
    AUTORISE,

    /**
     * VERMELHO. NAO deveria sair sozinho agora — regime 1 (surveille) sem
     * permissao pontual.
     *
     * ⚠️ Isto NAO tranca porta nenhuma (ADR-003: o MAGBO e observacional). E um
     * aviso para o adulto que esta no portao, que decide. A crianca que sai
     * assim mesmo fica registrada, e e essa a diferenca entre um sistema que
     * ajuda e um sistema que so bloqueia.
     */
    NON_AUTORISE,

    /**
     * AMARELO. O regime sozinho nao decide este momento: falta saber se ha aula
     * agora, ou se o professor faltou — a GRADE HORARIA, que vive no Pronote.
     *
     * ⚠️ Este e o valor mais importante do enum, e o que impede o sistema de
     * mentir. Sem ele, um aluno de regime 2 no meio da manha teria de receber
     * verde (e sairia quando nao devia) ou vermelho (e seria barrado quando
     * podia). Amarelo devolve a decisao a quem tem a informacao — que hoje e o
     * humano com o carnet na mao, exatamente como antes, mas agora sabendo qual
     * e o regime sem ter de lembrar de cor.
     */
    A_VERIFIER,

    /**
     * CINZA. Nao ha regime cadastrado para este aluno.
     *
     * ⚠️ INCONNU nao e NON_AUTORISE, e tratar os dois como iguais seria o erro
     * mais caro deste modulo: no dia 1 nenhum dos 923 alunos tem regime, e um
     * sistema que gritasse vermelho 923 vezes seria desligado na primeira
     * manha — junto com os avisos que importam.
     *
     * Mesma disciplina de EntitlementStatus.PENDING: dado nao preenchido nao e
     * dado negativo.
     */
    INCONNU,

    /**
     * SEM COR. A pessoa nao e aluno — professor, funcionario, responsavel.
     *
     * Regime de sortie e um instituto que so existe para alunos. Sem este valor,
     * a regra teria de "negar" todo servidor que sai as 17h, que e o defeito que
     * hoje mantem a avaliacao de saida DESLIGADA nas cameras da portaria (ver o
     * javadoc de AccessDecisionService.Passagem#aplicarPermissaoDeSaida).
     */
    NON_APPLICABLE
}
