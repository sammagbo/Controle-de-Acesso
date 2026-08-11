import { describe, it, expect } from 'vitest';
import E from '../js/utils/exitPermission.js';

/**
 * AUTORIZAÇÃO DE SAÍDA — a matrícula sai de uma ESCOLHA, não de digitação.
 *
 * O formulário começava com um campo "MATRÍCULA DO ALUNO" em branco. A Vie
 * Scolaire conhece os alunos pelo nome, e um dígito trocado criava em silêncio
 * uma autorização para a criança errada — ou para ninguém, o que só se descobre
 * quando o aluno é barrado no portão com o responsável esperando lá fora.
 *
 * A busca em si (fragmento de nome, matrícula, acento, caixa) é do servidor e
 * está coberta em StudentSearchServiceTest + ExitSearchAndMealImportIT — é lá
 * que a regra mora. O que se testa AQUI é o que a tela decide: que a matrícula
 * escolhida chega ao payload, e que não dá para salvar sem ter escolhido.
 */
describe('exitPermission — escolha do aluno', () => {

    const ALUNO = { id: '0001764', nome: 'Aurélie Gonçalves', turma: '2A', tipo: 'ALUNO' };

    describe('quando vale ir ao servidor', () => {
        it('a partir de 2 caracteres', () => {
            expect(E.buscaValida('au')).toBe(true);
            expect(E.buscaValida('Aurélie')).toBe(true);
        });

        it('★ 1 caractere não busca — casaria com meia escola', () => {
            expect(E.buscaValida('a')).toBe(false);
        });

        it('espaço em branco não conta como busca', () => {
            expect(E.buscaValida('   ')).toBe(false);
            expect(E.buscaValida('')).toBe(false);
            expect(E.buscaValida(null)).toBe(false);
            expect(E.buscaValida(undefined)).toBe(false);
        });
    });

    describe('★ só ALUNO é selecionável', () => {
        it('★ servidor é descartado mesmo se o servidor o devolvesse', () => {
            const mistura = [
                ALUNO,
                { id: 'FUNC-007', nome: 'Aurélie Martin', tipo: 'FUNCIONARIO' },
                { id: 'PROF-001', nome: 'Aurélie Blanc', tipo: 'PROFESSOR' }
            ];
            // Segunda tranca: o backend já filtra, mas se um dia a tela trocar
            // de fonte de busca, a lista continua não oferecendo funcionário.
            expect(E.apenasAlunos(mistura).map(u => u.id)).toEqual(['0001764']);
        });

        it('lista malformada não estoura', () => {
            expect(E.apenasAlunos(null)).toEqual([]);
            expect(E.apenasAlunos('não é array')).toEqual([]);
            expect(E.apenasAlunos([null, undefined, {}])).toEqual([]);
        });
    });

    describe('o aluno escolhido aparece por inteiro', () => {
        it('★ nome, turma e matrícula — os três, para conferir antes de salvar', () => {
            const d = E.descreverAluno(ALUNO);
            expect(d.nome).toBe('Aurélie Gonçalves');
            expect(d.turma).toBe('2A');
            expect(d.id).toBe('0001764');
            expect(d.resumo).toBe('Aurélie Gonçalves · 2A · 0001764');
        });

        it('aluno sem turma mostra travessão, não vazio', () => {
            expect(E.descreverAluno({ id: '0001111', nome: 'Ana' }).turma).toBe('—');
        });

        it('nulo devolve nulo', () => {
            expect(E.descreverAluno(null)).toBeNull();
        });
    });
});

describe('exitPermission — validação antes de salvar', () => {

    const ALUNO = { id: '0001764', nome: 'Aurélie Gonçalves', turma: '2A', tipo: 'ALUNO' };

    const formSingle = (over) => Object.assign({
        aluno: ALUNO,
        autorizadoFamilia: 'Mme Gonçalves',
        tipo: 'SINGLE',
        validFrom: '2026-08-10T12:00',
        validUntil: '2026-08-10T14:00',
        dias: {}
    }, over);

    const formRecurring = (over) => Object.assign({
        aluno: ALUNO,
        autorizadoFamilia: 'Mme Gonçalves',
        tipo: 'RECURRING',
        startTime: '12:00',
        endTime: '14:00',
        dias: { MONDAY: true, TUESDAY: false, WEDNESDAY: true, THURSDAY: false, FRIDAY: false }
    }, over);

    describe('★ sem aluno escolhido não salva', () => {
        it('★ recusa com motivo LEGÍVEL, não um booleano mudo', () => {
            const r = E.validar(formSingle({ aluno: null }));
            expect(r.ok).toBe(false);
            expect(r.motivo).toContain('Selecione o aluno');
        });

        it('★ aluno sem id também é recusado', () => {
            expect(E.validar(formSingle({ aluno: { nome: 'Fulano' } })).ok).toBe(false);
        });

        it('★ e o payload sai NULL — segunda tranca, caso a validação seja pulada', () => {
            expect(E.montarPayload(formSingle({ aluno: null }))).toBeNull();
            expect(E.montarPayload(null)).toBeNull();
        });

        it('formulário vazio não estoura', () => {
            expect(E.validar(null).ok).toBe(false);
            expect(E.validar({}).ok).toBe(false);
        });
    });

    describe('os outros campos continuam obrigatórios', () => {
        it('quem autorizou é obrigatório', () => {
            const r = E.validar(formSingle({ autorizadoFamilia: '   ' }));
            expect(r.ok).toBe(false);
            expect(r.motivo).toContain('autorizou');
        });

        it('saída única exige as duas datas', () => {
            expect(E.validar(formSingle({ validUntil: '' })).ok).toBe(false);
            expect(E.validar(formSingle({ validFrom: '' })).motivo).toContain('retorno');
        });

        it('recorrente exige ao menos um dia', () => {
            const r = E.validar(formRecurring({ dias: { MONDAY: false, TUESDAY: false } }));
            expect(r.ok).toBe(false);
            expect(r.motivo).toContain('dia');
        });

        it('formulário completo passa', () => {
            expect(E.validar(formSingle()).ok).toBe(true);
            expect(E.validar(formRecurring()).ok).toBe(true);
        });
    });
});

describe('exitPermission — payload (contrato do backend inalterado)', () => {

    const ALUNO = { id: '0001764', nome: 'Aurélie Gonçalves', turma: '2A', tipo: 'ALUNO' };

    describe('★ saída única', () => {
        const p = () => E.montarPayload({
            aluno: ALUNO, autorizadoFamilia: 'Mme Gonçalves', tipo: 'SINGLE',
            validFrom: '2026-08-10T12:30', validUntil: '2026-08-10T14:45',
            observacoes: 'RDV médical'
        });

        it('★ o userId é a MATRÍCULA do aluno escolhido', () => {
            expect(p().userId).toBe('0001764');
        });

        it('★ os zeros à esquerda sobrevivem', () => {
            expect(p().userId).toBe('0001764');
            expect(JSON.parse(JSON.stringify(p())).userId).toBe('0001764');
        });

        it('datetime-local vira LocalDate + LocalTime, como o backend espera', () => {
            expect(p()).toMatchObject({
                permissionType: 'SINGLE',
                authorizedByFamily: 'Mme Gonçalves',
                authorizedBySchool: null,
                note: 'RDV médical',
                validFrom: '2026-08-10',
                validUntil: '2026-08-10',
                startTime: '12:30',
                endTime: '14:45'
            });
        });

        it('observação vazia vira null, não string vazia', () => {
            const semNota = E.montarPayload({
                aluno: ALUNO, autorizadoFamilia: 'X', tipo: 'SINGLE',
                validFrom: '2026-08-10T12:00', validUntil: '2026-08-10T14:00'
            });
            expect(semNota.note).toBeNull();
        });
    });

    describe('★ recorrente', () => {
        const p = () => E.montarPayload({
            aluno: ALUNO, autorizadoFamilia: 'Mme Gonçalves', tipo: 'RECURRING',
            startTime: '12:00', endTime: '14:00',
            dias: { MONDAY: true, TUESDAY: false, WEDNESDAY: true, THURSDAY: false, FRIDAY: true }
        }, new Date(2026, 7, 6));   // 06/08/2026

        it('★ dias viram CSV de ISO 1-7 (provado por curl 17/07)', () => {
            expect(p().daysOfWeek).toBe('1,3,5');
        });

        it('vale do dia atual até 31/12', () => {
            expect(p().validFrom).toBe('2026-08-06');
            expect(p().validUntil).toBe('2026-12-31');
        });

        it('★ validFrom usa a data LOCAL — toISOString daria o dia anterior à noite no BRT', () => {
            // 06/08 às 22h no BRT é 07/08 em UTC. O dia da autorização é o da
            // escola, não o de Greenwich.
            const tarde = E.montarPayload({
                aluno: ALUNO, autorizadoFamilia: 'X', tipo: 'RECURRING',
                startTime: '12:00', endTime: '14:00', dias: { MONDAY: true }
            }, new Date(2026, 7, 6, 22, 30));
            expect(tarde.validFrom).toBe('2026-08-06');
        });

        it('nenhum dia marcado devolve CSV vazio (a validação já barrou antes)', () => {
            const vazio = E.montarPayload({
                aluno: ALUNO, autorizadoFamilia: 'X', tipo: 'RECURRING',
                startTime: '12:00', endTime: '14:00', dias: {}
            }, new Date(2026, 7, 6));
            expect(vazio.daysOfWeek).toBe('');
        });
    });

    describe('o contrato não mudou', () => {
        it('★ os campos são os mesmos do ExitPermissionRequest de sempre', () => {
            const p = E.montarPayload({
                aluno: ALUNO, autorizadoFamilia: 'X', tipo: 'SINGLE',
                validFrom: '2026-08-10T12:00', validUntil: '2026-08-10T14:00'
            });
            expect(Object.keys(p).sort()).toEqual(
                ['authorizedByFamily', 'authorizedBySchool', 'endTime', 'note', 'permissionType', 'startTime',
                 'userId', 'validFrom', 'validUntil'].sort());
        });

        it('nenhum campo novo escapou para o corpo (nada de nome/turma)', () => {
            const p = E.montarPayload({
                aluno: ALUNO, autorizadoFamilia: 'X', tipo: 'SINGLE',
                validFrom: '2026-08-10T12:00', validUntil: '2026-08-10T14:00'
            });
            expect(p).not.toHaveProperty('nome');
            expect(p).not.toHaveProperty('turma');
            expect(p).not.toHaveProperty('aluno');
        });
    });
});

/**
 * DUAS AUTORIDADES — família e escola.
 *
 * A realidade tem duas autoridades distintas e o registro precisa dizer QUAL
 * agiu: o responsável da família (pai, mãe, guardião) e o membro da Vie
 * Scolaire. Antes havia um campo de texto livre só, "Autorizado por
 * (Responsável)", que o front gravava na coluna `reason` — uma coluna cujo
 * nome nunca correspondeu ao que ela guardava.
 */
describe('duas autoridades de saída', () => {
    const E = window.MagboExitPermission || require('../js/utils/exitPermission.js');
    const ALUNO = { id: '0003535', nome: 'Marie DUPONT', turma: '2nde A' };
    const base = (extra) => Object.assign({
        aluno: ALUNO, tipo: 'SINGLE',
        validFrom: '2026-08-12T10:00', validUntil: '2026-08-12T12:00'
    }, extra || {});

    it('★ só a família basta', () => {
        expect(E.validar(base({ autorizadoFamilia: 'Mme Gonçalves' })).ok).toBe(true);
    });

    it('★ só a escola basta', () => {
        expect(E.validar(base({ autorizadoEscola: 'Sam MAGBO' })).ok).toBe(true);
    });

    it('★ as duas juntas', () => {
        const r = E.montarPayload(base({
            autorizadoFamilia: 'Mme Gonçalves', autorizadoEscola: 'Sam MAGBO'
        }));
        expect(r.authorizedByFamily).toBe('Mme Gonçalves');
        expect(r.authorizedBySchool).toBe('Sam MAGBO');
    });

    it('★★ NENHUMA das duas é recusado — e o motivo é dito', () => {
        // Seria uma criança autorizada a sair sem ninguém ter autorizado.
        const r = E.validar(base({}));
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/família/i);
    });

    it('★ campo só com espaços não conta como autoridade', () => {
        expect(E.validar(base({ autorizadoFamilia: '   ', autorizadoEscola: '' })).ok).toBe(false);
    });

    it('★ campo em branco vira NULL no payload, não ""', () => {
        // O banco guarda ausência como NULL; "" faria a coluna parecer
        // preenchida em toda consulta que testasse IS NOT NULL.
        const r = E.montarPayload(base({ autorizadoFamilia: 'Mme Gonçalves', autorizadoEscola: '  ' }));
        expect(r.authorizedBySchool).toBeNull();
        expect(r.authorizedByFamily).toBe('Mme Gonçalves');
    });

    it('★ o payload não fala mais em reason', () => {
        // A coluna foi removida na V012; um payload que ainda a mandasse
        // passaria despercebido no backend e sumiria em silêncio.
        const r = E.montarPayload(base({ autorizadoFamilia: 'X' }));
        expect(Object.keys(r)).not.toContain('reason');
    });

    it('espaços são aparados nos dois lados', () => {
        const r = E.montarPayload(base({ autorizadoFamilia: '  Mme Gonçalves  ' }));
        expect(r.authorizedByFamily).toBe('Mme Gonçalves');
    });
});
