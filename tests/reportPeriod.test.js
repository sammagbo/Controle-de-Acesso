import { describe, it, expect } from 'vitest';
import R from '../js/utils/reportFilters.js';

/**
 * O SELETOR DE PERÍODO do Dashboard do CDI.
 *
 * A tela oferecia só "Cette Semaine" e "Ce Mois"; "Aujourd'hui" foi pedido do
 * uso real. O que se cobra aqui:
 *
 *  1. "Aujourd'hui" é DIA DE CALENDÁRIO — meia-noite a meia-noite. Se fosse
 *     "últimas 24 horas", às 9h da manhã a tela mostraria metade de ontem sob
 *     o rótulo "hoje", que é o tipo de número que alguém lê de relance e leva
 *     para uma reunião.
 *
 *  2. Semana e mês continuam EXATAMENTE como eram — janelas móveis de 7 e 30
 *     dias. Transformá-las em semana/mês de calendário mudaria em silêncio
 *     números que já são comparados de uma semana para a outra, e ninguém
 *     pediu isso.
 */
describe('período do relatório', () => {

    // Quarta-feira, 12 de agosto de 2026, 14:30 local.
    const AGORA = new Date(2026, 7, 12, 14, 30, 0).getTime();
    const MEIA_NOITE_HOJE = new Date(2026, 7, 12, 0, 0, 0).getTime();
    const MEIA_NOITE_AMANHA = new Date(2026, 7, 13, 0, 0, 0).getTime();

    const log = (t) => ({ studentId: 'A', action: 'IN', timestamp: t });

    describe("★ Aujourd'hui — só o dia corrente", () => {

        it('★ vai da meia-noite de hoje à meia-noite de amanhã', () => {
            const { desde, ate } = R.periodRange('today', AGORA);
            expect(desde).toBe(MEIA_NOITE_HOJE);
            expect(ate).toBe(MEIA_NOITE_AMANHA);
        });

        it('★ ontem às 23:59 fica FORA', () => {
            const ontemTarde = new Date(2026, 7, 11, 23, 59, 59).getTime();
            expect(R.filterLogsByPeriod([log(ontemTarde)], 'today', AGORA)).toEqual([]);
        });

        it('★ hoje às 00:00 e às 23:59 ficam DENTRO', () => {
            const inicio = MEIA_NOITE_HOJE;
            const fim = new Date(2026, 7, 12, 23, 59, 59).getTime();
            expect(R.filterLogsByPeriod([log(inicio), log(fim)], 'today', AGORA)).toHaveLength(2);
        });

        it('★ evento com data no FUTURO fica fora — o teto existe por isso', () => {
            // Relógio de terminal errado ou fila offline reentregue: sem teto,
            // um evento de amanhã apareceria dentro de "hoje".
            expect(R.filterLogsByPeriod([log(MEIA_NOITE_AMANHA)], 'today', AGORA)).toEqual([]);
        });

        it('★ NÃO são "as últimas 24 horas"', () => {
            // Às 14:30, "24h atrás" seria ontem 14:30 — que não é hoje.
            const ontemNaMesmaHora = AGORA - 24 * 60 * 60 * 1000;
            expect(R.filterLogsByPeriod([log(ontemNaMesmaHora)], 'today', AGORA)).toEqual([]);
        });

        it('vira o mês sozinho — 1º de setembro não puxa 31 de agosto', () => {
            const primeiroDeSetembro = new Date(2026, 8, 1, 9, 0, 0).getTime();
            const { desde } = R.periodRange('today', primeiroDeSetembro);
            expect(desde).toBe(new Date(2026, 8, 1, 0, 0, 0).getTime());
            expect(R.filterLogsByPeriod(
                [log(new Date(2026, 7, 31, 20, 0, 0).getTime())], 'today', primeiroDeSetembro
            )).toEqual([]);
        });

        it('vira o ano sozinho', () => {
            const primeiroDeJaneiro = new Date(2027, 0, 1, 8, 0, 0).getTime();
            expect(R.periodRange('today', primeiroDeJaneiro).desde)
                .toBe(new Date(2027, 0, 1, 0, 0, 0).getTime());
        });
    });

    describe('★ semana e mês NÃO mudaram', () => {

        it('★ semana continua sendo 7 dias móveis, sem teto', () => {
            const { desde, ate } = R.periodRange('week', AGORA);
            expect(desde).toBe(AGORA - 7 * 24 * 60 * 60 * 1000);
            expect(ate).toBeNull();
        });

        it('★ mês continua sendo 30 dias móveis, sem teto', () => {
            const { desde, ate } = R.periodRange('month', AGORA);
            expect(desde).toBe(AGORA - 30 * 24 * 60 * 60 * 1000);
            expect(ate).toBeNull();
        });

        it('★ o filtro devolve o mesmo que a conta antiga do StatsModal', () => {
            // A conta que estava no componente, congelada aqui: se o
            // comportamento de semana/mês mudar, este teste cai.
            const logs = Array.from({ length: 40 }, (_, i) =>
                log(AGORA - i * 24 * 60 * 60 * 1000));

            for (const [range, dias] of [['week', 7], ['month', 30]]) {
                const antigo = logs.filter(l => l.timestamp >= AGORA - dias * 24 * 60 * 60 * 1000);
                expect(R.filterLogsByPeriod(logs, range, AGORA)).toEqual(antigo);
            }
        });

        it('range desconhecido cai em semana — o padrão antigo da tela', () => {
            expect(R.periodRange('qualquer', AGORA)).toEqual(R.periodRange('week', AGORA));
        });
    });

    describe('★ hoje é subconjunto da semana, que é subconjunto do mês', () => {

        it('★ nenhuma passagem de hoje some ao apertar um botão mais largo', () => {
            const logs = [
                log(MEIA_NOITE_HOJE + 3600e3),
                log(AGORA - 3 * 24 * 3600e3),
                log(AGORA - 20 * 24 * 3600e3),
            ];
            const hoje = R.filterLogsByPeriod(logs, 'today', AGORA);
            const semana = R.filterLogsByPeriod(logs, 'week', AGORA);
            const mes = R.filterLogsByPeriod(logs, 'month', AGORA);

            expect(hoje).toHaveLength(1);
            expect(semana).toHaveLength(2);
            expect(mes).toHaveLength(3);
            for (const l of hoje) expect(semana).toContain(l);
            for (const l of semana) expect(mes).toContain(l);
        });
    });

    describe('robustez e rótulos', () => {

        it('aceita timestamp em ms e em texto ISO', () => {
            const iso = new Date(2026, 7, 12, 10, 0, 0).toISOString();
            expect(R.filterLogsByPeriod([{ timestamp: iso }], 'today', AGORA)).toHaveLength(1);
        });

        it('★ passagem sem hora legível fica FORA', () => {
            // Incluí-la inflaria justamente o número que se foi conferir.
            const sujos = [{ timestamp: null }, { timestamp: 'ontem' }, {}, null];
            expect(R.filterLogsByPeriod(sujos, 'today', AGORA)).toEqual([]);
        });

        it('entrada que não é lista não estoura', () => {
            expect(R.filterLogsByPeriod(null, 'today', AGORA)).toEqual([]);
        });

        it('os três períodos estão declarados, com hoje primeiro', () => {
            expect(R.PERIODOS).toEqual(['today', 'week', 'month']);
        });

        it('cada período tem o seu título de relatório', () => {
            expect(R.periodLabel('today')).toBe('Rapport du Jour');
            expect(R.periodLabel('week')).toBe('Rapport Hebdomadaire');
            expect(R.periodLabel('month')).toBe('Rapport Mensuel');
        });
    });
});
