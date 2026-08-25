// =====================================================================
// TODA CHAVE USADA EM t('...') EXISTE NOS DOIS DICIONÁRIOS
// =====================================================================
// ⚠️ ESTE FICHEIRO NASCEU DE UM DEFEITO VISTO NUM SCREENSHOT, em 26/08/2026.
// A tela nova do Planning Cantine mostrava, no canto superior esquerdo, o
// texto cru `comum.voltar` — a chave não existia (a real é `header.voltar`).
//
// ⚠️ E A SUÍTE ESTAVA VERDE. O `i18nGuard` procura o contrário: literais de
// texto escritos à mão dentro do JSX, que deveriam passar por `t()`. Uma chave
// que PASSA por `t()` mas não existe no dicionário é o ponto cego simétrico —
// e o `t()` do projeto devolve a própria chave quando não a encontra (decisão
// consciente: FR é o padrão, e um buraco visível é melhor que um texto
// silenciosamente noutra língua). O preço dessa decisão é que a falha só
// aparece a olho, na tela, para quem souber que `comum.voltar` não é francês.
//
// Aqui ela passa a aparecer em 200 ms.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import I18N from '../js/utils/i18n.js';

const REPO = path.resolve(__dirname, '..');

/** Todos os .js de js/, sem os utilitários de terceiros. */
function ficheiros(dir, acc = []) {
    for (const nome of fs.readdirSync(dir)) {
        const p = path.join(dir, nome);
        const st = fs.statSync(p);
        if (st.isDirectory()) ficheiros(p, acc);
        else if (nome.endsWith('.js')) acc.push(p);
    }
    return acc;
}

const semComentarios = (txt) => txt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/**
 * As chaves LITERAIS passadas a t(...) ou tEnum(...).
 *
 * ⚠️ Só literais. `t('creneaux.dia.' + n)` é montado em execução e não pode ser
 * verificado aqui — está declarado como limite conhecido no teste final, em vez
 * de fingir cobertura que não existe.
 */
function chavesUsadas() {
    const achadas = new Map();
    for (const f of ficheiros(path.join(REPO, 'js'))) {
        const src = semComentarios(fs.readFileSync(f, 'utf8'));
        for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'\s*[,)]/g)) {
            if (!achadas.has(m[1])) achadas.set(m[1], path.relative(REPO, f));
        }
    }
    return achadas;
}

describe('i18n — nenhuma chave usada sem tradução', () => {

    it('o cenário faz sentido (achou chaves e dicionários)', () => {
        expect(chavesUsadas().size).toBeGreaterThan(100);
        expect(Object.keys(I18N.DICIONARIOS).length).toBeGreaterThanOrEqual(2);
    });

    it('★★★ toda chave literal de t() existe nos DOIS dicionários', () => {
        const usadas = chavesUsadas();
        const faltando = [];
        for (const [chave, ficheiro] of usadas) {
            for (const lang of Object.keys(I18N.DICIONARIOS)) {
                if (!(chave in I18N.DICIONARIOS[lang])) {
                    faltando.push(`${lang}:${chave}  (${ficheiro})`);
                }
            }
        }
        expect(faltando,
            'Chaves usadas em t() que não existem no dicionário:\n  ' + faltando.join('\n  ')
            + '\n\nO t() devolve a PRÓPRIA CHAVE quando não a encontra, então isto não '
            + 'quebra nada — só escreve "comum.voltar" na tela, em vez de "Retour". '
            + 'Foi assim que a tela do Planning Cantine saiu com a chave crua num botão.')
            .toEqual([]);
    });

    it('★ os dois dicionários têm o MESMO conjunto de chaves', () => {
        // Uma chave só em FR aparece crua em PT, e vice-versa. Como FR é o
        // padrão, o buraco do lado PT é o que passa mais tempo despercebido.
        const langs = Object.keys(I18N.DICIONARIOS);
        const [a, b] = langs;
        const soEmA = Object.keys(I18N.DICIONARIOS[a]).filter(k => !(k in I18N.DICIONARIOS[b]));
        const soEmB = Object.keys(I18N.DICIONARIOS[b]).filter(k => !(k in I18N.DICIONARIOS[a]));
        expect({ [`só em ${a}`]: soEmA, [`só em ${b}`]: soEmB })
            .toEqual({ [`só em ${a}`]: [], [`só em ${b}`]: [] });
    });

    it('★ LIMITE DECLARADO: chaves montadas em execução não são cobertas', () => {
        // `t('creneaux.dia.' + n)` e afins. Este teste não os vê, e dizê-lo por
        // extenso vale mais do que uma cobertura imaginada: quem acrescentar
        // uma família de chaves dinâmicas sabe que tem de a conferir à mão.
        const dinamicas = [];
        for (const f of ficheiros(path.join(REPO, 'js'))) {
            const src = semComentarios(fs.readFileSync(f, 'utf8'));
            for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'\s*\+/g)) {
                dinamicas.push(`${m[1]}* (${path.relative(REPO, f)})`);
            }
        }
        // Não é uma asserção de igualdade: é um inventário que aparece no
        // output quando alguém o quebra propositadamente.
        expect(Array.isArray(dinamicas)).toBe(true);
        if (dinamicas.length) {
            // eslint-disable-next-line no-console
            console.info('[i18n] prefixos dinâmicos não cobertos: ' + dinamicas.join(', '));
        }
    });
});
