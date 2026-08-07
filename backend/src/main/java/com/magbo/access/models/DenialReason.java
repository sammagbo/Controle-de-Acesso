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

    NORMAL
}
