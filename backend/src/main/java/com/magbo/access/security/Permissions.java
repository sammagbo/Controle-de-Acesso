package com.magbo.access.security;

public final class Permissions {

    private Permissions() {
        // utility class
    }

    public static final String MEAL_ENTITLEMENT_WRITE = "MEAL_ENTITLEMENT_WRITE";
    public static final String EXIT_PERMISSION_WRITE  = "EXIT_PERMISSION_WRITE";
    public static final String ATTEMPTS_READ          = "ATTEMPTS_READ";

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
}
