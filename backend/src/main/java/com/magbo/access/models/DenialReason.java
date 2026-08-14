package com.magbo.access.models;

/**
 * Motivo da decisão de acesso (seja negação ou observação).
 * NORMAL não deve ser gravado em access_attempts, apenas para completude.
 */
public enum DenialReason {
    MEAL_NOT_ENTITLED,
    OUTSIDE_MEAL_TIME,
    DUPLICATE_MEAL,
    EXIT_NOT_AUTHORIZED,
    OUTSIDE_EXIT_WINDOW,
    USER_INACTIVE,
    UNKNOWN_USER,
    MISSING_DOOR_MAPPING,
    DEVICE_DENIED,

    /**
     * Camera da portaria: rosto visto, mas o MAGBO nao sabe de quem e.
     *
     * Cobre os tres casos em que nao ha a quem atribuir a passagem: a camera
     * nao casou o rosto com ninguem da biblioteca (contrastFailed), casou
     * abaixo do limiar de similaridade, ou casou com um nome que nao existe em
     * app_users. Distinto de UNKNOWN_USER, que e o employeeNo de um MinMoe sem
     * cadastro: aqui nao ha employeeNo nenhum, so um nome e uma pontuacao.
     */
    UNKNOWN_FACE,

    /**
     * Camera da portaria: o nome vindo da camera casa com MAIS DE UM cadastro
     * ativo. Homonimos existem numa escola, e escolher um deles seria atribuir
     * a passagem — e possivelmente liberar uma saida — a pessoa errada.
     */
    AMBIGUOUS_NAME,

    /**
     * Portao: o REGIME DE SORTIE anual nao autoriza esta saida.
     *
     * E o aluno de regime 1 (surveille) apresentando-se no meio da jornada, sem
     * permissao pontual valida. Distinto de EXIT_NOT_AUTHORIZED, que fala da
     * ausencia de uma permissao PONTUAL: aqui a permissao pontual ja foi
     * consultada e nao existe, e o que decidiu foi a regra ANUAL assinada pelos
     * responsaveis.
     *
     * ⚠️ Gravado como OBSERVATION, nao como DENY: o MAGBO nao tranca porta
     * (ADR-003). Quem decide e o adulto no portao — este registro e o que
     * permite a direcao saber, depois, que o sistema avisou.
     */
    REGIME_NOT_ALLOWED,

    /**
     * Portao: nao ha regime cadastrado para este aluno.
     *
     * ⚠️ So aparece quando magbo.regime.desconhecido=DENY. No padrao
     * (OBSERVATION) o veredicto e INCONNU e NADA e gravado: no dia 1 sao 923
     * alunos sem regime, e 923 linhas por dia afogariam o feed.
     *
     * Separado de REGIME_NOT_ALLOWED de proposito: "regime 1 tentou sair" e
     * "ninguem preencheu o papel deste aluno" pedem acoes diferentes da Vie
     * Scolaire, e um motivo unico obrigaria a abrir o cadastro para saber qual
     * dos dois e.
     */
    REGIME_UNKNOWN,

    NORMAL
}
