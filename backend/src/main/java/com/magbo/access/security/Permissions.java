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
     * ⚠️ Sem esta constante AQUI e na whitelist de
     * SystemUserController.validatePermissoes, a permissao existe apenas como
     * literal dentro do @PreAuthorize: o admin nao consegue conceder
     * ("Permissao invalida"), e a tela da Vie Scolaire fica acessivel so a
     * ADMIN — exatamente o perfil que NAO deveria cadastrar regime, porque
     * quem tem o papel assinado na mao e a Vie Scolaire. Apanhado pelo painel
     * de revisao (arquiteto) em 14/08/2026.
     */
    public static final String REGIME_WRITE           = "REGIME_WRITE";
}
