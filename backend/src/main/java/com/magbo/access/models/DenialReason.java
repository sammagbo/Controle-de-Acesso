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

    /**
     * Portao: o regime nao decide sozinho este momento — falta a GRADE.
     *
     * E o aluno de regime 2 (semi-libre), que pode sair havendo ausencia de
     * professor: informacao que vive no Pronote e nao chega aqui. O MAGBO nao
     * discorda da saida; ele nao sabe, e diz que nao sabe.
     *
     * ⚠️ Gravado como OBSERVATION, como os outros dois. E o unico dos cinco
     * veredictos que NAO e uma objecao — existe porque um veredicto que ninguem
     * consegue contar depois nao pode ser melhorado. Sem esta linha, o valor que
     * o proprio enum RegimeVerdict chama de "o mais importante" nao deixava
     * rastro em lugar nenhum (painel de revisao, AED, 14/08/2026).
     */
    REGIME_TO_VERIFY,

    /**
     * Ninguem disse a que horas esta pessoa come (V021/V022).
     *
     * ⚠️ NAO E RECUSA, e o rotulo tem de continuar a dizer isso. E uma pergunta
     * dirigida ao ADULTO que mantem o planning, nao um reproche a uma crianca:
     * a maternal e o elementar nao figuram na afixacao e nao podem ser punidos
     * por uma casa vazia. A politica associada
     * (`magbo.policy.meal-slot-not-configured`) nasce OBSERVATION e nao deve
     * passar a DENY — um sistema que confunde «nao sei» com «nao pode»
     * transforma a propria ignorancia em sancao.
     *
     * ⚠️ Valor novo no enum = CHECK novo em `access_attempts` (V022). Sem a
     * migracao, o INSERT falha SO NA VM, dentro da transacao, derrubando junto
     * o access_log de uma passagem real.
     */
    MEAL_SLOT_NOT_CONFIGURED,

    NORMAL
}
