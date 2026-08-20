import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * pointLabel — NOME do ponto, nunca o código sozinho.
 *
 * js/data/constants.js é um script CLÁSSICO (globais lexicais, sem UMD — é
 * assim que os componentes o consomem, por design). Para testá-lo, o arquivo
 * é avaliado numa Function com os seus próprios globais devolvidos no fim.
 * Se um dia alguém o transformar em módulo, este carregador quebra ANTES da
 * tela — o que é exatamente o aviso certo, porque os componentes quebrariam
 * do mesmo jeito.
 */
const REPO = path.resolve(__dirname, '..');
const fonte = fs.readFileSync(path.join(REPO, 'js', 'data', 'constants.js'), 'utf8');
const { ACCESS_POINTS, pointLabel } = new Function(
    fonte + '\n;return { ACCESS_POINTS, pointLabel };'
)();

describe('pointLabel', () => {

    it('★ ponto conhecido devolve o NOME, nunca o código', () => {
        expect(pointLabel('PORT1')).toBe('Portail Principal');
        expect(pointLabel('BIBLIO')).toBe('CDI');
        expect(pointLabel('REFEI1')).toBe('Cantine Principale');
    });

    it('★ todo ponto de ACCESS_POINTS resolve para o seu nome', () => {
        for (const p of ACCESS_POINTS) {
            expect(pointLabel(p.id), p.id).toBe(p.nome);
        }
    });

    it('★ ponto DESCONHECIDO vem rotulado, não como sigla seca', () => {
        // Um ponto fora de ACCESS_POINTS é um ponto físico novo ainda não
        // espelhado aqui — o código precisa aparecer (é o único identificador),
        // mas dito como ponto, não como sigla que o leitor deveria conhecer.
        expect(pointLabel('NOVO9')).toBe('Point NOVO9');
        expect(pointLabel('NOVO9', 'pt')).toBe('Ponto NOVO9');
        expect(pointLabel('NOVO9', 'fr')).toBe('Point NOVO9');
    });

    it('ausente ou vazio não estoura nem devolve vazio', () => {
        expect(pointLabel(null)).toBe('Point ?');
        expect(pointLabel(undefined, 'pt')).toBe('Ponto ?');
        expect(pointLabel('   ')).toBe('Point ?');
    });
});
