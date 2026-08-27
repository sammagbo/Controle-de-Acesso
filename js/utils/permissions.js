// =====================================================================
// PERMISSÕES DE ESCRITA — lógica pura, sem React e sem DOM
// =====================================================================
// Uma tela que habilita um botão por um critério e um endpoint que aceita
// por outro produz o pior par de defeitos possível: botão vivo que devolve
// 403, e gente com direito que vê o campo cinza. Esta é a única função que
// decide isso no frontend, e ela existe fora dos componentes para poder ser
// testada sem abrir o Electron.
//
// O backend continua sendo a autoridade real (`@PreAuthorize`); isto só
// governa o estado da UI. O objetivo é que os dois digam a MESMA coisa.
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboPermissions, via <script> no index.html
//   • Vitest    → module.exports (package.json não tem "type": "module")

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboPermissions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * Nomes das permissões granulares. Espelham
     * backend/.../security/Permissions.java — mudar os DOIS juntos, mesmo
     * padrão de ACCESS_POINTS/AreaMapping.
     */
    const PERMISSIONS = {
        // Régime de sortie (V014): quem tem o papel assinado na mão é a Vie
        // Scolaire, não o administrador. Espelha security/Permissions.java.
        REGIME_WRITE: 'REGIME_WRITE',
        MEAL_ENTITLEMENT_WRITE: 'MEAL_ENTITLEMENT_WRITE',
        EXIT_PERMISSION_WRITE: 'EXIT_PERMISSION_WRITE',
        ATTEMPTS_READ: 'ATTEMPTS_READ',
        // PPMS: ler a lista nominativa de quem está dentro (decisão de 14/08).
        PPMS_READ: 'PPMS_READ',
        // Moniteur Cantine (V020): retirar uma linha da vista de todos. LER o
        // monitor continua por área — isto governa só o gesto de apagar.
        CANTINE_REMOVAL_WRITE: 'CANTINE_REMOVAL_WRITE',
        // Planning da cantina (V021): alterar os créneaux e as turmas.
        // LER continua por área — isto governa só a alteração.
        MEAL_SLOT_WRITE: 'MEAL_SLOT_WRITE',
        // Parcours du jour (recherche globale): traverse toute l'école,
        // donc une permission et non un secteur.
        PARCOURS_READ: 'PARCOURS_READ',
        // Réglages du système (V024): lire ET modifier — même permission.
        CONFIG_WRITE: 'CONFIG_WRITE',
        // Exclusions du CDI (V025) : donnée sensible sur mineur — lecture
        // ET écriture par cette permission, jamais par secteur.
        CDI_EXCLUSION_WRITE: 'CDI_EXCLUSION_WRITE'
    };

    /**
     * A tela pode ESCREVER?
     *
     * Espelha o gate do backend: `hasRole('ADMIN') OR
     * @areaSecurity.hasPermission('...')`. Deliberadamente NÃO olha o papel
     * OPERATOR: papel não é permissão. Um OPERATOR sem o direito veria botões
     * que o servidor recusa com 403, e alguém com o direito num papel
     * diferente ficaria travado sem motivo.
     *
     * O `isAdmin()` fica na frente mesmo sendo redundante (o `hasPermission`
     * do auth.js já libera ADMIN): se um dia `hasPermission` sumir do bundle
     * — carga parcial, versão antiga do arquivo —, o administrador continua
     * trabalhando em vez de ficar trancado fora da própria tela.
     *
     * @param auth       objeto window.auth (pode faltar durante a carga)
     * @param permission nome da permissão, ex. 'EXIT_PERMISSION_WRITE'
     * @returns {boolean} sempre booleano — nunca undefined, que em `disabled=`
     *                    se comporta como false e esconde o motivo real.
     */
    function canWrite(auth, permission) {
        if (!auth || !permission) return false;
        if (typeof auth.isAdmin === 'function' && auth.isAdmin()) return true;
        if (typeof auth.hasPermission !== 'function') return false;
        return auth.hasPermission(permission) === true;
    }

    /**
     * O Dashboard deve mostrar o ATALHO para uma tela de gestão?
     *
     * As telas de gestão (Droits Repas, Sorties) são `hidden` e da área
     * `admin`, então a regra padrão do Dashboard não as oferece a ninguém. O
     * ADMIN chega nelas pelo Painel Administrativo; o OPERATOR **não** — o
     * painel exige o PIN de admin. Sem este atalho, quem tem a permissão
     * granular não tem por onde entrar: a permissão existe, o backend aceita,
     * e a pessoa não alcança a tela.
     *
     * Por que `!isAdmin`: o administrador entra pelo painel e veria o card
     * duplicado no Dashboard. Não é uma restrição de direito — é onde cada
     * papel entra.
     *
     * A negação vem PRIMEIRO de propósito. `canWrite` devolve true para admin
     * (espelha o `hasRole('ADMIN') OR hasPermission(...)` do backend), então
     * sem o `!isAdmin` na frente o admin veria os dois caminhos.
     */
    function mostraAtalhoNoDashboard(auth, permission) {
        if (!auth || !permission) return false;
        if (typeof auth.isAdmin === 'function' && auth.isAdmin()) return false;
        return canWrite(auth, permission);
    }

    /**
     * O card deste ponto aparece no Dashboard para este login?
     *
     * ⚠️ A REGRA INTEIRA num lugar so, e os pontos ESPECIAIS avaliados ANTES da
     * regra padrao. A primeira versao vivia inline no filter do Dashboard, com
     * a regra padrao PRIMEIRO — `!point.hidden && canAccessArea(area)` — e o
     * PPMS e nao-hidden com area 'portail': todo operador do setor do portao
     * (exatamente a equipe que a restricao mirava) recebia true ANTES de o
     * PPMS_READ ser consultado. O ramo do PPMS era codigo morto para eles, e a
     * lista nominativa de menores abria sem a permissao. Provado executando o
     * filtro real; apanhado pelo painel de revisao (seguranca/RGPD, 14/08).
     * Inline nao tinha teste POSSIVEL — aqui tem.
     */
    function podeVerPonto(auth, point) {
        if (!auth || !point) return false;
        // Pontos atras de permissao granular — SEMPRE antes da regra padrao.
        if (point.id === 'MEAL_ENTITLEMENT_MANAGEMENT') {
            return mostraAtalhoNoDashboard(auth, PERMISSIONS.MEAL_ENTITLEMENT_WRITE);
        }
        if (point.id === 'EXIT_PERMISSION_MANAGEMENT') {
            return mostraAtalhoNoDashboard(auth, PERMISSIONS.EXIT_PERMISSION_WRITE);
        }
        // (Resolucao de merge 14/08: o caso vivia inline no Dashboard, no lado
        // do regime; entrou aqui quando o filtro virou este predicado.)
        if (point.id === 'CDI_EXCLUSION_MANAGEMENT') {
            return mostraAtalhoNoDashboard(auth, PERMISSIONS.CDI_EXCLUSION_WRITE);
        }
        if (point.id === 'MEAL_SLOT_MANAGEMENT') {
            return mostraAtalhoNoDashboard(auth, PERMISSIONS.MEAL_SLOT_WRITE);
        }
        if (point.id === 'REGIME_MANAGEMENT') {
            return mostraAtalhoNoDashboard(auth, PERMISSIONS.REGIME_WRITE);
        }
        if (point.id === 'PPMS') {
            // Restrita, nao fechada (decisao do dono, 14/08): Vie Scolaire,
            // direcao, enfermaria — via PPMS_READ. Espelha o @PreAuthorize do
            // PpmsController. Diferente das telas de gestao, o ADMIN VE o card:
            // mostraAtalhoNoDashboard esconde do admin porque ele entra pelo
            // painel; numa evacuacao ninguem navega por dois caminhos.
            if (typeof auth.isAdmin === 'function' && auth.isAdmin()) return true;
            return canWrite(auth, PERMISSIONS.PPMS_READ);
        }
        // Regra padrao: visivel se nao-hidden e o login tem a area.
        return !point.hidden && typeof auth.canAccessArea === 'function'
                && auth.canAccessArea(point.area);
    }

    /** Atalho para a tela de Sorties (`POST/revoke /api/admin/exit-permissions`). */
    function canWriteExitPermissions(auth) {
        return canWrite(auth, PERMISSIONS.EXIT_PERMISSION_WRITE);
    }

    /** Atalho para a tela de Droits Repas (`PUT/bulk /api/admin/meal-entitlements`). */
    function canWriteMealEntitlements(auth) {
        return canWrite(auth, PERMISSIONS.MEAL_ENTITLEMENT_WRITE);
    }

    /**
     * O × das linhas do Moniteur Cantine (`POST/DELETE
     * /api/admin/cantine/removals/{pointId}/{userId}`).
     *
     * ⚠️ Isto espelha SÓ a primeira metade do gate do backend. A segunda
     * (`@areaSecurity.can(#pointId)`) não é espelhada aqui de propósito: quem
     * abriu o Moniteur Cantine já passou pela área `cantine`, e a tela só
     * mostra pontos de refeitório. Duplicar a regra de área no cliente seria a
     * quarta cópia de um mapeamento que já vive em dois sítios
     * (AreaMapping / constants.js) — e a cópia que ninguém se lembraria de
     * atualizar. O servidor continua a ser a autoridade.
     */
    function canRemoveCantineLines(auth) {
        return canWrite(auth, PERMISSIONS.CANTINE_REMOVAL_WRITE);
    }

    return {
        PERMISSIONS: PERMISSIONS,
        canWrite: canWrite,
        mostraAtalhoNoDashboard: mostraAtalhoNoDashboard,
        podeVerPonto: podeVerPonto,
        canWriteExitPermissions: canWriteExitPermissions,
        canWriteMealEntitlements: canWriteMealEntitlements,
        canRemoveCantineLines: canRemoveCantineLines
    };
});
