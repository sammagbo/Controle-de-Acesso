import { describe, it, expect, beforeEach, vi } from 'vitest';
import RC from '../js/utils/reportConfig.js';
import Report from '../js/utils/reportFilters.js';

/**
 * O PISO DE VISITA VEM DO SERVIDOR — E O QUE IMPORTA É O QUE ACONTECE QUANDO
 * ELE NÃO VEM.
 *
 * O Rapport CDI é calculado no cliente, mas o piso vive em
 * magbo.report.min-visit-seconds. Enquanto o JS tinha a própria constante, a
 * MESMA tela mostrava dois números para o mesmo dia e nada acusava.
 *
 * Se a busca falhar, a tela não pode ficar SEM piso (passaria a contar visita
 * de 1 segundo como permanência) nem pode quebrar: quem chama é um efeito do
 * React logo depois do login, e uma exceção ali derruba a montagem da tela por
 * causa de um número de ajuste fino.
 */
describe('reportConfig — carga com fallback', () => {

    const semLog = { warn: vi.fn() };

    beforeEach(() => {
        // Cada teste parte do fallback, não do que o anterior configurou.
        Report.configure(null);
        semLog.warn = vi.fn();
    });

    describe('caminho feliz', () => {
        it('★ adota o valor do servidor', async () => {
            const api = { fetchReportConfig: vi.fn(async () => ({ minVisitSeconds: 120 })) };

            const r = await RC.carregar(api, Report, semLog);

            expect(api.fetchReportConfig).toHaveBeenCalledTimes(1);
            expect(r.ok).toBe(true);
            expect(r.minVisitSeconds).toBe(120);
            expect(Report.effectiveMinVisitSeconds()).toBe(120);
            expect(Report.isConfigured()).toBe(true);
        });

        it('piso 0 é valor legítimo, não ausência', async () => {
            const api = { fetchReportConfig: vi.fn(async () => ({ minVisitSeconds: 0 })) };

            const r = await RC.carregar(api, Report, semLog);

            expect(r.ok).toBe(true);
            expect(Report.effectiveMinVisitSeconds()).toBe(0);
        });

        it('★ o valor adotado governa mesmo a contagem: 90s deixa de contar a 120', async () => {
            const visitas = [{ personId: 'a', seconds: 90, open: false, autoClosed: false }];
            expect(Report.summariseVisits(visitas).visits)
                .toBe(1);   // com o fallback de 60s, 90s conta

            await RC.carregar({ fetchReportConfig: async () => ({ minVisitSeconds: 120 }) }, Report, semLog);

            expect(Report.summariseVisits(visitas).visits)
                .toBe(0);   // com o piso do servidor, deixa de contar
        });
    });

    describe('★ o servidor não responde', () => {
        it('★ rede caída: NÃO lança e mantém o fallback', async () => {
            const api = { fetchReportConfig: vi.fn(async () => { throw new Error('Failed to fetch'); }) };

            const r = await RC.carregar(api, Report, semLog);

            expect(r.ok).toBe(false);
            expect(r.minVisitSeconds).toBe(Report.FALLBACK_MIN_VISIT_SECONDS);
            expect(Report.isConfigured()).toBe(false);
        });

        it('★ a falha é AVISADA, não engolida', async () => {
            const api = { fetchReportConfig: async () => { throw new Error('Failed to fetch'); } };

            await RC.carregar(api, Report, semLog);

            expect(semLog.warn).toHaveBeenCalled();
            expect(String(semLog.warn.mock.calls[0][0])).toContain('report-config');
        });

        it('★ um piso que já valia NÃO é perdido numa falha posterior', async () => {
            await RC.carregar({ fetchReportConfig: async () => ({ minVisitSeconds: 120 }) }, Report, semLog);
            expect(Report.effectiveMinVisitSeconds()).toBe(120);

            // A rede pisca no ciclo seguinte.
            const r = await RC.carregar(
                { fetchReportConfig: async () => { throw new Error('offline'); } }, Report, semLog);

            expect(r.ok).toBe(false);
            expect(Report.effectiveMinVisitSeconds())
                .toBe(120);   // a tela continua com o piso que já valia
        });
    });

    describe('resposta inválida', () => {
        it('★ lixo no corpo cai no fallback em vez de virar piso', async () => {
            const r = await RC.carregar(
                { fetchReportConfig: async () => ({ minVisitSeconds: 'sessenta' }) }, Report, semLog);

            expect(r.ok).toBe(false);
            expect(r.minVisitSeconds).toBe(Report.FALLBACK_MIN_VISIT_SECONDS);
        });

        it('corpo vazio idem', async () => {
            const r = await RC.carregar({ fetchReportConfig: async () => ({}) }, Report, semLog);
            expect(r.ok).toBe(false);
        });

        it('null idem', async () => {
            const r = await RC.carregar({ fetchReportConfig: async () => null }, Report, semLog);
            expect(r.ok).toBe(false);
            expect(r.minVisitSeconds).toBe(Report.FALLBACK_MIN_VISIT_SECONDS);
        });

        it('número negativo não vira piso', async () => {
            const r = await RC.carregar(
                { fetchReportConfig: async () => ({ minVisitSeconds: -5 }) }, Report, semLog);
            expect(r.ok).toBe(false);
        });
    });

    describe('dependências ausentes (ordem de carga do index.html)', () => {
        it('sem window.api não estoura', async () => {
            const r = await RC.carregar(null, Report, semLog);
            expect(r.ok).toBe(false);
            expect(r.motivo).toContain('fetchReportConfig');
            expect(r.minVisitSeconds).toBe(Report.FALLBACK_MIN_VISIT_SECONDS);
        });

        it('api sem o método não estoura', async () => {
            const r = await RC.carregar({}, Report, semLog);
            expect(r.ok).toBe(false);
        });

        it('sem MagboReport não estoura', async () => {
            const r = await RC.carregar({ fetchReportConfig: async () => ({}) }, null, semLog);
            expect(r.ok).toBe(false);
            expect(r.motivo).toContain('MagboReport');
        });

        it('sem logger não estoura', async () => {
            const r = await RC.carregar(
                { fetchReportConfig: async () => { throw new Error('x'); } }, Report, null);
            expect(r.ok).toBe(false);
        });
    });
});

/**
 * A LINHA CINZA QUE DIZ O QUE ESTÁ SENDO CONTADO.
 *
 * Um número de "visitas" que exclui gente em silêncio é pior que um número
 * errado: o errado alguém contesta, o silencioso vira verdade. É a linha que
 * faz duas pessoas olhando o mesmo dia perceberem que estão vendo escopos
 * diferentes — a causa nº 1 de números que não batem.
 */
describe('reportFilters — describeScope', () => {

    it('★ padrão: só alunos', () => {
        expect(Report.describeScope(false, 0).escopo).toBe('Élèves seulement');
    });

    it('★ com pessoal incluído, o texto MUDA', () => {
        expect(Report.describeScope(true, 0).escopo).toBe('Élèves + personnel');
    });

    it('passagens rápidas ignoradas são declaradas', () => {
        expect(Report.describeScope(false, 3).curtas).toBe('3 passage(s) éclair ignoré(s)');
    });

    it('zero passagens rápidas não vira ruído na tela', () => {
        const d = Report.describeScope(false, 0);
        expect(d.curtas).toBeNull();
        expect(d.partes).toEqual(['Élèves seulement']);
    });

    it('as duas partes quando há o que dizer', () => {
        expect(Report.describeScope(true, 2).partes)
            .toEqual(['Élèves + personnel', '2 passage(s) éclair ignoré(s)']);
    });

    it('valores ausentes ou absurdos não estouram', () => {
        expect(Report.describeScope(undefined, undefined).partes).toHaveLength(1);
        expect(Report.describeScope(false, -1).curtas).toBeNull();
        expect(Report.describeScope(false, 'tres').curtas).toBeNull();
    });
});
