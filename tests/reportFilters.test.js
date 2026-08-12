import { describe, it, expect, afterEach } from 'vitest';
import R from '../js/utils/reportFilters.js';

/**
 * FILTRO DE TIPO E REGRA DA PASSAGEM RÁPIDA.
 *
 * Contexto de produção: com 152 FUNCIONARIO + 49 PROFESSOR cadastrados, os
 * servidores poluem os números do CDI — entram por segundos, quase nunca passam
 * o rosto na saída, e o fechamento das 17:00 transforma isso em "permanência"
 * de um dia inteiro (ontem ~15 FUNC-### foram fechados assim).
 *
 * Estas funções decidem QUAIS passagens contam. Nenhuma delas apaga nada: o
 * Journal continua listando cada linha.
 */

const H = 3600 * 1000;
const BASE = new Date('2026-08-05T08:00:00').getTime();

const CADASTRO = {
    '0004048': { id: '0004048', nome: 'Aluna Um', tipo: 'ALUNO', turma: '3B' },
    '0001764': { id: '0001764', nome: 'Aluna Dois', tipo: 'ALUNO', turma: '4C' },
    'FUNC-001': { id: 'FUNC-001', nome: 'Servidor Um', tipo: 'FUNCIONARIO', departamento: 'VIE SCOLAIRE' },
    'FUNC-002': { id: 'FUNC-002', nome: 'Prof Silva', tipo: 'PROFESSOR', departamento: 'PROFESSORES' },
};
const byId = (id) => CADASTRO[id] || null;

/** Log no formato do CDI. `min` = minutos a partir da base. */
const ev = (studentId, action, min, flag) => ({
    studentId, action, timestamp: BASE + min * 60 * 1000, flag: flag || null,
});

describe('reportFilters — filtro de tipo', () => {

    it('ehAluno / ehServidor classificam PROFESSOR e FUNCIONARIO como servidor', () => {
        expect(R.ehAluno(CADASTRO['0004048'])).toBe(true);
        expect(R.ehServidor(CADASTRO['FUNC-001'])).toBe(true);
        expect(R.ehServidor(CADASTRO['FUNC-002'])).toBe(true);
        expect(R.ehServidor(CADASTRO['0004048'])).toBe(false);
    });

    it('pessoa desconhecida não é aluno nem servidor', () => {
        expect(R.ehAluno(null)).toBe(false);
        expect(R.ehServidor(undefined)).toBe(false);
    });

    it('por padrão a lista de pessoas fica só com ALUNO', () => {
        const todos = Object.values(CADASTRO);
        expect(R.filterPeopleByTipo(todos, false).map(u => u.id)).toEqual(['0004048', '0001764']);
    });

    it('incluirFuncionarios devolve todo mundo', () => {
        const todos = Object.values(CADASTRO);
        expect(R.filterPeopleByTipo(todos, true)).toHaveLength(4);
    });

    it('filtra passagens pelo tipo de quem passou', () => {
        const logs = [ev('0004048', 'IN', 0), ev('FUNC-001', 'IN', 5), ev('FUNC-002', 'IN', 10)];
        expect(R.filterLogsByTipo(logs, byId, false).map(l => l.studentId)).toEqual(['0004048']);
        expect(R.filterLogsByTipo(logs, byId, true)).toHaveLength(3);
    });

    it('★ id sem cadastro NÃO entra num número "de aluno"', () => {
        // Deixar passar contrabandearia servidor para dentro do número.
        const logs = [ev('0009999', 'IN', 0)];
        expect(R.filterLogsByTipo(logs, byId, false)).toHaveLength(0);
        expect(R.filterLogsByTipo(logs, byId, true)).toHaveLength(1);
    });

    it('aceita a forma crua do log (userId em vez de studentId)', () => {
        const logs = [{ userId: '0004048', action: 'ENTRADA', timestamp: BASE }];
        expect(R.filterLogsByTipo(logs, byId, false)).toHaveLength(1);
    });

    it('sem função de busca não inventa aluno', () => {
        expect(R.filterLogsByTipo([ev('0004048', 'IN', 0)], null, false)).toHaveLength(0);
    });
});

describe('reportFilters — emparelhamento de visitas', () => {

    /**
     * ★ Auditoria de 10/08/2026: as flags de repetição estavam nas consultas e
     * nas telas, mas o pareador consumia os logs crus. O incidente real do
     * aluno 0003053 (4 entradas em 5 min, sem saída entre elas) virava 3
     * visitas — 2 abertas fantasmas + 1 fechada medindo 16 min em vez de 21.
     */
    it('★ ENTRADA JA_PRESENTE não abre visita fantasma nem encurta a duração', () => {
        const v = R.pairVisits([
            ev('0003053', 'IN', 0),                    // 12:49 — a entrada real
            ev('0003053', 'IN', 2, 'JA_PRESENTE'),     // 12:51
            ev('0003053', 'IN', 5, 'JA_PRESENTE'),     // 12:54
            ev('0003053', 'OUT', 21),                  // 13:10
        ]);
        expect(v).toHaveLength(1);
        expect(v[0].seconds).toBe(21 * 60);
        expect(v[0].open).toBe(false);
    });

    it('★ ENTRADA POSTO_FIXO não abre visita; a SAÍDA marcada AINDA fecha (assimetria)', () => {
        const v = R.pairVisits([
            ev('FUNC-LIB', 'IN', 0),                   // 08:00 — chegada real
            ev('FUNC-LIB', 'IN', 60, 'POSTO_FIXO'),    // 09:00
            ev('FUNC-LIB', 'OUT', 540, 'POSTO_FIXO'),  // 17:00 — foi embora DE VERDADE
        ]);
        expect(v).toHaveLength(1);
        expect(v[0].seconds).toBe(540 * 60);
        expect(v[0].open)
            .toBe(false); // pular a saída marcada reabriria o defeito de ocupação de 10/08
    });

    it('as flags que CONTAM continuam abrindo visita normalmente', () => {
        // FORA_HORARIO marca um problema, não uma repetição — a visita existe.
        const v = R.pairVisits([
            ev('0004048', 'IN', 0, 'FORA_HORARIO'),
            ev('0004048', 'OUT', 30),
        ]);
        expect(v).toHaveLength(1);
        expect(v[0].seconds).toBe(1800);
    });

    it('emparelha ENTRADA→SAIDA e calcula a duração', () => {
        const v = R.pairVisits([ev('0004048', 'IN', 0), ev('0004048', 'OUT', 30)]);
        expect(v).toHaveLength(1);
        expect(v[0]).toMatchObject({ personId: '0004048', seconds: 1800, open: false, autoClosed: false });
    });

    it('★ ordena antes de emparelhar — o backend devolve do mais novo para o mais antigo', () => {
        // Sem ordenar, a saída viria primeiro e a duração sairia NEGATIVA.
        const v = R.pairVisits([ev('0004048', 'OUT', 30), ev('0004048', 'IN', 0)]);
        expect(v[0].seconds).toBe(1800);
        expect(v[0].seconds).toBeGreaterThan(0);
    });

    it('★ ENTRADA sem saída no meio não desalinha as visitas seguintes', () => {
        // Emparelhar de dois em dois casaria a entrada de uma visita com a
        // saída de outra — origem das durações absurdas no relatório.
        const v = R.pairVisits([
            ev('0004048', 'IN', 0),      // fica aberta
            ev('0004048', 'IN', 120),
            ev('0004048', 'OUT', 150),   // fecha a segunda: 30 min
        ]);
        expect(v).toHaveLength(2);
        expect(v.filter(x => x.open)).toHaveLength(1);
        expect(v.find(x => !x.open).seconds).toBe(1800);
    });

    it('SAIDA sem entrada aberta é ignorada', () => {
        const v = R.pairVisits([ev('0004048', 'OUT', 0), ev('0004048', 'IN', 60), ev('0004048', 'OUT', 90)]);
        expect(v).toHaveLength(1);
        expect(v[0].seconds).toBe(1800);
    });

    it('não mistura pessoas diferentes', () => {
        const v = R.pairVisits([
            ev('0004048', 'IN', 0), ev('0001764', 'IN', 5),
            ev('0004048', 'OUT', 30), ev('0001764', 'OUT', 45),
        ]);
        expect(v).toHaveLength(2);
        expect(v.find(x => x.personId === '0004048').seconds).toBe(1800);
        expect(v.find(x => x.personId === '0001764').seconds).toBe(2400);
    });

    it('★ não emparelha através da virada do dia — nada de visita de 24h', () => {
        // A entrada de ontem fica ABERTA (é o fechamento automático das 17:00
        // que a encerra, no servidor); a saída de hoje não tem entrada para
        // fechar e é ignorada. O que não pode acontecer, em hipótese nenhuma,
        // é as duas virarem uma permanência de um dia inteiro.
        const v = R.pairVisits([
            { studentId: '0004048', action: 'IN', timestamp: BASE },
            { studentId: '0004048', action: 'OUT', timestamp: BASE + 24 * H },
        ]);
        expect(v).toHaveLength(1);
        expect(v[0].open).toBe(true);
        expect(v[0].seconds).toBeNull();
    });

    it('marca a saída de FECHAMENTO_AUTO', () => {
        const v = R.pairVisits([ev('0004048', 'IN', 0), ev('0004048', 'OUT', 540, 'FECHAMENTO_AUTO')]);
        expect(v[0].autoClosed).toBe(true);
    });

    it('lista vazia ou lixo não estoura', () => {
        expect(R.pairVisits([])).toEqual([]);
        expect(R.pairVisits(null)).toEqual([]);
        expect(R.pairVisits([{ studentId: 'x', action: 'HEARTBEAT', timestamp: BASE }])).toEqual([]);
    });
});

describe('reportFilters — passagem rápida', () => {

    it('★ visita de 20s não conta como visita', () => {
        const v = R.pairVisits([ev('0004048', 'IN', 0), { ...ev('0004048', 'OUT', 0), timestamp: BASE + 20000 }]);
        const s = R.summariseVisits(v, 60);
        expect(s.visits).toBe(0);
        expect(s.shortVisitsIgnored).toBe(1);
        expect(s.avgDurationMin).toBeNull();
    });

    it('BORDA: 59s não conta, 60s conta', () => {
        const curta = R.pairVisits([
            { studentId: 'a', action: 'IN', timestamp: BASE },
            { studentId: 'a', action: 'OUT', timestamp: BASE + 59000 },
        ]);
        expect(R.summariseVisits(curta, 60).visits).toBe(0);

        const exata = R.pairVisits([
            { studentId: 'a', action: 'IN', timestamp: BASE },
            { studentId: 'a', action: 'OUT', timestamp: BASE + 60000 },
        ]);
        expect(R.summariseVisits(exata, 60).visits).toBe(1);
    });

    it('visita curta não entra na média', () => {
        const v = R.pairVisits([
            { studentId: 'a', action: 'IN', timestamp: BASE },
            { studentId: 'a', action: 'OUT', timestamp: BASE + 10000 },   // 10s, ignorada
            ev('a', 'IN', 60), ev('a', 'OUT', 90),                        // 30 min
        ]);
        const s = R.summariseVisits(v, 60);
        expect(s.visits).toBe(1);
        expect(s.avgDurationMin).toBe(30);
    });

    it('★ FECHAMENTO_AUTO conta como visita mas fica fora da média', () => {
        // 17:00 não é hora de saída de ninguém — somá-la inventaria permanência.
        const v = R.pairVisits([
            ev('a', 'IN', 0), ev('a', 'OUT', 30),                          // 30 min reais
            ev('b', 'IN', 0), ev('b', 'OUT', 540, 'FECHAMENTO_AUTO'),      // 9h sintéticas
        ]);
        const s = R.summariseVisits(v, 60);
        expect(s.visits).toBe(2);
        expect(s.avgDurationMin).toBe(30);
    });

    it('visita aberta conta como visita, sem duração', () => {
        const v = R.pairVisits([ev('a', 'IN', 0)]);
        const s = R.summariseVisits(v, 60);
        expect(s.visits).toBe(1);
        expect(s.openVisits).toBe(1);
        expect(s.avgDurationMin).toBeNull();
    });

    it('conta pessoas únicas sobre as visitas que valem', () => {
        const v = R.pairVisits([
            ev('a', 'IN', 0), ev('a', 'OUT', 30),
            ev('a', 'IN', 60), ev('a', 'OUT', 90),
            ev('b', 'IN', 0), ev('b', 'OUT', 20),
        ]);
        const s = R.summariseVisits(v, 60);
        expect(s.visits).toBe(3);
        expect(s.uniquePeople).toBe(2);
    });

    it('sem piso informado usa o valor em vigor (fallback enquanto o backend não respondeu)', () => {
        R.configure(null);   // simula "ainda não chegou"
        expect(R.isConfigured()).toBe(false);
        expect(R.effectiveMinVisitSeconds()).toBe(R.FALLBACK_MIN_VISIT_SECONDS);

        const v = R.pairVisits([
            { studentId: 'a', action: 'IN', timestamp: BASE },
            { studentId: 'a', action: 'OUT', timestamp: BASE + 30000 },   // 30s
        ]);
        expect(R.summariseVisits(v).visits).toBe(0);
    });

    it('período sem nada devolve zeros e média nula', () => {
        const s = R.summariseVisits([], 60);
        expect(s).toMatchObject({ visits: 0, uniquePeople: 0, avgDurationMin: null, shortVisitsIgnored: 0 });
    });
});

/**
 * FONTE ÚNICA DO PISO.
 *
 * O número vive em magbo.report.min-visit-seconds e chega por
 * GET /api/access/report-config. Não há mais constante espelhando o valor:
 * enquanto havia, mudar a property sem mudar o JS fazia a MESMA tela mostrar
 * dois números para o mesmo dia, e nada acusava a divergência.
 */
describe('reportFilters — piso vindo do backend', () => {

    afterEach(() => { R.configure(null); });   // não vaza entre testes

    it('★ não existe mais constante exportada com o piso', () => {
        expect(R.MIN_VISIT_SECONDS).toBeUndefined();
    });

    it('configure() adota o valor do servidor', () => {
        expect(R.configure({ minVisitSeconds: 120 })).toBe(120);
        expect(R.isConfigured()).toBe(true);
        expect(R.effectiveMinVisitSeconds()).toBe(120);
    });

    it('★ o piso do servidor manda no resumo — uma visita de 90s deixa de contar a 120s', () => {
        const v = R.pairVisits([
            { studentId: 'a', action: 'IN', timestamp: BASE },
            { studentId: 'a', action: 'OUT', timestamp: BASE + 90000 },
        ]);
        R.configure({ minVisitSeconds: 60 });
        expect(R.summariseVisits(v).visits).toBe(1);

        R.configure({ minVisitSeconds: 120 });
        expect(R.summariseVisits(v).visits).toBe(0);
    });

    it('piso 0 desliga a regra sem virar fallback', () => {
        expect(R.configure({ minVisitSeconds: 0 })).toBe(0);
        expect(R.isConfigured()).toBe(true);
        const v = R.pairVisits([
            { studentId: 'a', action: 'IN', timestamp: BASE },
            { studentId: 'a', action: 'OUT', timestamp: BASE + 5000 },
        ]);
        expect(R.summariseVisits(v).visits).toBe(1);
    });

    it('resposta inválida cai no fallback em vez de aceitar lixo', () => {
        R.configure({ minVisitSeconds: 'abc' });
        expect(R.isConfigured()).toBe(false);
        expect(R.effectiveMinVisitSeconds()).toBe(R.FALLBACK_MIN_VISIT_SECONDS);

        R.configure({ minVisitSeconds: -10 });
        expect(R.isConfigured()).toBe(false);
    });

    it('o argumento explícito continua vencendo o valor configurado', () => {
        R.configure({ minVisitSeconds: 600 });
        const v = R.pairVisits([
            { studentId: 'a', action: 'IN', timestamp: BASE },
            { studentId: 'a', action: 'OUT', timestamp: BASE + 90000 },
        ]);
        expect(R.summariseVisits(v, 60).visits).toBe(1);
    });
});

describe('reportFilters — o caminho completo do CDI', () => {

    it('★ tipo + passagem rápida + fechamento automático, juntos', () => {
        const logs = [
            ev('0004048', 'IN', 0), ev('0004048', 'OUT', 45),                     // aluna, 45 min  ✔
            ev('0001764', 'IN', 10), { ...ev('0001764', 'OUT', 10), timestamp: BASE + 10 * 60000 + 15000 }, // 15s ✘
            ev('FUNC-001', 'IN', 20), ev('FUNC-001', 'OUT', 540, 'FECHAMENTO_AUTO'), // servidor    ✘
        ];
        const soAlunos = R.filterLogsByTipo(logs, byId, false);
        const s = R.summariseVisits(R.pairVisits(soAlunos), 60);

        expect(s.visits).toBe(1);
        expect(s.uniquePeople).toBe(1);
        expect(s.avgDurationMin).toBe(45);
        expect(s.shortVisitsIgnored).toBe(1);
    });

    it('com servidores incluídos, o fechamento automático aparece como visita mas não na média', () => {
        const logs = [
            ev('0004048', 'IN', 0), ev('0004048', 'OUT', 45),
            ev('FUNC-001', 'IN', 20), ev('FUNC-001', 'OUT', 540, 'FECHAMENTO_AUTO'),
        ];
        const s = R.summariseVisits(R.pairVisits(R.filterLogsByTipo(logs, byId, true)), 60);
        expect(s.visits).toBe(2);
        expect(s.avgDurationMin).toBe(45);
    });
});

/**
 * O TETO DE DURAÇÃO — par longo demais é SAÍDA PERDIDA, não visita longa.
 *
 * Medido em produção em 12/08/2026 no CDI: 121 ENTRADA contra 70 SAIDA. Quando
 * a saída se perde e a pessoa REENTRA, a regra JA_PRESENTE tira a reentrada do
 * emparelhamento — e o par vai da entrada ORIGINAL até a saída de horas depois.
 *
 * ⚠️ Os números (2h / 1h) são uma AFIRMAÇÃO SOBRE ESTA ESCOLA, dita por quem
 * dirige o CDI — não uma lei. Vivem em properties do backend e chegam aqui por
 * /api/access/report-config.
 */
describe('teto de duração de visita', () => {
    const R = require('../js/utils/reportFilters.js');
    const v = (seconds, extra) => Object.assign({ personId: 'A', seconds: seconds, open: false, autoClosed: false }, extra || {});

    it('★ o par de 6h fica FORA da média, e a visita continua CONTADA', () => {
        // 8:00 entra · saída perdida · 10:00 reentra (JA_PRESENTE, fora do
        // pareamento) · 14:00 sai → par de 6h que ninguém passou no CDI.
        const r = R.summariseVisits([v(6 * 3600), v(40 * 60)], 60, 7200);
        expect(r.avgDurationMin).toBe(40);          // sem o teto seria 200
        expect(r.implausibleIgnored).toBe(1);
        expect(r.visits).toBe(2);                   // aconteceu; só a duração não é evidência
    });

    it('★ o número de excluídos é DITO, nunca silencioso', () => {
        const r = R.summariseVisits([v(9 * 3600), v(8 * 3600)], 60, 7200);
        expect(r.implausibleIgnored).toBe(2);
        expect(r.avgDurationMin).toBeNull();        // "não sei", não zero
    });

    it('★ exatamente no teto ENTRA; um segundo acima SAI', () => {
        expect(R.summariseVisits([v(7200)], 60, 7200).avgDurationMin).toBe(120);
        expect(R.summariseVisits([v(7201)], 60, 7200).avgDurationMin).toBeNull();
    });

    it('★ o teto NÃO altera nem apaga a visita — só a média', () => {
        const r = R.summariseVisits([v(9 * 3600)], 60, 7200);
        expect(r.visits).toBe(1);
        expect(r.uniquePeople).toBe(1);
    });

    it('as regras antigas seguem, e são exclusões de naturezas diferentes', () => {
        // Fechamento automático já sai antes do teto; visita curta idem.
        const auto = R.summariseVisits([v(9 * 3600, { autoClosed: true })], 60, 7200);
        expect(auto.avgDurationMin).toBeNull();
        expect(auto.implausibleIgnored).toBe(0);

        const curta = R.summariseVisits([v(20)], 60, 7200);
        expect(curta.shortVisitsIgnored).toBe(1);
        expect(curta.implausibleIgnored).toBe(0);
    });

    it('o teto do BACKEND vence o fallback local', () => {
        R.configure({ minVisitSeconds: 60, maxVisitSeconds: 1800 });   // 30 min
        expect(R.effectiveMaxVisitSeconds()).toBe(1800);
        expect(R.summariseVisits([v(40 * 60)]).avgDurationMin).toBeNull();
        R.configure({ minVisitSeconds: 60 });                          // sem teto na resposta
        expect(R.effectiveMaxVisitSeconds()).toBe(R.FALLBACK_MAX_VISIT_SECONDS);
    });

    it('visita aberta continua sem duração e não vira implausível', () => {
        const r = R.summariseVisits([v(null, { open: true })], 60, 7200);
        expect(r.openVisits).toBe(1);
        expect(r.implausibleIgnored).toBe(0);
    });
});
