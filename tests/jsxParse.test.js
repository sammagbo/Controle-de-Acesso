import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * TODO ARQUIVO DE js/ PASSA PELO BABEL DO PRÓPRIO APP.
 *
 * Este projeto não tem bundler nem etapa de build: cada arquivo de js/ é
 * transformado EM RUNTIME pelo babel-standalone que o index.html carrega. Um
 * erro de sintaxe JSX não quebra teste nenhum — os testes importam os módulos
 * UMD direto do disco, e os componentes (a maioria dos arquivos) não são
 * importados por ninguém. O erro só aparece como TELA BRANCA no Electron.
 *
 * Descoberto na prática em 11/08/2026: durante a entrega dos gráficos do CDI,
 * a única forma de saber se o StatsModal.js editado ainda parseava era rodar o
 * Babel à mão. Este teste é aquela verificação manual, promovida a portão.
 *
 * ⚠️ Usa o MESMO binário que o app usa (libs/babel-standalone-8.0.4.min.js,
 * vendorizado), não um @babel/core do npm — a pergunta é "o app consegue
 * carregar este arquivo?", e quem responde é o Babel do app.
 *
 * Parse apenas: nada é executado. Referência a global inexistente, ordem de
 * carga, window.* — isso é assunto do wiring.test.js. Aqui só sintaxe.
 */

const REPO = path.resolve(__dirname, '..');

// babel-standalone é CommonJS puro; em ESM/vitest entra via createRequire.
const require2 = createRequire(import.meta.url);
const Babel = require2(path.join(REPO, 'libs', 'babel-standalone-8.0.4.min.js'));

function arquivosDeJs(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) arquivosDeJs(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const ARQUIVOS = arquivosDeJs(path.join(REPO, 'js'))
    .map(p => path.relative(REPO, p).replace(/\\/g, '/'));

describe('sintaxe JSX de js/ (o Babel do app)', () => {

    it('o cenário faz sentido (há arquivos e o Babel do app carregou)', () => {
        expect(ARQUIVOS.length).toBeGreaterThan(40);
        expect(typeof Babel.transform).toBe('function');
    });

    // Um teste POR ARQUIVO, e não um teste com um loop: quando quebrar, o nome
    // do arquivo quebrado está no título do teste vermelho, não no meio de um
    // stack trace — e os demais continuam sendo verificados.
    for (const arquivo of ARQUIVOS) {
        it(arquivo, () => {
            const fonte = fs.readFileSync(path.join(REPO, arquivo), 'utf8');
            expect(() => Babel.transform(fonte, { presets: ['react'], filename: arquivo }),
                `${arquivo} não parseia — no Electron isso é tela branca, sem erro de teste`)
                .not.toThrow();
        });
    }
});
