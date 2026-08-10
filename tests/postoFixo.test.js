import { describe, it, expect } from 'vitest';
import P from '../js/utils/postoFixo.js';

/**
 * POSTO FIXO — quem TRABALHA no ponto.
 *
 * Contexto de produção (10/08/2026): o porteiro (Aldair TRINDADE) e as pessoas
 * da Vie Scolaire que ficam de pé no portão (Gustavo AMARAL, Clarice ALVES) são
 * reconhecidos pela câmera dezenas de vezes por dia. A tela do Portail e os
 * contadores enchiam de linhas iguais.
 *
 * A REGRA em si (primeira passagem do dia normal, as seguintes marcadas) vive
 * no backend e é coberta por PostoFixoIT. O que se cobra aqui é a parte de que
 * o front é dono: reconhecer a marca, contá-la, e — o ponto mais delicado do
 * desenho — SUGERIR sem nunca decidir.
 *
 * Por que "sugerir sem decidir" é o coração disto: o dado real mostra gente da
 * VIE SCOLAIRE postada no portão e gente da PORTARIA que precisa de rastreio
 * normal noutro ponto. Se o departamento decidisse, os dois casos ficariam
 * errados e corrigir um quebraria o outro.
 */

describe('postoFixo — reconhecer a marca', () => {

    it('ehPostoFixo só é verdade para a flag POSTO_FIXO', () => {
        expect(P.ehPostoFixo({ flag: 'POSTO_FIXO' })).toBe(true);
        expect(P.ehPostoFixo({ flag: 'FORA_HORARIO' })).toBe(false);
        expect(P.ehPostoFixo({ flag: 'FECHAMENTO_AUTO' })).toBe(false);
        expect(P.ehPostoFixo({ flag: null })).toBe(false);
        expect(P.ehPostoFixo({})).toBe(false);
    });

    it('log ausente ou nulo não quebra nem conta', () => {
        expect(P.ehPostoFixo(null)).toBe(false);
        expect(P.ehPostoFixo(undefined)).toBe(false);
    });

    it('a flag do front é a mesma string do backend', () => {
        // Espelho de PostoFixoService.FLAG_POSTO_FIXO. Divergir aqui faria a
        // tela nunca reconhecer uma linha marcada — e sem erro nenhum.
        expect(P.FLAG_POSTO_FIXO).toBe('POSTO_FIXO');
    });

    it('contarPostoFixo conta só as marcadas', () => {
        const logs = [
            { flag: null }, { flag: 'POSTO_FIXO' },
            { flag: 'POSTO_FIXO' }, { flag: 'EXCEDEU_TEMPO' },
        ];
        expect(P.contarPostoFixo(logs)).toBe(2);
    });

    it('contarPostoFixo aceita entrada inválida sem estourar', () => {
        expect(P.contarPostoFixo(null)).toBe(0);
        expect(P.contarPostoFixo(undefined)).toBe(0);
        expect(P.contarPostoFixo([])).toBe(0);
    });
});

describe('postoFixo — o departamento SUGERE, nunca decide', () => {

    it('PORTARIA sugere o portão principal', () => {
        expect(P.sugerir({ departamento: 'PORTARIA' })).toBe('PORT1');
    });

    it('a sugestão ignora caixa, acento e espaços do campo digitado à mão', () => {
        expect(P.sugerir({ departamento: '  portaria ' })).toBe('PORT1');
        expect(P.sugerir({ departamento: 'Portaría' })).toBe('PORT1');
    });

    it('★ VIE SCOLAIRE não sugere nada — parte dela fica no portão, parte não', () => {
        // O caso real que proíbe decidir por departamento: Gustavo AMARAL e
        // Clarice ALVES ficam no portão, e o resto da Vie Scolaire não. Uma
        // sugestão errada num campo que se salva com um clique é pior que
        // sugestão nenhuma.
        expect(P.sugerir({ departamento: 'VIE SCOLAIRE' })).toBe('');
    });

    it('departamento desconhecido, vazio ou ausente não sugere', () => {
        expect(P.sugerir({ departamento: 'SERVICOS GERAIS' })).toBe('');
        expect(P.sugerir({ departamento: '' })).toBe('');
        expect(P.sugerir({})).toBe('');
        expect(P.sugerir(null)).toBe('');
    });

    it('★ o valor JÁ GRAVADO vence a sugestão do departamento', () => {
        // Um porteiro postado no PORT2 abriria a edição mostrando PORT1, e um
        // clique em Salvar desfaria a decisão de outra pessoa em silêncio.
        expect(P.sugerir({ departamento: 'PORTARIA', postoFixoPointId: 'PORT2' })).toBe('PORT2');
    });

    it('o valor gravado vence mesmo com departamento sem sugestão', () => {
        expect(P.sugerir({ departamento: 'VIE SCOLAIRE', postoFixoPointId: 'PORT1' })).toBe('PORT1');
    });

    it('ehSugestao distingue "veio do cadastro" de "veio da sugestão"', () => {
        // É essa distinção que a tela usa para avisar o operador de que o
        // campo preenchido ainda não é um fato — ele precisa confirmar.
        expect(P.ehSugestao({ departamento: 'PORTARIA', postoFixoPointId: '' }, 'PORT1')).toBe(true);
        expect(P.ehSugestao({ departamento: 'PORTARIA', postoFixoPointId: 'PORT1' }, 'PORT1')).toBe(false);
        expect(P.ehSugestao({ departamento: 'PORTARIA', postoFixoPointId: '' }, 'BIBLIO')).toBe(false);
        expect(P.ehSugestao({ departamento: 'PORTARIA', postoFixoPointId: '' }, '')).toBe(false);
    });
});

describe('postoFixo — os pontos', () => {

    it('só pontos FÍSICOS entram na lista — ninguém fica postado num relatório', () => {
        const ids = P.PONTOS.map(p => p.id);
        expect(ids).toContain('PORT1');
        expect(ids).toContain('BIBLIO');
        expect(ids).toContain('ENFERM');
        expect(ids).not.toContain('CANTINA_MONITOR');
        expect(ids).not.toContain('GENERAL_REPORT');
    });

    it('★ a lista espelha os pontos de ACCESS_POINTS que não são telas', () => {
        // Mesma convenção do AreaMapping do backend: duas listas, mantidas
        // juntas. Sem este teste, uma porta nova da escola entraria em
        // constants.js e o menu de posto fixo continuaria sem ela.
        const constantes = require('fs')
            .readFileSync(require('path').resolve(__dirname, '../js/data/constants.js'), 'utf8');
        const fisicos = [...constantes.matchAll(/id:\s*'([A-Z0-9_]+)'[^}]*category:\s*'(\w+)'/g)]
            .filter(m => m[2] !== 'monitor')
            .map(m => m[1]);

        expect(fisicos.length).toBeGreaterThan(0);
        expect(P.PONTOS.map(p => p.id).sort()).toEqual(fisicos.sort());
    });

    it('pontoValido aceita os conhecidos e recusa o resto', () => {
        expect(P.pontoValido('PORT1')).toBe(true);
        expect(P.pontoValido(' port1 ')).toBe(true);
        expect(P.pontoValido('PORTARIA')).toBe(false);
        expect(P.pontoValido('')).toBe(false);
        expect(P.pontoValido(null)).toBe(false);
    });

    it('rotuloDoPonto devolve o nome legível, e o id cru quando não conhece', () => {
        expect(P.rotuloDoPonto('PORT1')).toBe('Portail Principal');
        expect(P.rotuloDoPonto('BIBLIO')).toBe('CDI - Biblioteca');
        expect(P.rotuloDoPonto('XPTO')).toBe('XPTO');
        expect(P.rotuloDoPonto(null)).toBe('');
    });
});
