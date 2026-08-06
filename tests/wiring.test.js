import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A FIAÇÃO DO index.html.
 *
 * Este projeto não tem bundler: cada arquivo de js/ existe em runtime porque
 * há uma linha `<script src=...>` no index.html, e por nenhum outro motivo.
 * Isso cria uma classe de defeito que NENHUM outro teste da suíte alcança —
 * os testes fazem `import` do módulo direto do disco, então passam
 * perfeitamente com um index.html que não carrega esse módulo.
 *
 * Foi exatamente o que aconteceu em 06/08/2026: duas branches acrescentaram um
 * módulo cada uma, ambas ancorando na MESMA linha do index.html. A resolução do
 * conflito ficou com o lado "que já existia" e levou as duas tags junto. Os 181
 * testes continuaram verdes. Em runtime:
 *
 *   • Sorties        → window.MagboPermissions era undefined no corpo do
 *                      componente: TypeError no render, TELA BRANCA;
 *   • Droits Repas   → window.MagboMealEntitlement só é lido dentro do
 *                      handler do clique, e ANTES do try/catch, dentro de uma
 *                      função async: a tela abre normal e o clique no badge
 *                      não faz NADA, sem erro visível. Mudo.
 *
 * Três invariantes, que é o que este arquivo cobra:
 *   1. todo arquivo de js/ está no index.html (e vice-versa);
 *   2. todo window.Magbo* consumido tem o dono carregado;
 *   3. o dono é carregado ANTES de quem o consome.
 */

const REPO = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

/** Todo .js sob js/, em caminho relativo com barra normal (Windows inclusive). */
function arquivosDeJs(dir = path.join(REPO, 'js'), out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) arquivosDeJs(p, out);
        else if (e.name.endsWith('.js')) out.push(rel(p));
    }
    return out;
}

function rel(abs) {
    return path.relative(REPO, abs).replace(/\\/g, '/');
}

function ler(relPath) {
    return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

/**
 * `<script src="js/...">` do index.html, com a POSIÇÃO EM CARACTERES.
 *
 * Posição no texto, e não índice num array, para poder comparar com um
 * `<script>` inline — que também consome globais e também depende da ordem.
 */
const SCRIPT_SRC = /<script[^>]*\ssrc="(js\/[^"?]+)(?:\?[^"]*)?"/g;

function scriptsDoHtml() {
    const out = [];
    for (const m of HTML.matchAll(SCRIPT_SRC)) {
        out.push({ arquivo: m[1], pos: m.index });
    }
    return out;
}

/** Blocos `<script>` sem src — código escrito dentro do próprio index.html. */
function scriptsInline() {
    const out = [];
    const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
    for (const m of HTML.matchAll(re)) {
        out.push({ conteudo: m[1], pos: m.index });
    }
    return out;
}

/** Nome do global que cada módulo UMD publica: `root.MagboX = api`. */
function donosDeGlobais(arquivos) {
    const donos = {};
    for (const f of arquivos) {
        const m = ler(f).match(/root\.(Magbo\w+)\s*=/);
        if (m) donos[m[1]] = f;
    }
    return donos;
}

/** Todo `window.MagboX` citado num texto. */
function globaisUsados(texto) {
    return [...new Set([...texto.matchAll(/window\.(Magbo\w+)/g)].map(m => m[1]))];
}

const ARQUIVOS = arquivosDeJs();
const SCRIPTS = scriptsDoHtml();
const CARREGADOS = new Set(SCRIPTS.map(s => s.arquivo));
const POSICAO = new Map(SCRIPTS.map(s => [s.arquivo, s.pos]));
const DONOS = donosDeGlobais(ARQUIVOS);

describe('fiação do index.html', () => {

    it('o cenário faz sentido (há arquivos e há scripts para conferir)', () => {
        expect(ARQUIVOS.length).toBeGreaterThan(30);
        expect(SCRIPTS.length).toBeGreaterThan(30);
        expect(Object.keys(DONOS).length).toBeGreaterThan(3);
    });

    // ─────────────────────────────────────────────────────────────
    describe('1. index.html e js/ dizem a mesma coisa', () => {

        it('★ todo arquivo de js/ é carregado pelo index.html', () => {
            const ausentes = ARQUIVOS.filter(f => !CARREGADOS.has(f));
            expect(ausentes, 'arquivo em js/ que o index.html não carrega — existe no disco, '
                + 'passa nos testes, e não existe em runtime').toEqual([]);
        });

        it('todo src do index.html aponta para um arquivo que existe', () => {
            // O reverso do anterior: um caminho com erro de digitação não dá
            // erro visível, o <script> só não carrega.
            const quebrados = SCRIPTS
                .map(s => s.arquivo)
                .filter(f => !fs.existsSync(path.join(REPO, f)));
            expect(quebrados, 'src do index.html sem arquivo correspondente').toEqual([]);
        });

        it('nenhum arquivo é carregado duas vezes', () => {
            const vistos = new Set();
            const repetidos = [];
            SCRIPTS.forEach(s => {
                if (vistos.has(s.arquivo)) repetidos.push(s.arquivo);
                vistos.add(s.arquivo);
            });
            expect(repetidos).toEqual([]);
        });
    });

    // ─────────────────────────────────────────────────────────────
    describe('2. todo window.Magbo* consumido tem dono carregado', () => {

        it('★ nenhum global fica undefined em runtime', () => {
            const quebrados = [];
            for (const f of ARQUIVOS) {
                for (const g of globaisUsados(ler(f))) {
                    const dono = DONOS[g];
                    if (!dono || dono === f) continue;   // global externo, ou o próprio dono
                    if (!CARREGADOS.has(dono)) {
                        quebrados.push(`${f} usa window.${g}, mas ${dono} não está no index.html`);
                    }
                }
            }
            expect(quebrados).toEqual([]);
        });

        it('★ os dois módulos que sumiram no merge de 06/08 estão carregados', () => {
            // Regressão nomeada: se alguém reabrir o conflito e escolher o lado
            // errado de novo, este teste diz exatamente o que se perdeu.
            expect(CARREGADOS).toContain('js/utils/permissions.js');
            expect(CARREGADOS).toContain('js/utils/mealEntitlement.js');
        });

        it('★ as duas telas que quebraram têm o dono do seu global carregado', () => {
            const casos = [
                ['js/components/ExitPermissionManagement.js', 'MagboPermissions'],
                ['js/components/MealEntitlementManagement.js', 'MagboMealEntitlement']
            ];
            for (const [tela, global] of casos) {
                expect(globaisUsados(ler(tela)),
                    `${tela} deveria consumir window.${global}`).toContain(global);
                expect(CARREGADOS, `dono de ${global} fora do index.html`)
                    .toContain(DONOS[global]);
            }
        });

        it('todo módulo UMD tem um dono identificável', () => {
            // Um módulo que exporta para o Vitest mas esquece o `root.X = api`
            // nunca existe no navegador.
            const umd = ARQUIVOS.filter(f => /module\.exports\s*=\s*api/.test(ler(f)));
            const semDono = umd.filter(f => !Object.values(DONOS).includes(f));
            expect(semDono, 'módulo UMD sem `root.MagboX = api`').toEqual([]);
        });
    });

    // ─────────────────────────────────────────────────────────────
    describe('3. o dono carrega ANTES de quem consome', () => {

        it('★ nenhuma ordem invertida entre arquivos de js/', () => {
            const invertidos = [];
            for (const f of ARQUIVOS) {
                const posUso = POSICAO.get(f);
                if (posUso == null) continue;   // coberto pelo bloco 1
                for (const g of globaisUsados(ler(f))) {
                    const dono = DONOS[g];
                    if (!dono || dono === f) continue;
                    const posDono = POSICAO.get(dono);
                    if (posDono != null && posDono > posUso) {
                        invertidos.push(`${f} usa window.${g}, mas ${dono} carrega DEPOIS`);
                    }
                }
            }
            expect(invertidos).toEqual([]);
        });

        it('★ script inline do index.html não usa global carregado depois dele', () => {
            // O `window.MagboI18n.init()` inline é o caso real: se a tag do
            // i18n.js descer uma linha, ele quebra na carga da página.
            const invertidos = [];
            for (const bloco of scriptsInline()) {
                for (const g of globaisUsados(bloco.conteudo)) {
                    const dono = DONOS[g];
                    if (!dono) continue;
                    const posDono = POSICAO.get(dono);
                    if (posDono == null) {
                        invertidos.push(`script inline usa window.${g}, mas ${dono} não está carregado`);
                    } else if (posDono > bloco.pos) {
                        invertidos.push(`script inline usa window.${g} antes de ${dono} carregar`);
                    }
                }
            }
            expect(invertidos).toEqual([]);
        });

        it('os utilitários carregam antes dos componentes', () => {
            // Invariante estrutural do index.html, não uma consequência: os
            // componentes consomem os utilitários, nunca o contrário.
            const ultimoUtil = Math.max(...SCRIPTS
                .filter(s => s.arquivo.startsWith('js/utils/')).map(s => s.pos));
            const primeiroComp = Math.min(...SCRIPTS
                .filter(s => s.arquivo.startsWith('js/components/')).map(s => s.pos));
            expect(ultimoUtil).toBeLessThan(primeiroComp);
        });

        it('js/App.js é o último — ele monta a árvore', () => {
            const ultimo = SCRIPTS[SCRIPTS.length - 1];
            expect(ultimo.arquivo).toBe('js/App.js');
        });
    });
});
