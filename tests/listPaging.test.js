import { describe, it, expect } from 'vitest';
import P from '../js/utils/listPaging.js';

/**
 * ARITMÉTICA DO ListaLimitada.
 *
 * O relatório real do HikCentral tem 1197 linhas e renderizá-las de uma vez
 * congela a janela do Electron por segundos — daí o teto de 200 com "mostrar
 * mais". O que se testa aqui é o que erra em silêncio: um off-by-one mostra
 * "200 de 1197" quando são 199, ou esconde a última linha da lista.
 */
describe('listPaging', () => {

    it('o teto é 200', () => {
        expect(P.LINHAS_POR_PAGINA).toBe(200);
    });

    describe('lista que cabe inteira', () => {
        it('não trunca e o rótulo é só o total', () => {
            const s = P.pageState(9, 200);
            expect(s).toMatchObject({ total: 9, visiveis: 9, restantes: 0, truncada: false, rotulo: '9' });
        });

        it('lista vazia não estoura', () => {
            expect(P.pageState(0, 200)).toMatchObject({ total: 0, visiveis: 0, restantes: 0, truncada: false });
        });
    });

    describe('lista truncada', () => {
        it('★ mostra 200 de 1197 e informa quantas faltam', () => {
            const s = P.pageState(1197, 200);
            expect(s).toMatchObject({
                visiveis: 200, restantes: 997, truncada: true,
                rotulo: '200 de 1197', proximoLote: 200,
            });
        });

        it('o último lote é menor que a página', () => {
            const s = P.pageState(1197, 1000);
            expect(s.restantes).toBe(197);
            expect(s.proximoLote).toBe(197);
        });

        it('BORDA: exatamente 200 linhas não é truncada', () => {
            const s = P.pageState(200, 200);
            expect(s.truncada).toBe(false);
            expect(s.rotulo).toBe('200');
        });

        it('BORDA: 201 linhas é truncada por uma', () => {
            const s = P.pageState(201, 200);
            expect(s).toMatchObject({ truncada: true, restantes: 1, rotulo: '200 de 201', proximoLote: 1 });
        });
    });

    describe('mostrar mais', () => {
        it('cresce de 200 em 200 e para no total', () => {
            expect(P.nextChunk(200, 1197)).toBe(400);
            expect(P.nextChunk(1000, 1197)).toBe(1197);
        });

        it('★ nunca ultrapassa o total — senão o rótulo passaria a mentir', () => {
            expect(P.nextChunk(1197, 1197)).toBe(1197);
            expect(P.nextChunk(5000, 1197)).toBe(1197);
        });

        it('chega ao fim numa sequência de cliques', () => {
            let m = 200;
            const total = 1197;
            const cliques = [];
            while (P.pageState(total, m).truncada) {
                m = P.nextChunk(m, total);
                cliques.push(m);
            }
            expect(cliques).toEqual([400, 600, 800, 1000, 1197]);
            expect(P.pageState(total, m).rotulo).toBe('1197');
        });
    });

    describe('entrada inválida', () => {
        it('trata negativo e não-número como zero', () => {
            expect(P.pageState(-5, 200).total).toBe(0);
            expect(P.pageState('abc', 200).total).toBe(0);
            expect(P.pageState(100, -1).visiveis).toBe(0);
        });
    });
});
