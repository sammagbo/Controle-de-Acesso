import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import C from '../js/utils/ppmsCache.js';

/**
 * O RETRATO DO PPMS EM DISCO — e as três razões de apagá-lo.
 *
 * A lista nominativa do PPMS é guardada no localStorage a cada carga boa,
 * porque numa evacuação a rede é a primeira coisa que cai. São nomes,
 * matrículas e turmas de MENORES no disco de um quiosque compartilhado: a
 * decisão só se sustenta enquanto as regras de apagar forem respeitadas.
 *
 * ⚠️ Até 15/08/2026 elas não tinham teste nenhum. O painel de revisão foi
 * explícito: «o comportamento existe, a prova é ler o código.» Ler código não é
 * prova — é a leitura de quem já sabe o que procurar.
 */
describe('ppmsCache — quando o retrato de menores é apagado do disco', () => {

    const REPO = path.resolve(__dirname, '..');

    // ─────────────────────────────────────────────────────────────
    describe('★★★ razão 1 — o servidor recusou ESTE login (403/401)', () => {

        it('★★★ 403 e 401 são recusa de permissão', () => {
            // Sem esta distinção, o 403 caía no mesmo catch de uma queda de
            // rede e a tela pintava o retrato guardado — nome, matrícula e
            // turma de menores, do disco, para quem o servidor acabou de
            // recusar. E o retrato ficava lá.
            expect(C.recusaDePermissao(403)).toBe(true);
            expect(C.recusaDePermissao(401)).toBe(true);
        });

        it('★★★ queda de REDE não é recusa — e aí o retrato SERVE', () => {
            // O inverso é igualmente importante: apagar o cache quando a rede
            // cai destruiria a única cópia disponível justamente durante a
            // evacuação em que ela existe para ser usada.
            expect(C.recusaDePermissao(undefined)).toBe(false);
            expect(C.recusaDePermissao(null)).toBe(false);
            expect(C.recusaDePermissao(0)).toBe(false);
            expect(C.recusaDePermissao(500)).toBe(false);
            expect(C.recusaDePermissao(502)).toBe(false);
            expect(C.recusaDePermissao(200)).toBe(false);
        });

        it('devolve BOOLEANO, nunca undefined', () => {
            // `if (undefined)` e `if (false)` se comportam igual, e é assim que
            // uma regra de segurança some sem ninguém ver.
            expect(typeof C.recusaDePermissao(403)).toBe('boolean');
            expect(typeof C.recusaDePermissao(999)).toBe('boolean');
        });
    });

    // ─────────────────────────────────────────────────────────────
    describe('★★ razão 2 — o retrato é de outro dia', () => {

        it('★★ retrato de hoje serve', () => {
            const r = { geradoEm: '2026-08-15T09:12:00', totalDentro: 42 };
            expect(C.aindaServe(r, '2026-08-15')).toBe(r);
        });

        it('★★★ retrato de ONTEM é descartado', () => {
            // Às 8h de terça, o retrato de segunda às 17h descreve uma escola
            // que não existe — e quem o lê vai procurar gente que foi para casa.
            const r = { geradoEm: '2026-08-14T17:00:00', totalDentro: 42 };
            expect(C.aindaServe(r, '2026-08-15')).toBeNull();
        });

        it('★★ retrato SEM data é descartado', () => {
            // Na dúvida sobre QUANDO a lista foi feita, ela não pode ser
            // mostrada como se fosse de agora.
            expect(C.aindaServe({ totalDentro: 42 }, '2026-08-15')).toBeNull();
            expect(C.aindaServe({ geradoEm: null }, '2026-08-15')).toBeNull();
            expect(C.aindaServe({ geradoEm: 'ontem' }, '2026-08-15')).toBeNull();
        });

        it('lixo no localStorage não estoura', () => {
            expect(C.aindaServe(null, '2026-08-15')).toBeNull();
            expect(C.aindaServe('texto', '2026-08-15')).toBeNull();
            expect(C.aindaServe(undefined, '2026-08-15')).toBeNull();
        });
    });

    // ─────────────────────────────────────────────────────────────
    describe('★★ apagar — nunca lança, numa tela de evacuação', () => {

        it('apaga usando a chave certa', () => {
            const apagadas = [];
            const store = { removeItem: (k) => apagadas.push(k) };
            expect(C.apagar(store)).toBe(true);
            expect(apagadas).toEqual([C.CHAVE]);
        });

        it('★★ localStorage indisponível (modo privado, cota) não derruba a tela', () => {
            const store = { removeItem: () => { throw new Error('SecurityError'); } };
            expect(() => C.apagar(store)).not.toThrow();
            expect(C.apagar(store)).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────
    describe('★★★ razão 3 — a chave existe UMA vez', () => {

        it('★★★ nenhum outro arquivo repete a string da chave', () => {
            // Estava duplicada como literal em PpmsView.js e em auth.js.
            // Renomear num lugar e não no outro deixaria retrato nominativo em
            // disco depois do logout — e nada quebraria para avisar.
            const alvos = ['js/components/PpmsView.js', 'js/utils/auth.js'];
            const comLiteral = alvos.filter(f => {
                const txt = fs.readFileSync(path.join(REPO, f), 'utf8');
                // auth.js guarda um fallback literal para o caso de o módulo
                // não ter carregado; ele é aceito, mas só ali e só uma vez.
                const ocorrencias = (txt.match(/'magbo\.ppms\.ultimo'/g) || []).length;
                return f.endsWith('auth.js') ? ocorrencias > 1 : ocorrencias > 0;
            });
            expect(comLiteral,
                `Estes arquivos repetem a chave em vez de usar MagboPpmsCache.CHAVE: `
                + `${comLiteral.join(', ')}. Renomear a chave num lugar e não no outro `
                + 'deixa lista nominativa de menores em disco, em silêncio.')
                .toEqual([]);
        });

        it('★★ o logout apaga o retrato', () => {
            const txt = fs.readFileSync(path.join(REPO, 'js/utils/auth.js'), 'utf8');
            const clear = txt.slice(txt.indexOf('clearAuth'), txt.indexOf('clearAuth') + 900);
            expect(/MagboPpmsCache\.apagar|magbo\.ppms\.ultimo/.test(clear),
                'clearAuth precisa apagar o retrato do PPMS: o quiosque é '
                + 'compartilhado, e a lista nominativa não pode sobreviver à '
                + 'pessoa que a carregou.')
                .toBe(true);
        });
    });
});
