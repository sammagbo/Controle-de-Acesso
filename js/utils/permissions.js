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
        MEAL_ENTITLEMENT_WRITE: 'MEAL_ENTITLEMENT_WRITE',
        EXIT_PERMISSION_WRITE: 'EXIT_PERMISSION_WRITE',
        ATTEMPTS_READ: 'ATTEMPTS_READ'
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

    /** Atalho para a tela de Sorties (`POST/revoke /api/admin/exit-permissions`). */
    function canWriteExitPermissions(auth) {
        return canWrite(auth, PERMISSIONS.EXIT_PERMISSION_WRITE);
    }

    /** Atalho para a tela de Droits Repas (`PUT/bulk /api/admin/meal-entitlements`). */
    function canWriteMealEntitlements(auth) {
        return canWrite(auth, PERMISSIONS.MEAL_ENTITLEMENT_WRITE);
    }

    return {
        PERMISSIONS: PERMISSIONS,
        canWrite: canWrite,
        canWriteExitPermissions: canWriteExitPermissions,
        canWriteMealEntitlements: canWriteMealEntitlements
    };
});
