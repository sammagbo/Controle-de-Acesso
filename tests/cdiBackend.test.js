import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * UMA REQUISIÇÃO POR RECARGA, NÃO DUAS.
 *
 * getStudents() e getLogs() liam cada uma o mesmo /access/logs/BIBLIO. A tela
 * chamava as duas em sequência a cada recarga, e o polling de 3s multiplicava
 * isso: duas respostas idênticas de até 500 linhas por ciclo, uma delas
 * inteiramente jogada fora. getSnapshot() lê uma vez e deriva as duas visões.
 *
 * O teste conta CHAMADAS porque é exatamente essa a afirmação do commit — e é
 * o que uma refatoração futura pode desfazer sem que nada mais quebre.
 *
 * CdiBackend.js é script clássico (`const CdiBackend = {...}`, sem export),
 * como todo arquivo de js/ neste projeto sem bundler. Carregar por `new
 * Function` é o preço de testá-lo sem convertê-lo — converter mudaria a ordem
 * de carga do index.html, que é onde este projeto já se machucou antes.
 */
function carregarCdiBackend() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../js/cdi/CdiBackend.js'), 'utf8');
    return new Function(`${src}; return CdiBackend;`)();
}

describe('CdiBackend — leitura do ponto BIBLIO', () => {
    let CdiBackend;
    let fetchLogs;

    /** Dois alunos, um dentro e um fora, e um servidor que o filtro deve tirar. */
    const LOGS = [
        { userId: '0001111', action: 'ENTRADA', timestamp: '2026-08-05T09:00:00', flag: null },
        { userId: '0002222', action: 'ENTRADA', timestamp: '2026-08-05T09:05:00', flag: null },
        { userId: '0002222', action: 'SAIDA', timestamp: '2026-08-05T09:40:00', flag: null },
        { userId: 'FUNC-007', action: 'ENTRADA', timestamp: '2026-08-05T09:10:00', flag: null }
    ];

    const PESSOAS = [
        { id: '0001111', nome: 'Alice Dupont', turma: '2A', tipo: 'ALUNO' },
        { id: '0002222', nome: 'Bruno Silva', turma: '2B', tipo: 'ALUNO' },
        { id: 'FUNC-007', nome: 'Carla Souza', turma: null, tipo: 'FUNCIONARIO' }
    ];

    beforeEach(async () => {
        fetchLogs = vi.fn(async () => LOGS);
        window.api = { fetchLogs };
        window.userCache = {
            all: () => PESSOAS,
            byId: (id) => PESSOAS.find(p => p.id === id) || null
        };
        // O filtro por tipo é o de produção, não uma imitação.
        window.MagboReport = (await import('../js/utils/reportFilters.js')).default
            || (await import('../js/utils/reportFilters.js'));

        CdiBackend = carregarCdiBackend();
        CdiBackend.setIncluirFuncionarios(false);
    });

    describe('★ contagem de requisições', () => {
        it('★ getSnapshot faz UMA leitura e devolve as duas visões', async () => {
            const snap = await CdiBackend.getSnapshot();

            expect(fetchLogs).toHaveBeenCalledTimes(1);
            expect(fetchLogs).toHaveBeenCalledWith('BIBLIO');
            expect(snap).toHaveProperty('students');
            expect(snap).toHaveProperty('logs');
        });

        it('★ o par antigo getStudents+getLogs custava DUAS — a regressão a evitar', async () => {
            await CdiBackend.getStudents();
            await CdiBackend.getLogs();
            expect(fetchLogs).toHaveBeenCalledTimes(2);
        });

        it('dez ciclos de polling = dez leituras, não vinte', async () => {
            for (let i = 0; i < 10; i++) await CdiBackend.getSnapshot();
            expect(fetchLogs).toHaveBeenCalledTimes(10);
        });
    });

    describe('mesmo resultado de antes (só menos chamadas)', () => {
        it('students do snapshot == students de getStudents', async () => {
            const snap = await CdiBackend.getSnapshot();
            expect(snap.students).toEqual(await CdiBackend.getStudents());
        });

        it('logs do snapshot == logs de getLogs', async () => {
            const snap = await CdiBackend.getSnapshot();
            expect(snap.logs).toEqual(await CdiBackend.getLogs());
        });

        it('presença vem do ÚLTIMO evento de cada pessoa', async () => {
            const { students } = await CdiBackend.getSnapshot();
            const alice = students.find(s => s.id === '0001111');
            const bruno = students.find(s => s.id === '0002222');

            expect(alice.present).toBe(true);          // última = ENTRADA
            expect(alice.lastEntry).toBeTypeOf('number');
            expect(bruno.present).toBe(false);         // última = SAIDA
            expect(bruno.lastEntry).toBeNull();
        });

        it('nome é quebrado em primeiro/restante', async () => {
            const { students } = await CdiBackend.getSnapshot();
            const alice = students.find(s => s.id === '0001111');
            expect(alice.firstName).toBe('Alice');
            expect(alice.lastName).toBe('Dupont');
        });

        it('ENTRADA/SAIDA viram IN/OUT e a flag viaja', async () => {
            const { logs } = await CdiBackend.getSnapshot();
            expect(logs.map(l => l.action)).toContain('IN');
            expect(logs.map(l => l.action)).toContain('OUT');
            expect(logs.every(l => 'flag' in l)).toBe(true);
        });
    });

    describe('filtro de servidores (padrão: só alunos)', () => {
        it('servidor fica FORA das duas visões', async () => {
            const { students, logs } = await CdiBackend.getSnapshot();
            expect(students.map(s => s.id)).not.toContain('FUNC-007');
            expect(logs.map(l => l.studentId)).not.toContain('FUNC-007');
        });

        it('ligando o filtro, o servidor entra nas duas', async () => {
            CdiBackend.setIncluirFuncionarios(true);
            const { students, logs } = await CdiBackend.getSnapshot();
            expect(students.map(s => s.id)).toContain('FUNC-007');
            expect(logs.map(l => l.studentId)).toContain('FUNC-007');
        });
    });

    describe('a tela não quebra quando o servidor pisca', () => {
        it('fetch que rejeita → todos ausentes, sem lançar', async () => {
            window.api.fetchLogs = vi.fn(async () => { throw new Error('rede caiu'); });
            const { students, logs } = await CdiBackend.getSnapshot();
            expect(logs).toEqual([]);
            expect(students.every(s => s.present === false)).toBe(true);
        });

        it('sem window.api ainda devolve a lista de pessoas', async () => {
            delete window.api;
            const { students, logs } = await CdiBackend.getSnapshot();
            expect(logs).toEqual([]);
            expect(students.length).toBe(2);   // 2 alunos, servidor filtrado
        });
    });

    describe('clearLogs foi removido', () => {
        it('★ o stub morto não existe mais', () => {
            expect(CdiBackend.clearLogs).toBeUndefined();
        });

        it('os outros stubs de somente-leitura continuam de pé', () => {
            expect(CdiBackend.addStudent).toBeTypeOf('function');
            expect(CdiBackend.updateStudent).toBeTypeOf('function');
            expect(CdiBackend.deleteStudent).toBeTypeOf('function');
        });
    });
});
