// =====================================================================
// AS REGRAS DO MONITEUR CANTINE
// =====================================================================
// ⚠️ Este ficheiro existe porque nada neste projeto renderiza React numa
// suíte. Enquanto o cálculo das colunas vivia dentro do `useMemo` do
// CantineMonitor, as três afirmações que a tela faz sobre uma criança —
// «está dentro», «ficou tempo demais», «passou sem comer» — não eram
// verificáveis por nada a não ser abrir o ecrã e olhar.
//
// Cada teste aqui é uma forma de a tela mentir ao operador.

import { describe, it, expect, beforeEach } from 'vitest';
import cantine from '../js/utils/cantine.js';

const MIN = 60 * 1000;
// Meio-dia de uma terça-feira: dentro da janela do liceu, longe da meia-noite.
const MEIODIA = new Date(2026, 7, 25, 12, 0, 0).getTime();

const ev = (userId, action, quandoMs, extra) =>
    Object.assign({ userId, action, timestamp: quandoMs }, extra || {});

// O módulo recebe ms directamente nestes testes: sem Date parsing pelo meio,
// o que se prova é a REGRA e não o parser.
const opts = { parseMs: (x) => x };

beforeEach(() => cantine._reset());

describe('configuração — os números vêm do servidor, com fallback', () => {
    it('★★ arranca com os defaults do CantineProperties e diz que não veio do servidor', () => {
        expect(cantine.configurado()).toBe(false);
        expect(cantine.config()).toMatchObject({
            lyceeInicio: '11:00',
            duracaoCurtaMinutos: 15,
            duracaoMaximaMinutos: 30,
            decantacaoMinutos: 15
        });
    });

    it('★★★ aceita o bloco `cantine` de /api/access/report-config', () => {
        expect(cantine.configurar({
            minVisitSeconds: 60,
            cantine: {
                lyceeInicio: '10:30', lyceeFim: '14:30',
                duracaoCurtaMinutos: 10, duracaoMaximaMinutos: 45, decantacaoMinutos: 20
            }
        })).toBe(true);
        expect(cantine.configurado()).toBe(true);
        expect(cantine.config()).toMatchObject({
            lyceeInicio: '10:30', duracaoMaximaMinutos: 45, decantacaoMinutos: 20
        });
    });

    it('★★★ lixo NÃO derruba a regra — cada campo mau mantém o fallback', () => {
        // Uma tela sem teto de permanência põe toda a gente em DOIT SORTIR ou
        // ninguém. Meio bloco válido vale mais que nenhum.
        cantine.configurar({ cantine: {
            lyceeInicio: 'onze horas', duracaoMaximaMinutos: 'trinta',
            duracaoCurtaMinutos: -5, decantacaoMinutos: 20
        }});
        const c = cantine.config();
        expect(c.lyceeInicio).toBe('11:00');
        expect(c.duracaoMaximaMinutos).toBe(30);
        expect(c.duracaoCurtaMinutos).toBe(15);
        expect(c.decantacaoMinutos).toBe(20);   // o único bom foi aceite
    });

    it('★ resposta vazia ou ausente não muda nada', () => {
        expect(cantine.configurar(null)).toBe(false);
        expect(cantine.configurar({})).toBe(false);
        expect(cantine.configurado()).toBe(false);
    });
});

describe('colunas — onde cada pessoa cai', () => {
    it('★★★ entrou há 5 min: está DENTRO', () => {
        const r = cantine.classificar([ev('0001', 'ENTRADA', MEIODIA - 5 * MIN)], MEIODIA, opts);
        expect(r.dans.map(x => x.userId)).toEqual(['0001']);
        expect(r.doitSortir).toHaveLength(0);
    });

    it('★★★ o teto passou de 1h para 30 min: 40 min dentro é DOIT SORTIR', () => {
        // Este é o teste do número novo. Com o teto antigo (1h) esta pessoa
        // aparecia como se estivesse tranquilamente a almoçar.
        const r = cantine.classificar([ev('0001', 'ENTRADA', MEIODIA - 40 * MIN)], MEIODIA, opts);
        expect(r.doitSortir.map(x => x.userId)).toEqual(['0001']);
        expect(r.dans).toHaveLength(0);
    });

    it('★★ exatamente no teto ainda está dentro; um minuto depois não', () => {
        const noTeto = cantine.classificar([ev('0001', 'ENTRADA', MEIODIA - 30 * MIN)], MEIODIA, opts);
        expect(noTeto.dans).toHaveLength(1);
        const passou = cantine.classificar([ev('0001', 'ENTRADA', MEIODIA - 31 * MIN)], MEIODIA, opts);
        expect(passou.doitSortir).toHaveLength(1);
    });

    it('★★★ quem SAIU não fica preso em DOIT SORTIR pela entrada antiga', () => {
        // Entrou às 11h00, saiu às 11h20, agora é meio-dia. O último evento é a
        // saída: a pessoa acabou de comer e foi-se embora. Julgá-la pela
        // entrada poria alguém que já não está no edifício na coluna de quem
        // tem de ser ido buscar.
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', MEIODIA - 55 * MIN),
            ev('0001', 'SAIDA', MEIODIA - 35 * MIN)
        ], MEIODIA, opts);
        expect(r.doitSortir).toHaveLength(0);
        expect(r.sortis.map(x => x.userId)).toEqual(['0001']);
    });

    it('★★ quem saiu há 40 min ou mais some da tela; aos 39 ainda está', () => {
        expect(cantine.classificar([ev('0001', 'SAIDA', MEIODIA - 39 * MIN)], MEIODIA, opts).sortis)
            .toHaveLength(1);
        expect(cantine.classificar([ev('0001', 'SAIDA', MEIODIA - 40 * MIN)], MEIODIA, opts).sortis)
            .toHaveLength(0);
    });

    it('★★ o piso corta o dia anterior e o "limpar a tela"', () => {
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', MEIODIA - 5 * MIN),
            ev('0002', 'ENTRADA', MEIODIA - 300 * MIN)
        ], MEIODIA, { parseMs: (x) => x, pisoMs: MEIODIA - 60 * MIN });
        expect(r.dans.map(x => x.userId)).toEqual(['0001']);
    });
});

describe('decantação — sai da coluna, nunca da conta', () => {
    it('★★★ passado o teto + 15 min, a linha DECANTA (e continua na lista de decantados)', () => {
        // 30 (teto) + 15 (decantação) = 45. Aos 44 min ainda está na coluna;
        // aos 46 saiu dela — mas continua a existir, contada, na pastilha.
        const naColuna = cantine.classificar([ev('0001', 'ENTRADA', MEIODIA - 44 * MIN)], MEIODIA, opts);
        expect(naColuna.doitSortir).toHaveLength(1);
        expect(naColuna.decantados).toHaveLength(0);

        const decantada = cantine.classificar([ev('0001', 'ENTRADA', MEIODIA - 46 * MIN)], MEIODIA, opts);
        expect(decantada.doitSortir).toHaveLength(0);
        expect(decantada.decantados.map(x => x.userId)).toEqual(['0001']);
    });

    it('★★★ NADA É APAGADO: coluna + decantados dá sempre o total de quem excedeu', () => {
        // A asserção que protege a promessa da tela. Se o total caísse quando
        // uma linha decanta, o ecrã estaria a afirmar que a pessoa saiu do
        // refeitório — que é precisamente o que ninguém sabe.
        const logs = [];
        for (let i = 0; i < 12; i++) logs.push(ev('U' + i, 'ENTRADA', MEIODIA - (32 + i * 3) * MIN));
        const r = cantine.classificar(logs, MEIODIA, opts);
        expect(r.doitSortir.length + r.decantados.length).toBe(12);
        expect(r.dans).toHaveLength(0);
    });

    it('★★ a decantação segue a property: com 0 min, tudo decanta de imediato', () => {
        cantine.configurar({ cantine: { decantacaoMinutos: 0 } });
        const r = cantine.classificar([ev('0001', 'ENTRADA', MEIODIA - 31 * MIN)], MEIODIA, opts);
        expect(r.doitSortir).toHaveLength(0);
        expect(r.decantados).toHaveLength(1);
    });
});

describe('faixas de duração — só para quem atravessou os DOIS leitores', () => {
    it('★★★ 8 minutos entre entrada e saída: TROP COURT', () => {
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', MEIODIA - 20 * MIN),
            ev('0001', 'SAIDA', MEIODIA - 12 * MIN)
        ], MEIODIA, opts);
        expect(r.sortis[0].duracaoMin).toBe(8);
        expect(r.sortis[0].faixa).toBe('curta');
    });

    it('★★ 22 minutos: normal, sem marca', () => {
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', MEIODIA - 30 * MIN),
            ev('0001', 'SAIDA', MEIODIA - 8 * MIN)
        ], MEIODIA, opts);
        expect(r.sortis[0].faixa).toBe('normal');
    });

    it('★★ 35 minutos: longa', () => {
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', MEIODIA - 40 * MIN),
            ev('0001', 'SAIDA', MEIODIA - 5 * MIN)
        ], MEIODIA, opts);
        expect(r.sortis[0].faixa).toBe('longa');
    });

    it('★★★ SEM A ENTRADA REGISTADA NÃO HÁ DURAÇÃO — e não há acusação', () => {
        // ⚠️ O teste que impede a tela de repetir o defeito de produção contra
        // a criança. Em 24/08/2026 os dois leitores de ENTRADA perderam 95
        // eventos: essas pessoas comeram e a entrada delas nunca foi gravada.
        // Uma duração inventada a partir do início do serviço marcá-las-ia
        // como «passou sem comer» — exatamente quem o sistema falhou em ver.
        const r = cantine.classificar([ev('0001', 'SAIDA', MEIODIA - 5 * MIN)], MEIODIA, opts);
        expect(r.sortis).toHaveLength(1);
        expect(r.sortis[0].duracaoMin).toBeNull();
        expect(r.sortis[0].faixa).toBeNull();
    });

    it('★★ a entrada emparelhada é a mais recente ANTES da saída', () => {
        // Entrou, saiu, voltou a entrar e saiu outra vez. A duração da última
        // saída é a da última visita, não a da primeira.
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', MEIODIA - 90 * MIN),
            ev('0001', 'SAIDA', MEIODIA - 70 * MIN),
            ev('0001', 'ENTRADA', MEIODIA - 25 * MIN),
            ev('0001', 'SAIDA', MEIODIA - 5 * MIN)
        ], MEIODIA, opts);
        expect(r.sortis[0].duracaoMin).toBe(20);
        expect(r.sortis[0].faixa).toBe('normal');
    });

    it('★★ as faixas seguem as properties, não números fixos', () => {
        cantine.configurar({ cantine: { duracaoCurtaMinutos: 5, duracaoMaximaMinutos: 90 } });
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', MEIODIA - 18 * MIN),
            ev('0001', 'SAIDA', MEIODIA - 10 * MIN)
        ], MEIODIA, opts);
        expect(r.sortis[0].faixa).toBe('normal');   // 8 min: curto com 15, normal com 5
    });
});

describe('abertura antecipada — uma afirmação sobre o serviço, não sobre a pessoa', () => {
    it('★★★ conta as ENTRADAS antes da hora configurada', () => {
        const dezEMeia = new Date(2026, 7, 25, 10, 30, 0).getTime();
        const onzeEMeia = new Date(2026, 7, 25, 11, 30, 0).getTime();
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', dezEMeia),
            ev('0002', 'ENTRADA', dezEMeia),
            ev('0003', 'ENTRADA', onzeEMeia)
        ], MEIODIA, opts);
        expect(r.antesDaAbertura).toBe(2);
    });

    it('★★ SAIDA antes da abertura não conta — o que se afirma é que a cantina ABRIU cedo', () => {
        const dezEMeia = new Date(2026, 7, 25, 10, 30, 0).getTime();
        const r = cantine.classificar([ev('0001', 'SAIDA', dezEMeia)], MEIODIA, opts);
        expect(r.antesDaAbertura).toBe(0);
    });

    it('★★ segue a hora configurada, não as 11h de fábrica', () => {
        cantine.configurar({ cantine: { lyceeInicio: '10:00' } });
        const dezEMeia = new Date(2026, 7, 25, 10, 30, 0).getTime();
        const r = cantine.classificar([ev('0001', 'ENTRADA', dezEMeia)], MEIODIA, opts);
        expect(r.antesDaAbertura).toBe(0);
    });
});

describe('robustez — a tela não pode quebrar ao balcão', () => {
    it('★ lista vazia, nula, ou com timestamps ilegíveis', () => {
        expect(cantine.classificar([], MEIODIA, opts).dans).toHaveLength(0);
        expect(cantine.classificar(null, MEIODIA, opts).sortis).toHaveLength(0);
        const r = cantine.classificar([
            ev('0001', 'ENTRADA', NaN),
            ev('0002', 'ENTRADA', MEIODIA - 2 * MIN)
        ], MEIODIA, opts);
        expect(r.dans.map(x => x.userId)).toEqual(['0002']);
    });

    it('★ uma ação desconhecida é ignorada, não colocada numa coluna à sorte', () => {
        const r = cantine.classificar([ev('0001', 'INVENTADA', MEIODIA - 2 * MIN)], MEIODIA, opts);
        expect(r.dans).toHaveLength(0);
        expect(r.sortis).toHaveLength(0);
        expect(r.doitSortir).toHaveLength(0);
    });

    it('★★ ordenação: dentro e sortis por recência; quem excedeu, o mais antigo primeiro', () => {
        const r = cantine.classificar([
            ev('A', 'ENTRADA', MEIODIA - 2 * MIN),
            ev('B', 'ENTRADA', MEIODIA - 10 * MIN),
            ev('C', 'ENTRADA', MEIODIA - 35 * MIN),
            ev('D', 'ENTRADA', MEIODIA - 42 * MIN)
        ], MEIODIA, opts);
        expect(r.dans.map(x => x.userId)).toEqual(['A', 'B']);
        // por quem se começa: quem está lá dentro há mais tempo
        expect(r.doitSortir.map(x => x.userId)).toEqual(['D', 'C']);
    });
});
