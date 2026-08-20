import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * O RETRATO DE UMA PESSOA PASSA POR <PersonPhoto>, SEMPRE.
 *
 * A regra já estava escrita em .claude/rules/frontend.md desde a entrega das
 * fotos — e mesmo assim SEIS telas tinham um `<img>` cru em 20/08/2026, entre
 * elas a mais vista do sistema (o modal de passagem, que salta a cada
 * passagem). O sintoma que o dono relatou: a lista do setor mostrava o rosto e
 * o modal da MESMA pessoa, um clique depois, mostrava as iniciais.
 *
 * ⚠️ POR QUE NINGUÉM VIU: `normaliseUser` (js/utils/api.js) preenche
 * `foto_url` com o SVG de iniciais quando não há outra coisa. Então
 * `<img src={user.foto_url || DEFAULT_AVATAR}>` nunca fica vazio, nunca dá
 * 404, nunca dispara `onError` — ele simplesmente mostra as iniciais para
 * sempre, com toda a cara de estar funcionando. A foto importada
 * (`user_photos`) não é sequer procurada: só o PersonPhoto fala com o
 * MagboPhotoCache, que é quem tem o token.
 *
 * Uma regra que vive só num arquivo de texto é uma regra que volta a ser
 * quebrada. Esta é a versão executável dela.
 */

const REPO = path.resolve(__dirname, '..');
const require2 = createRequire(import.meta.url);
const Babel = require2(path.join(REPO, 'libs', 'babel-standalone-8.0.4.min.js'));

function arquivosDeJs(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) arquivosDeJs(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

/**
 * Devolve os `<img>` cujo `src` menciona um identificador de foto de pessoa.
 *
 * ⚠️ AST e não regex, e a diferença importa: o `src` real que causou o defeito
 * era `{user.foto_url || DEFAULT_AVATAR}` — uma expressão, não um literal. Uma
 * busca em texto por `src="` não a veria, exatamente como o guarda do i18n não
 * via `{user.tipo}`. É a mesma família de ponto cego, e a lição é a mesma:
 * quando o defeito está numa EXPRESSÃO, o guarda tem de ler a árvore.
 */
const SINAL_DE_PESSOA = /^(foto_?[Uu]rl|photoUrl|fotoUrl|DEFAULT_AVATAR|localAvatar)$/;

function imgsDePessoa(src, arquivo) {
    const achados = [];
    const plugin = () => ({
        visitor: {
            JSXOpeningElement(caminho) {
                const nome = caminho.node.name;
                if (!nome || nome.type !== 'JSXIdentifier' || nome.name !== 'img') return;
                const attrSrc = caminho.node.attributes.find(
                    a => a.type === 'JSXAttribute' && a.name && a.name.name === 'src'
                );
                if (!attrSrc || !attrSrc.value || attrSrc.value.type !== 'JSXExpressionContainer') return;

                // Qualquer identificador ou propriedade sob o `src` que cheire
                // a foto de gente.
                let suspeito = false;
                const visitar = (no) => {
                    if (!no || typeof no !== 'object' || suspeito) return;
                    if (no.type === 'Identifier' && SINAL_DE_PESSOA.test(no.name)) { suspeito = true; return; }
                    for (const k of Object.keys(no)) {
                        const v = no[k];
                        if (Array.isArray(v)) v.forEach(visitar);
                        else if (v && typeof v === 'object' && v.type) visitar(v);
                    }
                };
                visitar(attrSrc.value.expression);
                if (suspeito) {
                    achados.push(`${arquivo}:${caminho.node.loc ? caminho.node.loc.start.line : '?'}`);
                }
            }
        }
    });

    Babel.transform(src, {
        filename: arquivo,
        presets: [['react', { runtime: 'classic' }]],
        plugins: [plugin],
        configFile: false, babelrc: false, code: false
    });
    return achados;
}

describe('PersonPhoto — nenhuma tela desenha um rosto por conta própria', () => {

    const alvos = [
        ...arquivosDeJs(path.join(REPO, 'js', 'components')),
        ...arquivosDeJs(path.join(REPO, 'js', 'cdi')),
    ].filter(p => !p.endsWith('PersonPhoto.js'));   // o próprio, que É o <img>

    it('★ nenhum <img> cru mostrando foto de pessoa', () => {
        const infratores = [];
        for (const arquivo of alvos) {
            const src = fs.readFileSync(arquivo, 'utf8');
            infratores.push(...imgsDePessoa(src, path.relative(REPO, arquivo).replace(/\\/g, '/')));
        }
        expect(
            infratores,
            'Use <PersonPhoto userId nome fotoUrl/>. Um <img> cru nunca alcança a foto ' +
            'importada (user_photos): o endpoint é autenticado e só o MagboPhotoCache ' +
            'manda o token. O resultado é a mesma pessoa com dois rostos em duas telas.'
        ).toEqual([]);
    });

    it('★ o modal de passagem usa PersonPhoto — foi o defeito relatado', () => {
        const modais = fs.readFileSync(path.join(REPO, 'js', 'components', 'AccessModals.js'), 'utf8');
        expect(modais).toMatch(/<PersonPhoto/);
        // DEFAULT_AVATAR era a queda genérica ("?" cinza). O PersonPhoto cai
        // nas iniciais DESTA pessoa, que diz mais e nunca some.
        expect(modais).not.toMatch(/DEFAULT_AVATAR/);
    });

    it('★ toda chamada a PersonPhoto passa userId — sem ele a foto nunca é buscada', () => {
        // Este é o modo de falha silencioso do conserto: trocar o <img> por
        // <PersonPhoto> e esquecer o `userId`. A tela continua bonita, cai nas
        // iniciais, e o defeito volta idêntico — só que agora com o nome certo
        // no código e ninguém procurando mais.
        const semId = [];
        for (const arquivo of alvos) {
            const src = fs.readFileSync(arquivo, 'utf8');
            const rel = path.relative(REPO, arquivo).replace(/\\/g, '/');
            for (const m of src.matchAll(/<PersonPhoto\b([\s\S]*?)\/>/g)) {
                if (!/\buserId\s*=/.test(m[1])) {
                    const linha = src.slice(0, m.index).split('\n').length;
                    semId.push(`${rel}:${linha}`);
                }
            }
        }
        expect(semId, '<PersonPhoto> sem userId cai sempre nas iniciais').toEqual([]);
    });

    it('★ PersonPhoto carrega antes de toda tela que o usa', () => {
        // Sem bundler, a ordem do <script> é a única garantia. Um consumidor
        // carregado antes recebe `undefined` como tipo de elemento e quebra a
        // renderização — que agora cai num ErrorBoundary, mas continua sendo
        // uma tela a menos.
        const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
        const posPhoto = index.indexOf('js/components/PersonPhoto.js');
        expect(posPhoto).toBeGreaterThan(-1);

        for (const arquivo of alvos) {
            const src = fs.readFileSync(arquivo, 'utf8');
            if (!/<PersonPhoto/.test(src)) continue;
            const base = path.basename(arquivo);
            const dir = arquivo.includes(path.join('js', 'cdi')) ? 'js/cdi' : 'js/components';
            const pos = index.indexOf(`${dir}/${base}`);
            if (pos === -1) continue;      // não empacotado no index (caso do CDI dinâmico)
            expect(posPhoto, `${base} carrega antes de PersonPhoto`).toBeLessThan(pos);
        }
    });
});
