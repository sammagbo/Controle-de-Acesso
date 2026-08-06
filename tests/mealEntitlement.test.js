import { describe, it, expect } from 'vitest';
import M from '../js/utils/mealEntitlement.js';

/**
 * O CLIQUE NO BADGE NÃO PODE APAGAR A VIGÊNCIA.
 *
 * `PUT /api/admin/meal-entitlements/{userId}` grava status, validFrom,
 * validUntil e note SEM CONDIÇÃO — campo ausente do corpo chega null e apaga
 * o que estava no banco. A tela mandava só o status, com `validUntil: null`
 * fixo e nenhum validFrom, então cada clique zerava a vigência.
 *
 * O defeito era invisível: a lista recarrega do servidor logo depois e mostra
 * o novo estado, já sem as datas. Um aluno autorizado só até o fim do
 * semestre virava autorizado para sempre, e nada na tela dizia isso.
 */
describe('mealEntitlement — corpo do PUT do toggle', () => {

    const NOTA = 'Modifié via interface cantine';

    describe('★ a vigência sobrevive ao toggle', () => {
        const comVigencia = {
            userId: '0004486',
            status: 'AUTHORIZED',
            validFrom: '2026-02-01',
            validUntil: '2026-06-30',
            note: 'autorisé jusqu\'à la fin du semestre'
        };

        it('★ um toggle preserva validFrom e validUntil', () => {
            const p = M.buildTogglePayload(comVigencia, NOTA);
            expect(p.validFrom).toBe('2026-02-01');
            expect(p.validUntil).toBe('2026-06-30');
            expect(p.status).toBe('NOT_AUTHORIZED');
        });

        it('★ DOIS toggles voltam ao estado inicial, com as datas intactas', () => {
            // É o teste que o item pede: alternar duas vezes não pode mexer na
            // validade. Simula o ciclo real — a tela recarrega do servidor
            // entre os cliques, então o 2º clique parte do que foi gravado.
            const primeiro = M.buildTogglePayload(comVigencia, NOTA);

            const depoisDoServidor = {
                ...comVigencia,
                status: primeiro.status,
                validFrom: primeiro.validFrom,
                validUntil: primeiro.validUntil
            };

            const segundo = M.buildTogglePayload(depoisDoServidor, NOTA);

            expect(segundo.status).toBe('AUTHORIZED');          // voltou ao inicial
            expect(segundo.validFrom).toBe(comVigencia.validFrom);
            expect(segundo.validUntil).toBe(comVigencia.validUntil);
        });

        it('★ dez toggles seguidos não erodem a vigência', () => {
            let estado = { ...comVigencia };
            for (let i = 0; i < 10; i++) {
                const p = M.buildTogglePayload(estado, NOTA);
                estado = { ...estado, status: p.status, validFrom: p.validFrom, validUntil: p.validUntil };
            }
            expect(estado.validFrom).toBe('2026-02-01');
            expect(estado.validUntil).toBe('2026-06-30');
            expect(estado.status).toBe('AUTHORIZED');           // 10 = par
        });

        it('só validUntil preenchido', () => {
            const p = M.buildTogglePayload({ status: 'AUTHORIZED', validUntil: '2026-12-31' }, NOTA);
            expect(p.validUntil).toBe('2026-12-31');
            expect(p.validFrom).toBeNull();
        });

        it('só validFrom preenchido', () => {
            const p = M.buildTogglePayload({ status: 'NOT_AUTHORIZED', validFrom: '2026-03-01' }, NOTA);
            expect(p.validFrom).toBe('2026-03-01');
            expect(p.validUntil).toBeNull();
        });
    });

    describe('o campo tem de EXISTIR no corpo', () => {
        it('★ nunca undefined — JSON.stringify apagaria o campo do corpo', () => {
            const p = M.buildTogglePayload({ status: 'AUTHORIZED' }, NOTA);
            expect(p.validFrom).toBeNull();
            expect(p.validUntil).toBeNull();
            expect(p).toHaveProperty('validFrom');
            expect(p).toHaveProperty('validUntil');
        });

        it('★ sobrevive ao JSON.stringify com as duas chaves', () => {
            const cru = JSON.parse(JSON.stringify(
                M.buildTogglePayload({ status: 'AUTHORIZED', validUntil: '2026-06-30' }, NOTA)));
            expect(Object.keys(cru).sort()).toEqual(['note', 'status', 'validFrom', 'validUntil']);
            expect(cru.validUntil).toBe('2026-06-30');
        });
    });

    describe('aluno sem linha de entitlement (PENDING)', () => {
        it('null não estoura e vira AUTHORIZED sem datas', () => {
            const p = M.buildTogglePayload(null, NOTA);
            expect(p).toEqual({ status: 'AUTHORIZED', validFrom: null, validUntil: null, note: NOTA });
        });

        it('undefined idem', () => {
            expect(M.buildTogglePayload(undefined, NOTA).status).toBe('AUTHORIZED');
        });

        it('PENDING explícito vira AUTHORIZED', () => {
            expect(M.buildTogglePayload({ status: 'PENDING' }, NOTA).status).toBe('AUTHORIZED');
        });
    });

    describe('nextStatus — comportamento preservado da tela antiga', () => {
        it('AUTHORIZED -> NOT_AUTHORIZED', () => {
            expect(M.nextStatus('AUTHORIZED')).toBe('NOT_AUTHORIZED');
        });

        it('NOT_AUTHORIZED -> AUTHORIZED', () => {
            expect(M.nextStatus('NOT_AUTHORIZED')).toBe('AUTHORIZED');
        });

        it('PENDING -> AUTHORIZED', () => {
            expect(M.nextStatus('PENDING')).toBe('AUTHORIZED');
        });

        it('ausente -> AUTHORIZED', () => {
            expect(M.nextStatus(undefined)).toBe('AUTHORIZED');
            expect(M.nextStatus(null)).toBe('AUTHORIZED');
        });
    });

    describe('note', () => {
        it('viaja como recebida', () => {
            expect(M.buildTogglePayload({ status: 'AUTHORIZED' }, NOTA).note).toBe(NOTA);
        });

        it('a nota anterior NÃO é preservada — ela descreve a última alteração', () => {
            const p = M.buildTogglePayload({ status: 'AUTHORIZED', note: 'nota antiga' }, NOTA);
            expect(p.note).toBe(NOTA);
        });
    });
});
