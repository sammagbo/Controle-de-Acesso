package com.magbo.access.security;

public final class Permissions {

    private Permissions() {
        // utility class
    }

    public static final String MEAL_ENTITLEMENT_WRITE = "MEAL_ENTITLEMENT_WRITE";
    public static final String EXIT_PERMISSION_WRITE  = "EXIT_PERMISSION_WRITE";
    public static final String ATTEMPTS_READ          = "ATTEMPTS_READ";

    /**
     * Escrever o REGIME DE SORTIE de um aluno (V014).
     *
     * ⚠️ Sem esta constante AQUI e dentro de {@link #TODAS}, a permissao existe
     * apenas como literal dentro do @PreAuthorize: o admin nao consegue
     * conceder ("Permissao invalida"), e a tela da Vie Scolaire fica acessivel
     * so a ADMIN — exatamente o perfil que NAO deveria cadastrar regime, porque
     * quem tem o papel assinado na mao e a Vie Scolaire. Apanhado pelo painel
     * de revisao (arquiteto) em 14/08/2026.
     */
    public static final String REGIME_WRITE           = "REGIME_WRITE";

    /**
     * Ler a lista NOMINATIVA de quem esta dentro da escola (PPMS).
     *
     * ⚠️ A lista continua com NOMES — numa evacuacao e o nome que permite achar
     * uma crianca, e uma contagem anonima nao serve para procurar ninguem. O que
     * muda e QUEM a alcanca: Vie Scolaire, direcao e enfermaria. O operador da
     * cantina nao tem por que saber qual crianca esta na enfermaria agora, e a
     * rota mostrava isso a qualquer conta autenticada — alargando, sem decisao
     * escrita, um dado que o resto do sistema protege com can('infirmerie').
     *
     * Decisao do Sam em 14/08/2026, depois do painel de revisao: restringir, nao
     * fechar.
     */
    public static final String PPMS_READ              = "PPMS_READ";

    /**
     * Retirar uma linha do Moniteur Cantine (V020).
     *
     * ⚠️ LER o monitor continua a ser por AREA — qualquer operador da cantina
     * abre a tela. O que esta permissao governa e APAGAR uma linha da vista de
     * toda a gente: um gesto que muda o que os outros veem, e que sem registo
     * seria indistinguivel de um defeito do sistema.
     *
     * ⚠️ E ELA NAO CHEGA SOZINHA. A permissao e GLOBAL e o ponto NAO e: o
     * @PreAuthorize do CantineRemovalController exige TAMBEM
     * `@areaSecurity.can(#pointId)`, senao quem a tivesse retiraria linhas de
     * qualquer ponto do sistema. Ver o javadoc daquele controller.
     */
    public static final String CANTINE_REMOVAL_WRITE  = "CANTINE_REMOVAL_WRITE";

    /**
     * TODAS as permissoes concedeveis — a lista, num lugar so.
     *
     * ⚠️ Ate 14/08/2026 esta lista existia DUAS vezes dentro do
     * SystemUserController: uma como cadeia de {@code !val.equals(...)} e outra,
     * escrita a mao, dentro da mensagem de erro. Um teste que procurasse o nome
     * da permissao no arquivo passava mesmo com a verificacao removida — porque
     * a mensagem ainda a citava. Foi assim que uma mutacao deliberada sobreviveu.
     *
     * ⚠️ Cada branch de funcionalidade acrescenta o seu nome AQUI. Uma linha
     * nova no fim de uma lista e um conflito de merge que se resolve olhando;
     * um nome a mais no meio de um booleano de cinco termos e um conflito que
     * se resolve escolhendo um lado — e o lado perdido some sem erro nenhum.
     *
     * ⚠️ Nao inclui "*". Ele e aceito pelo SystemUser.hasPermission por
     * compatibilidade (e so quando e a string INTEIRA), mas nao e oferecido na
     * tela: concede tambem o que ainda nao existe.
     */
    public static final java.util.List<String> TODAS = java.util.List.of(
            MEAL_ENTITLEMENT_WRITE,
            EXIT_PERMISSION_WRITE,
            ATTEMPTS_READ,
            REGIME_WRITE,
            PPMS_READ,
            CANTINE_REMOVAL_WRITE);
}
