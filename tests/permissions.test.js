import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import P from '../js/utils/permissions.js';

/**
 * GATE DE ESCRITA DA UI.
 *
 * O defeito que originou este arquivo: a tela de Sorties habilitava
 * "Nova Autorização" e "Revogar" com `isAdmin() || isOperator()`, enquanto
 * `POST /api/admin/exit-permissions` aceita `ADMIN OU EXIT_PERMISSION_WRITE`.
 * Papel não é permissão, e o descasamento erra dos DOIS lados:
 *
 *   • OPERATOR sem o direito  → botão ativo, servidor devolve 403;
 *   • quem tem o direito num papel que não é OPERATOR → tela travada.
 *
 * Os testes cobrem as duas pontas, e o último grupo exercita o
 * `hasPermission` REAL de js/utils/auth.js — não uma imitação —, porque é lá
 * que mora o parsing do CSV de permissões.
 */
describe('permissions — gate de escrita', () => {

    /** Dublê do window.auth com o contrato mínimo que canWrite consome. */
    const auth = ({ admin = false, permissoes = null }) => ({
        isAdmin: () => admin,
        hasPermission: (p) => {
            if (admin) return true;
            if (!permissoes) return false;
            if (permissoes.trim() === '*') return true;
            return permissoes.split(',').map(s => s.trim().toUpperCase()).includes(String(p).toUpperCase());
        }
    });

    describe('quem PODE escrever', () => {
        it('ADMIN sempre pode', () => {
            expect(P.canWriteExitPermissions(auth({ admin: true }))).toBe(true);
            expect(P.canWriteMealEntitlements(auth({ admin: true }))).toBe(true);
        });

        it('★ quem tem a permissão granular pode, mesmo sem ser ADMIN', () => {
            const operador = auth({ permissoes: 'EXIT_PERMISSION_WRITE' });
            expect(P.canWriteExitPermissions(operador)).toBe(true);
        });

        it('permissao "*" libera tudo', () => {
            const coringa = auth({ permissoes: '*' });
            expect(P.canWriteExitPermissions(coringa)).toBe(true);
            expect(P.canWriteMealEntitlements(coringa)).toBe(true);
        });

        it('CSV com varias permissoes e espacos', () => {
            const misto = auth({ permissoes: ' ATTEMPTS_READ , EXIT_PERMISSION_WRITE ' });
            expect(P.canWriteExitPermissions(misto)).toBe(true);
        });
    });

    describe('quem NAO pode escrever', () => {
        it('★ sem nenhuma permissao, ainda que logado', () => {
            expect(P.canWriteExitPermissions(auth({}))).toBe(false);
        });

        it('★ a permissao da cantina NAO abre a tela de saidas', () => {
            const cantina = auth({ permissoes: 'MEAL_ENTITLEMENT_WRITE' });
            expect(P.canWriteExitPermissions(cantina)).toBe(false);
            expect(P.canWriteMealEntitlements(cantina)).toBe(true);
        });

        it('ATTEMPTS_READ e leitura, nao escrita', () => {
            const leitor = auth({ permissoes: 'ATTEMPTS_READ' });
            expect(P.canWriteExitPermissions(leitor)).toBe(false);
            expect(P.canWriteMealEntitlements(leitor)).toBe(false);
        });

        it('nome parecido nao conta (sem prefixo/sufixo solto)', () => {
            const quase = auth({ permissoes: 'EXIT_PERMISSION' });
            expect(P.canWriteExitPermissions(quase)).toBe(false);
        });
    });

    describe('robustez — a tela carrega antes do login', () => {
        it('auth ausente nao estoura e devolve false', () => {
            expect(P.canWrite(null, 'EXIT_PERMISSION_WRITE')).toBe(false);
            expect(P.canWrite(undefined, 'EXIT_PERMISSION_WRITE')).toBe(false);
        });

        it('permissao ausente devolve false', () => {
            expect(P.canWrite(auth({ admin: true }), null)).toBe(false);
        });

        it('★ ADMIN passa mesmo se hasPermission nao existir no bundle', () => {
            expect(P.canWrite({ isAdmin: () => true }, 'EXIT_PERMISSION_WRITE')).toBe(true);
        });

        it('sem hasPermission e sem ser admin, false', () => {
            expect(P.canWrite({ isAdmin: () => false }, 'EXIT_PERMISSION_WRITE')).toBe(false);
        });

        it('★ devolve BOOLEANO, nunca undefined', () => {
            // `disabled={undefined}` se comporta como false e esconde o motivo:
            // o campo fica habilitado para quem nao tem direito.
            const r = P.canWrite({ isAdmin: () => false, hasPermission: () => undefined }, 'X');
            expect(r).toBe(false);
            expect(typeof r).toBe('boolean');
        });
    });

    /**
     * O ATALHO DO DASHBOARD — o defeito que ele conserta.
     *
     * A correção de permissão da tela de Sorties foi entregue e o backend
     * aceita o OPERATOR com EXIT_PERMISSION_WRITE. Mas a tela é `hidden` e da
     * área `admin`, então o Dashboard não a oferecia a ninguém, e o Painel
     * Administrativo — o outro caminho — exige PIN admin-only. Resultado: a
     * pessoa tinha o direito, o servidor aceitava, e não havia por onde entrar.
     */
    describe('★ atalho no Dashboard para as telas de gestão', () => {

        it('★ OPERATOR com a permissão granular VÊ o atalho', () => {
            const operador = auth({ permissoes: 'EXIT_PERMISSION_WRITE' });
            expect(P.mostraAtalhoNoDashboard(operador, P.PERMISSIONS.EXIT_PERMISSION_WRITE)).toBe(true);
        });

        it('OPERATOR sem a permissão NÃO vê', () => {
            const operador = auth({ permissoes: 'ATTEMPTS_READ' });
            expect(P.mostraAtalhoNoDashboard(operador, P.PERMISSIONS.EXIT_PERMISSION_WRITE)).toBe(false);
        });

        it('★ ADMIN não vê o atalho — ele entra pelo Painel Administrativo', () => {
            // Não é restrição de direito: é onde cada papel entra. Sem isto o
            // admin veria o card duplicado (Dashboard + painel).
            expect(P.mostraAtalhoNoDashboard(auth({ admin: true }), P.PERMISSIONS.EXIT_PERMISSION_WRITE)).toBe(false);
        });

        it('a permissão da CANTINA não abre a tela de SORTIES', () => {
            // Cada atalho é governado pela sua própria permissão — foi o
            // erro que a permissão granular existe para impedir.
            const cantina = auth({ permissoes: 'MEAL_ENTITLEMENT_WRITE' });
            expect(P.mostraAtalhoNoDashboard(cantina, P.PERMISSIONS.EXIT_PERMISSION_WRITE)).toBe(false);
            expect(P.mostraAtalhoNoDashboard(cantina, P.PERMISSIONS.MEAL_ENTITLEMENT_WRITE)).toBe(true);
        });

        it('permissão "*" abre os dois atalhos', () => {
            const coringa = auth({ permissoes: '*' });
            expect(P.mostraAtalhoNoDashboard(coringa, P.PERMISSIONS.EXIT_PERMISSION_WRITE)).toBe(true);
            expect(P.mostraAtalhoNoDashboard(coringa, P.PERMISSIONS.MEAL_ENTITLEMENT_WRITE)).toBe(true);
        });

        it('sem auth (tela carregando) devolve false, nunca undefined', () => {
            expect(P.mostraAtalhoNoDashboard(null, P.PERMISSIONS.EXIT_PERMISSION_WRITE)).toBe(false);
            expect(P.mostraAtalhoNoDashboard(undefined, P.PERMISSIONS.EXIT_PERMISSION_WRITE)).toBe(false);
            expect(P.mostraAtalhoNoDashboard({}, P.PERMISSIONS.EXIT_PERMISSION_WRITE)).toBe(false);
        });

        it('permissão ausente devolve false', () => {
            expect(P.mostraAtalhoNoDashboard(auth({ permissoes: '*' }), null)).toBe(false);
        });
    });

    describe('nomes espelhados do backend', () => {
        it('batem com security/Permissions.java', () => {
            expect(P.PERMISSIONS).toEqual({
                MEAL_ENTITLEMENT_WRITE: 'MEAL_ENTITLEMENT_WRITE',
                EXIT_PERMISSION_WRITE: 'EXIT_PERMISSION_WRITE',
                ATTEMPTS_READ: 'ATTEMPTS_READ',
                // PPMS: a lista nominativa deixou de ser isAuthenticated() em 14/08.
                PPMS_READ: 'PPMS_READ'
            });
        });
    });
});

/**
 * Integração com o auth.js DE VERDADE.
 *
 * auth.js é uma IIFE que pendura `auth` em globalThis quando não há window —
 * escrito assim de propósito para ser exercitável fora do Electron. O único
 * caminho que preenche o usuário é `login()`, então o fetch é dublado: o que
 * se testa é o parsing do CSV `permissoes` que vem do backend, que é onde um
 * erro passaria despercebido.
 */
describe('permissions — integrado com o auth.js real', () => {
    let authReal;
    const fetchOriginal = globalThis.fetch;

    const logarComo = async (role, permissoes) => {
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                token: 'jwt-de-teste',
                username: 'op',
                nomeCompleto: 'Operador de Teste',
                role: role,
                setoresPermitidos: 'portail',
                permissoes: permissoes
            })
        }));
        await authReal.login('op', 'x');
    };

    beforeEach(async () => {
        vi.resetModules();
        delete globalThis.auth;
        if (typeof window !== 'undefined') delete window.auth;
        await import('../js/utils/auth.js');
        authReal = (typeof window !== 'undefined' && window.auth) || globalThis.auth;
    });

    afterEach(() => {
        globalThis.fetch = fetchOriginal;
        if (authReal) authReal.logout();
    });

    it('auth.js se deixa carregar fora do Electron', () => {
        expect(typeof authReal.hasPermission).toBe('function');
    });

    it('deslogado nao escreve', () => {
        expect(P.canWriteExitPermissions(authReal)).toBe(false);
    });

    it('★ OPERATOR com EXIT_PERMISSION_WRITE escreve na tela de saidas', async () => {
        await logarComo('OPERATOR', 'EXIT_PERMISSION_WRITE');
        expect(P.canWriteExitPermissions(authReal)).toBe(true);
    });

    it('★ OPERATOR sem a permissao NAO escreve — era o 403 garantido', async () => {
        await logarComo('OPERATOR', null);
        expect(authReal.isOperator()).toBe(true);   // o criterio antigo diria "pode"
        expect(P.canWriteExitPermissions(authReal)).toBe(false);
    });

    it('OPERATOR so da cantina nao escreve saidas', async () => {
        await logarComo('OPERATOR', 'MEAL_ENTITLEMENT_WRITE');
        expect(P.canWriteExitPermissions(authReal)).toBe(false);
        expect(P.canWriteMealEntitlements(authReal)).toBe(true);
    });

    it('ADMIN escreve sem CSV nenhum', async () => {
        await logarComo('ADMIN', null);
        expect(P.canWriteExitPermissions(authReal)).toBe(true);
    });

    it('logout tira o direito', async () => {
        await logarComo('OPERATOR', 'EXIT_PERMISSION_WRITE');
        authReal.logout();
        expect(P.canWriteExitPermissions(authReal)).toBe(false);
    });
});
