import { describe, it, expect } from 'vitest';
import P from '../js/utils/importPlan.js';

/**
 * A ABA HIKCENTRAL É A TELA MAIS PERIGOSA DO SISTEMA.
 *
 * Ela transfere FACES entre pessoas. Um painel que mostre o botão de confirmar
 * na hora errada grava sem que o operador tenha visto os dois lados; um painel
 * que esconda a lista de conferência manual deixa 74 alunos com a face num
 * registro FUNC-### — que foi exatamente o que aconteceu, e a correção em
 * massa teve de ser feita por SQL.
 *
 * Nada disso dá erro. Aparece semanas depois, quando o aluno é negado no
 * terminal e ninguém sabe por quê.
 */
describe('importPlan — painel da simulação', () => {

    const plano = (over) => Object.assign({
        aplicado: false,
        totais: { TOTAL: 1197, CRIAR: 12, ATUALIZAR: 996, PULAR: 180, CONFLITO: 4, REVISAO_MANUAL: 5 },
        linhas: [],
        revisaoManual: []
    }, over);

    describe('★ os três estados', () => {
        it('sem arquivo: nada a mostrar, nada a confirmar', () => {
            const s = P.planState(null);
            expect(s.estado).toBe('sem-arquivo');
            expect(s.podeConfirmar).toBe(false);
            expect(s.titulo).toBeNull();
            expect(s.revisao).toEqual([]);
            expect(s.problemas).toEqual([]);
        });

        it('★ simulado: o título PROMETE que nada foi gravado', () => {
            const s = P.planState(plano());
            expect(s.estado).toBe('simulado');
            // O título agora é CHAVE i18n — quem traduz é a tela (mesma
            // decisão do importColumns: o util decide O QUE dizer, o
            // dicionário decide COMO).
            expect(s.titulo).toBe('plano.titulo.simulado');
            expect(s.podeConfirmar).toBe(true);
        });

        it('★ aplicado: não dá para confirmar de novo — seria gravar duas vezes', () => {
            const s = P.planState(plano({ aplicado: true }));
            expect(s.estado).toBe('aplicado');
            expect(s.titulo).toBe('plano.titulo.aplicado');
            expect(s.podeConfirmar).toBe(false);
            expect(s.rotuloConfirmar).toBeNull();
        });
    });

    describe('rótulo do botão', () => {
        it('★ diz quantos criar e quantos atualizar', () => {
            const s = P.planState(plano());
            expect(s.rotuloConfirmar).toBe('plano.confirmar');
            expect(s.confirmarParams).toEqual({ criar: 12, atualizar: 996 });
        });

        it('totais ausentes viram zero, não NaN nem undefined', () => {
            expect(P.planState({ totais: {} }).confirmarParams)
                .toEqual({ criar: 0, atualizar: 0 });
        });

        it('plano sem totais nenhum não estoura', () => {
            const s = P.planState({});
            expect(s.total).toBe(0);
            expect(s.rotuloConfirmar).toBe('plano.confirmar');
            expect(s.confirmarParams).toEqual({ criar: 0, atualizar: 0 });
        });
    });

    describe('★ listas que o operador PRECISA ver', () => {
        const linhas = [
            { linha: 10, acao: 'CRIAR', nome: 'A' },
            { linha: 11, acao: 'ATUALIZAR', nome: 'B' },
            { linha: 12, acao: 'PULAR', nome: 'C', detalhe: 'Linha sem ID' },
            { linha: 13, acao: 'CONFLITO', nome: 'D', detalhe: 'ID já usado' },
            { linha: 14, acao: 'REVISAO_MANUAL', nome: 'E' }
        ];

        it('★ problemas = CONFLITO e PULAR, nunca CRIAR/ATUALIZAR', () => {
            const s = P.planState(plano({ linhas }));
            expect(s.problemas.map(l => l.acao)).toEqual(['PULAR', 'CONFLITO']);
        });

        it('REVISAO_MANUAL não entra em "problemas" — tem lista e fluxo próprios', () => {
            const s = P.planState(plano({ linhas }));
            expect(s.problemas.map(l => l.acao)).not.toContain('REVISAO_MANUAL');
        });

        it('★ revisão manual pendente é sinalizada', () => {
            const s = P.planState(plano({ revisaoManual: [{ idHikvision: '123', nome: 'X', linha: 9 }] }));
            expect(s.precisaConferencia).toBe(true);
            expect(s.revisao).toHaveLength(1);
        });

        it('sem revisão manual, nada a conferir', () => {
            expect(P.planState(plano()).precisaConferencia).toBe(false);
        });

        it('linha nula no meio não derruba a filtragem', () => {
            const s = P.planState(plano({ linhas: [null, { acao: 'PULAR' }, undefined] }));
            expect(s.problemas).toHaveLength(1);
        });

        it('campos com forma errada degradam para lista vazia', () => {
            const s = P.planState({ linhas: 'nao e array', revisaoManual: 42 });
            expect(s.problemas).toEqual([]);
            expect(s.revisao).toEqual([]);
        });
    });
});

/**
 * PAINEL "É NA VERDADE UM ALUNO".
 *
 * O erro possível aqui é dar a face de um aluno a outro. Por isso o botão só
 * acende quando o operador tem TUDO na tela: aluno escolhido, prévia dos dois
 * lados carregada e — se o aluno já tinha outra face — a substituição
 * conscientemente marcada.
 */
describe('importPlan — máquina de estados da reclassificação', () => {

    const st = (o) => P.reclassState(o);
    const ALUNO = { id: '0001764', nome: 'Marie Dupont' };
    const PREVIA = { alunoId: '0001764', servidorId: 'FUNC-007', substituiIdentificadorDoAluno: false };
    const PREVIA_COM_FACE = Object.assign({}, PREVIA, { substituiIdentificadorDoAluno: true });

    describe('★ encontrado / ausente / conflito', () => {
        it('busca curta: não procura nem diz que não achou', () => {
            const s = st({ query: 'M', resultados: [] });
            expect(s.etapa).toBe('busca-curta');
            expect(s.mostrarLista).toBe(false);
            expect(s.mostrarAusente).toBe(false);
        });

        it('★ ENCONTRADO: lista aparece para escolher', () => {
            const s = st({ query: 'Marie', resultados: [ALUNO] });
            expect(s.etapa).toBe('encontrados');
            expect(s.mostrarLista).toBe(true);
            expect(s.mostrarAusente).toBe(false);
        });

        it('★ AUSENTE: só depois de procurar de verdade', () => {
            const s = st({ query: 'Marie', resultados: [] });
            expect(s.etapa).toBe('ausente');
            expect(s.mostrarAusente).toBe(true);
            expect(s.mostrarLista).toBe(false);
        });

        it('★ CONFLITO: aluno já tem outra face — exige confirmação explícita', () => {
            const s = st({ query: 'Marie', escolhido: ALUNO, previa: PREVIA_COM_FACE });
            expect(s.exigeSubstituicao).toBe(true);
            expect(s.podeConfirmar)
                .toBe(false);   // a caixa ainda não foi marcada
        });

        it('★ conflito aceito conscientemente -> pode confirmar', () => {
            const s = st({ query: 'Marie', escolhido: ALUNO, previa: PREVIA_COM_FACE, substituir: true });
            expect(s.podeConfirmar).toBe(true);
        });

        it('escolhido some com a lista, mesmo com resultados carregados', () => {
            const s = st({ query: 'Marie', resultados: [ALUNO], escolhido: ALUNO, previa: PREVIA });
            expect(s.etapa).toBe('escolhido');
            expect(s.mostrarLista).toBe(false);
        });
    });

    describe('★ quando o botão de confirmar acende', () => {
        it('★ sem aluno escolhido: nem botão existe', () => {
            const s = st({ query: 'Marie', resultados: [ALUNO] });
            expect(s.mostrarBotoes).toBe(false);
            expect(s.podeConfirmar).toBe(false);
        });

        it('★ escolhido mas SEM prévia: botão visível e travado', () => {
            // Confirmar sem ver os dois lados seria assinar em branco.
            const s = st({ query: 'Marie', escolhido: ALUNO, previa: null });
            expect(s.mostrarBotoes).toBe(true);
            expect(s.podeConfirmar).toBe(false);
        });

        it('escolhido + prévia sem conflito: acende', () => {
            expect(st({ query: 'Marie', escolhido: ALUNO, previa: PREVIA }).podeConfirmar).toBe(true);
        });

        it('★ gravando: trava para não gravar duas vezes', () => {
            const s = st({ query: 'Marie', escolhido: ALUNO, previa: PREVIA, salvando: true });
            expect(s.podeConfirmar).toBe(false);
            expect(s.rotuloConfirmar).toBe('comum.gravando');
        });

        it('parado: rótulo normal', () => {
            expect(st({ escolhido: ALUNO, previa: PREVIA }).rotuloConfirmar)
                .toBe('plano.confirmar.aluno');
        });
    });

    describe('erro e robustez', () => {
        it('erro aparece quando existe', () => {
            expect(st({ query: 'Marie', erro: 'Aluno não está no MAGBO' }).mostrarErro).toBe(true);
        });

        it('sem erro, não aparece', () => {
            expect(st({ query: 'Marie' }).mostrarErro).toBe(false);
        });

        it('estado vazio ou nulo não estoura', () => {
            expect(st({}).etapa).toBe('busca-curta');
            expect(st(null).podeConfirmar).toBe(false);
            expect(st(undefined).mostrarLista).toBe(false);
        });

        it('espaço em branco não conta como busca', () => {
            expect(st({ query: '   ', resultados: [] }).etapa).toBe('busca-curta');
        });

        it('resultados com forma errada degradam para lista vazia', () => {
            expect(st({ query: 'Marie', resultados: 'nao e array' }).etapa).toBe('ausente');
        });
    });
});
