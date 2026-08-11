import { describe, it, expect } from 'vitest';
import B from '../js/utils/barChart.js';

/**
 * A GEOMETRIA DAS BARRAS.
 *
 * O defeito que originou este módulo, relatado do uso real em 11/08/2026: no
 * "Fréquentation par Jour" um valor 86 e um valor 2 desenhavam a MESMA barra, e
 * no "Affluence par Heure" todas as barras eram idênticas.
 *
 * A conta não estava errada — era `height: ${v / max * 80}%`, que é a fórmula
 * certa. Errado era o CSS: altura em PORCENTAGEM só resolve contra um pai de
 * altura DEFINIDA, e o `items-end` do contêiner não estica a coluna. Altura do
 * pai `auto` → porcentagem tratada como `auto` → barra vazia colapsa para zero
 * → o `min-height` assume, igual para todo mundo.
 *
 * Por isso este módulo devolve PIXEL: não depende de nenhum ancestral ter
 * altura resolvível, e o defeito não volta se alguém trocar um `items-end` por
 * outro alinhamento daqui a três meses.
 *
 * Uma barra que não codifica seu valor é pior que gráfico nenhum: quem passa o
 * olho sem ler o número é ativamente enganado.
 */
describe('barChart', () => {

    describe('★ proporcionalidade — o que estava quebrado', () => {

        it('★ o dobro do valor desenha o dobro da barra', () => {
            const [a, b] = B.alturas([50, 25], { alturaMaxima: 72 });
            expect(a).toBe(72);
            expect(b).toBe(36);
            expect(a).toBe(b * 2);
        });

        it('★ o caso relatado: 86 e 2 NÃO desenham igual', () => {
            const [grande, pequeno] = B.alturas([86, 2], { alturaMaxima: 72 });
            expect(grande).toBe(72);
            expect(grande).toBeGreaterThan(pequeno);
            // E o pequeno continua visível, em vez de sumir com 1,7px.
            expect(pequeno).toBe(B.MINIMO_VISIVEL_PADRAO);
        });

        it('★ o maior da série sempre ocupa a altura inteira', () => {
            expect(B.alturas([3, 9, 1], { alturaMaxima: 100 })[1]).toBe(100);
            expect(B.alturas([9, 3, 1], { alturaMaxima: 100 })[0]).toBe(100);
        });

        it('a escala é RELATIVA à série, não absoluta', () => {
            // 10 numa série cujo máximo é 10 é uma barra cheia; 10 numa série
            // cujo máximo é 100 é uma barra de 10%. É o que faz o gráfico ser
            // legível num dia fraco e num dia forte.
            expect(B.alturas([10], { alturaMaxima: 80 })[0]).toBe(80);
            expect(B.alturas([10, 100], { alturaMaxima: 80 })[0]).toBe(8);
        });

        it('a ordem e o comprimento da série são preservados', () => {
            const r = B.alturas([1, 4, 2, 8], { alturaMaxima: 80 });
            expect(r).toHaveLength(4);
            expect(r[3]).toBeGreaterThan(r[1]);
            expect(r[1]).toBeGreaterThan(r[2]);
        });

        it('meio da escala cai no meio da altura', () => {
            expect(B.alturas([100, 50], { alturaMaxima: 100 })).toEqual([100, 50]);
        });
    });

    describe('★ os três casos de borda', () => {

        it('★ série inteiramente ZERADA: nenhuma barra, e não estoura', () => {
            // Inventar uma barra mínima para todo mundo desenharia um gráfico
            // cheio num dia em que ninguém entrou. Vazio é a verdade.
            expect(B.alturas([0, 0, 0, 0, 0], { alturaMaxima: 72 })).toEqual([0, 0, 0, 0, 0]);
        });

        it('★ um ÚNICO valor não-zero: ele ocupa tudo, os outros ficam em zero', () => {
            expect(B.alturas([0, 7, 0], { alturaMaxima: 72 })).toEqual([0, 72, 0]);
        });

        it('★ máximo muito maior que o resto: o pequeno ganha um piso VISÍVEL', () => {
            // 1 contra 1000 daria 0,07px — na prática invisível, e invisível
            // já significa zero neste gráfico.
            const r = B.alturas([1000, 1], { alturaMaxima: 72, minimoVisivel: 6 });
            expect(r[0]).toBe(72);
            expect(r[1]).toBe(6);
        });

        it('★★ o piso NUNCA se aplica ao zero — barra ausente sempre quer dizer zero', () => {
            // A invariante que o piso existe para não estragar. Se o zero
            // também ganhasse altura mínima, "quase nada" e "nada" ficariam
            // indistinguíveis — que é o defeito original com outra roupa.
            const r = B.alturas([1000, 1, 0], { alturaMaxima: 72, minimoVisivel: 6 });
            expect(r[2]).toBe(0);
            expect(r[1]).toBeGreaterThan(0);
        });

        it('série vazia devolve lista vazia', () => {
            expect(B.alturas([], { alturaMaxima: 72 })).toEqual([]);
        });

        it('o piso nunca ultrapassa a altura máxima', () => {
            // Configuração absurda não pode produzir barra maior que o gráfico.
            const r = B.alturas([5, 1], { alturaMaxima: 4, minimoVisivel: 50 });
            expect(Math.max(...r)).toBeLessThanOrEqual(4);
        });
    });

    describe('robustez — dado sujo não vira barra', () => {

        it('valores inválidos contam como zero', () => {
            expect(B.alturas([10, null, undefined, NaN, 'abc', -5], { alturaMaxima: 50 }))
                .toEqual([50, 0, 0, 0, 0, 0]);
        });

        it('entrada que não é lista não estoura', () => {
            expect(B.alturas(null)).toEqual([]);
            expect(B.alturas(undefined)).toEqual([]);
        });

        it('sem opções, usa os padrões declarados', () => {
            expect(B.alturas([1])[0]).toBe(B.ALTURA_MAXIMA_PADRAO);
        });

        it('nenhuma altura é negativa ou fracionária', () => {
            for (const h of B.alturas([7, 3, 0, 91, 1], { alturaMaxima: 72 })) {
                expect(h).toBeGreaterThanOrEqual(0);
                expect(Number.isInteger(h)).toBe(true);
            }
        });
    });

    describe('series() — objeto de contagens + ordem explícita', () => {

        it('★ segue a ORDEM DAS CHAVES pedida, não a de Object.keys', () => {
            // Chave numérica em objeto JS não sai na ordem de inserção; os dois
            // gráficos do CDI guardam contagem em objeto ({1..5}, {8..17}).
            const r = B.series({ 10: 5, 8: 1, 9: 3 }, [8, 9, 10], { alturaMaxima: 100 });
            expect(r.map(x => x.chave)).toEqual([8, 9, 10]);
            expect(r.map(x => x.valor)).toEqual([1, 3, 5]);
            expect(r[2].altura).toBe(100);
        });

        it('chave sem contagem vale zero e fica sem barra', () => {
            const r = B.series({ 1: 4 }, ['1', '2'], { alturaMaxima: 60 });
            expect(r[1].valor).toBe(0);
            expect(r[1].altura).toBe(0);
            expect(r[1].vazio).toBe(true);
            expect(r[0].vazio).toBe(false);
        });

        it('contagens ausentes não estouram', () => {
            const r = B.series(null, ['1', '2'], { alturaMaxima: 60 });
            expect(r.map(x => x.altura)).toEqual([0, 0]);
        });

        it('a semana de exemplo do CDI: 86 na terça, 2 na sexta', () => {
            // O cenário exato do relato, com as cinco chaves reais da tela.
            const r = B.series({ 1: 40, 2: 86, 3: 30, 4: 12, 5: 2 },
                ['1', '2', '3', '4', '5'], { alturaMaxima: 72 });
            const porDia = Object.fromEntries(r.map(x => [x.chave, x.altura]));
            expect(porDia['2']).toBe(72);
            expect(porDia['1']).toBe(33);
            expect(porDia['5']).toBe(6);
            // O que a tela mostrava antes: todas iguais.
            expect(new Set(Object.values(porDia)).size).toBeGreaterThan(3);
        });
    });
});
