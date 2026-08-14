package com.magbo.access.security;

public final class Permissions {

    private Permissions() {
        // utility class
    }

    public static final String MEAL_ENTITLEMENT_WRITE = "MEAL_ENTITLEMENT_WRITE";
    public static final String EXIT_PERMISSION_WRITE  = "EXIT_PERMISSION_WRITE";
    public static final String ATTEMPTS_READ          = "ATTEMPTS_READ";

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
            ATTEMPTS_READ);
}
