import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import T from '../js/utils/travaDeVoo.js';

/**
 * A TRAVA DE VOO — e a correção ao diagnóstico que a motivou.
 *
 * O relato era "falta guarda de requisição em voo, chegam respostas fora de
 * ordem". A primeira metade é verdade; a segunda não. O efeito do SectorView já
 * tinha `let vivo = true` com cleanup, e o React roda o cleanup do efeito
 * anterior ANTES do próximo — só a resposta do efeito mais recente escrevia
 * estado. Resposta fora de ordem nunca produziu estado fora de ordem.
 *
 * Os defeitos reais eram outros dois, e este arquivo prova os dois.
 */
describe('travaDeVoo — uma requisição por vez, e a resposta certa aplicada', () => {

    // ─────────────────────────────────────────────────────────────
    describe('★★★ defeito 1 — resposta BOA descartada (a faixa congelava)', () => {

        it('★★★ resposta do MESMO ponto é aplicável, mesmo vinda de um ciclo anterior', () => {
            // Este é o defeito que ninguém tinha nomeado. Com `vivo`, quando a
            // resposta N-1 chegava, o efeito que a pediu já fora limpo e ela era
            // jogada fora — mesmo sendo do mesmo ponto e mais fresca do que o
            // que estava na tela. Num período lento a faixa CONGELA enquanto a
            // rede trabalha.
            const t = T.criar();
            expect(t.aplicavel('PORT1', 'PORT1')).toBe(true);
        });

        it('★★★ resposta de OUTRO ponto é descartada', () => {
            // O que o descarte deve pegar: a resposta do PORT1 não pode pintar
            // a tela do PORT2. É a distinção entre descartar o ERRADO e
            // descartar o VELHO.
            const t = T.criar();
            expect(t.aplicavel('PORT1', 'PORT2')).toBe(false);
        });

        it('sem chave, nunca aplica', () => {
            const t = T.criar();
            expect(t.aplicavel(null, null)).toBe(false);
            expect(t.aplicavel(undefined, undefined)).toBe(false);
            expect(t.aplicavel('PORT1', null)).toBe(false);
        });

        it('devolve BOOLEANO, nunca undefined', () => {
            const t = T.criar();
            expect(typeof t.aplicavel('A', 'A')).toBe('boolean');
            expect(typeof t.aplicavel('A', 'B')).toBe('boolean');
        });
    });

    // ─────────────────────────────────────────────────────────────
    describe('★★★ defeito 2 — empilhamento de requisições', () => {

        it('★★★ a segunda chamada NÃO entra enquanto a primeira está no ar', () => {
            // Ciclo do App.js: 3s. Endpoint do regime a 15s = cinco chamadas
            // simultâneas ao mesmo endpoint, e o navegador dá ~6 conexões por
            // host — o empilhamento faz o polling de logs passar fome.
            const t = T.criar();
            expect(t.entrar()).toBe(true);
            expect(t.entrar()).toBe(false);
            expect(t.entrar()).toBe(false);
            expect(t.ocupada()).toBe(true);
        });

        it('★★ depois de sair, a próxima entra', () => {
            const t = T.criar();
            t.entrar();
            t.sair();
            expect(t.ocupada()).toBe(false);
            expect(t.entrar()).toBe(true);
        });

        it('★★★ travas diferentes não se atrapalham', () => {
            // Duas telas de setor abertas não podem bloquear uma à outra.
            const a = T.criar();
            const b = T.criar();
            expect(a.entrar()).toBe(true);
            expect(b.entrar()).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────
    describe('★★★ o SectorView usa a trava como deve', () => {

        const src = fs.readFileSync(
            path.resolve(__dirname, '..', 'js/components/SectorView.js'), 'utf8');

        it('★★★ o sair() está num finally', () => {
            // Uma falha que deixasse a trava fechada congelaria a faixa PARA
            // SEMPRE — pior do que o defeito que a trava conserta. É o modo de
            // falha clássico de um lock, e o único jeito de não tê-lo é o
            // finally.
            const bloco = src.slice(src.indexOf('travaRegime.current.entrar()'));
            const trecho = bloco.slice(0, bloco.indexOf('}, [ehPortao'));
            expect(/finally\s*\{[^}]*travaRegime\.current\.sair\(\)/.test(trecho),
                'travaRegime.sair() precisa estar num finally: sem isso, uma '
                + 'requisição que falhe deixa a trava fechada e a faixa do '
                + 'portão nunca mais atualiza.')
                .toBe(true);
        });

        it('★★ a trava vive num ref, não numa variável do efeito', () => {
            // Numa variável local ela nasceria de novo a cada ciclo de 3s e não
            // travaria nada — e o descarte de resposta boa voltaria junto.
            expect(/travaRegime\s*=\s*React\.useRef/.test(src)).toBe(true);
            expect(/pontoAtualRef\s*=\s*React\.useRef/.test(src)).toBe(true);
        });

        it('★★ a decisão de aplicar compara o PONTO', () => {
            expect(/aplicavel\(pontoPedido,\s*pontoAtualRef\.current\)/.test(src)).toBe(true);
        });
    });
});
