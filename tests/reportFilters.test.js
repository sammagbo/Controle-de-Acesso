import { describe, it, expect } from 'vitest';
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

    it('usa o piso padrão de 60s quando nenhum é informado', () => {
        expect(R.MIN_VISIT_SECONDS).toBe(60);
        const v = R.pairVisits([
            { studentId: 'a', action: 'IN', timestamp: BASE },
            { studentId: 'a', action: 'OUT', timestamp: BASE + 30000 },
        ]);
        expect(R.summariseVisits(v).visits).toBe(0);
    });

    it('período sem nada devolve zeros e média nula', () => {
        const s = R.summariseVisits([], 60);
        expect(s).toMatchObject({ visits: 0, uniquePeople: 0, avgDurationMin: null, shortVisitsIgnored: 0 });
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
