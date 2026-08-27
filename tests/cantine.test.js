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

describe('retirada manual — esconde a LINHA, nunca a pessoa pelo dia', () => {
    const retirada = (userId, pointId, quandoMs) =>
        ({ userId, pointId, removidoEm: new Date(quandoMs).toISOString() });

    const comPonto = (userId, action, quandoMs, pointId) =>
        ({ userId, action, pointId: pointId || 'REFEI1', timestamp: quandoMs });

    it('★★★ a linha retirada sai de DANS LA CANTINE e é CONTADA como retirada', () => {
        const r = cantine.classificar(
            [comPonto('0001', 'ENTRADA', MEIODIA - 5 * MIN)], MEIODIA,
            { parseMs: (x) => x, retiradas: [retirada('0001', 'REFEI1', MEIODIA - 1 * MIN)] });
        expect(r.dans).toHaveLength(0);
        expect(r.retiradosDaVista).toBe(1);
    });

    it('★★★ sai também de DOIT SORTIR e dos DECANTADOS', () => {
        const opcoes = (quando) => ({ parseMs: (x) => x, retiradas: [retirada('0001', 'REFEI1', quando)] });
        // 40 min dentro → DOIT SORTIR
        expect(cantine.classificar([comPonto('0001', 'ENTRADA', MEIODIA - 40 * MIN)],
            MEIODIA, opcoes(MEIODIA)).doitSortir).toHaveLength(0);
        // 60 min dentro → decantado
        expect(cantine.classificar([comPonto('0001', 'ENTRADA', MEIODIA - 60 * MIN)],
            MEIODIA, opcoes(MEIODIA)).decantados).toHaveLength(0);
    });

    it('★★★ UMA ENTRADA NOVA DEPOIS DA RETIRADA REAPARECE', () => {
        // ⚠️ O teste que impede o × de virar uma ordem para o ecrã mentir pelo
        // resto do dia. Retirada às 12h30 (30 min atrás); a pessoa volta a
        // entrar 10 min atrás. Quem carregou no botão não sabia nada sobre
        // essa entrada, e escondê-la faria o monitor negar alguém que está
        // mesmo no refeitório.
        const r = cantine.classificar([
            comPonto('0001', 'ENTRADA', MEIODIA - 50 * MIN),
            comPonto('0001', 'ENTRADA', MEIODIA - 10 * MIN)
        ], MEIODIA, { parseMs: (x) => x, retiradas: [retirada('0001', 'REFEI1', MEIODIA - 30 * MIN)] });

        expect(r.dans.map(x => x.userId)).toEqual(['0001']);
        expect(r.retiradosDaVista).toBe(0);
    });

    it('★★★ a retirada é POR PONTO — não esconde a linha da pessoa noutro refeitório', () => {
        // O monitor mostra REFEI1, REFEI2 e CANTINA1 na mesma tela. Retirar
        // «a pessoa» esconderia a passagem que ninguém pediu para esconder.
        const r = cantine.classificar([
            comPonto('0001', 'ENTRADA', MEIODIA - 5 * MIN, 'REFEI1'),
            comPonto('0001', 'ENTRADA', MEIODIA - 4 * MIN, 'REFEI2')
        ], MEIODIA, { parseMs: (x) => x, retiradas: [retirada('0001', 'REFEI1', MEIODIA)] });

        // O último evento da pessoa é o de REFEI2, e ele não foi retirado.
        expect(r.dans).toHaveLength(1);
        expect(r.dans[0].pointId).toBe('REFEI2');
    });

    it('★★★ SORTIS NÃO é alcançado — uma saída lida é um facto NOVO', () => {
        // O terminal viu a pessoa sair depois de o operador ter carimbado a
        // linha como resolvida. Esconder isso apagaria a prova de que ele
        // tinha razão.
        const r = cantine.classificar([
            comPonto('0001', 'ENTRADA', MEIODIA - 40 * MIN),
            comPonto('0001', 'SAIDA', MEIODIA - 5 * MIN)
        ], MEIODIA, { parseMs: (x) => x, retiradas: [retirada('0001', 'REFEI1', MEIODIA - 20 * MIN)] });

        expect(r.sortis.map(x => x.userId)).toEqual(['0001']);
        expect(r.retiradosDaVista).toBe(0);
    });

    it('★★ sem retiradas, nada muda (o caminho normal)', () => {
        const r = cantine.classificar([comPonto('0001', 'ENTRADA', MEIODIA - 5 * MIN)], MEIODIA, opts);
        expect(r.dans).toHaveLength(1);
        expect(r.retiradosDaVista).toBe(0);
    });

    it('★★ retirada com instante ILEGÍVEL é ignorada — erra-se a mostrar, nunca a esconder', () => {
        const r = cantine.classificar([comPonto('0001', 'ENTRADA', MEIODIA - 5 * MIN)], MEIODIA, {
            parseMs: (x) => x,
            retiradas: [{ userId: '0001', pointId: 'REFEI1', removidoEm: 'ontem à tarde' }]
        });
        expect(r.dans).toHaveLength(1);
    });

    it('★ lixo na lista de retiradas não quebra a tela', () => {
        const r = cantine.classificar([comPonto('0001', 'ENTRADA', MEIODIA - 5 * MIN)], MEIODIA, {
            parseMs: (x) => x,
            retiradas: [null, undefined, {}, { pointId: 'REFEI1' }]
        });
        expect(r.dans).toHaveLength(1);
    });

    it('★★ indexarRetiradas: chave é pessoa|ponto, e o lixo cai fora', () => {
        const mapa = cantine.indexarRetiradas([
            retirada('0001', 'REFEI1', MEIODIA),
            retirada('0002', 'REFEI2', MEIODIA),
            { userId: '0003', pointId: 'REFEI1', removidoEm: 'xxx' }
        ]);
        expect(mapa.size).toBe(2);
        expect(mapa.has('0001|REFEI1')).toBe(true);
        expect(mapa.has('0002|REFEI2')).toBe(true);
        expect(mapa.has('0001|REFEI2')).toBe(false);
    });
});

describe('o rodapé conta o que o modal lista — os dois números têm de bater', () => {
    it('★★★ uma retirada que já não esconde nada NÃO entra nas chaves', () => {
        // A pessoa foi retirada às 12h30 e SAIU às 12h50. A saída é um facto
        // novo que a retirada não alcança, então nada está escondido por ela.
        // Contá-la faria o rodapé dizer «1 ligne retirée» com o modal vazio.
        const r = cantine.classificar([
            { userId: '0001', pointId: 'REFEI1', action: 'ENTRADA', timestamp: MEIODIA - 60 * MIN },
            { userId: '0001', pointId: 'REFEI1', action: 'SAIDA', timestamp: MEIODIA - 10 * MIN }
        ], MEIODIA, {
            parseMs: (x) => x,
            retiradas: [{ userId: '0001', pointId: 'REFEI1', removidoEm: new Date(MEIODIA - 30 * MIN).toISOString() }]
        });
        expect(r.retiradosDaVista).toBe(0);
        expect(r.chavesRetiradas.size).toBe(0);
    });

    it('★★★ o número do rodapé é sempre o tamanho da lista do modal', () => {
        const logs = [], retiradas = [];
        for (let i = 0; i < 5; i++) {
            logs.push({ userId: 'U' + i, pointId: 'REFEI1', action: 'ENTRADA', timestamp: MEIODIA - 20 * MIN });
        }
        // três retiradas efetivas + uma para alguém que não está na tela
        for (let i = 0; i < 3; i++) {
            retiradas.push({ userId: 'U' + i, pointId: 'REFEI1', removidoEm: new Date(MEIODIA).toISOString() });
        }
        retiradas.push({ userId: 'FANTASMA', pointId: 'REFEI1', removidoEm: new Date(MEIODIA).toISOString() });

        const r = cantine.classificar(logs, MEIODIA, { parseMs: (x) => x, retiradas });
        expect(r.retiradosDaVista).toBe(3);
        expect(r.chavesRetiradas.size).toBe(3);
        expect(retiradas.filter(x => r.chavesRetiradas.has(x.userId + '|' + x.pointId))).toHaveLength(3);
        expect(r.dans).toHaveLength(2);
    });
});

describe('les quatre familles — compteurs du jour', () => {
    const ev2 = (userId, action, quandoMs, flag) =>
        ({ userId, action, pointId: 'REFEI1', timestamp: quandoMs, flag: flag || null });

    it('★★★ AVANT et APRES sont comptés SÉPARÉMENT — c est toute la livraison', () => {
        const r = cantine.classificar([
            ev2('A', 'ENTRADA', MEIODIA - 10 * MIN, 'AVANT_CRENEAU'),
            ev2('B', 'ENTRADA', MEIODIA - 12 * MIN, 'AVANT_CRENEAU'),
            ev2('C', 'ENTRADA', MEIODIA - 14 * MIN, 'APRES_CRENEAU')
        ], MEIODIA, opts);
        expect(r.contadores.avantCreneau).toBe(2);
        expect(r.contadores.apresCreneau).toBe(1);
    });

    it('★★★ le FORA_HORARIO historique a SA propre famille, jamais réparti', () => {
        // Lui inventer une direction serait affirmer ce que la donnée ne dit
        // pas : avant le 27/08 le système n avait qu un drapeau sans direction.
        const r = cantine.classificar([
            ev2('A', 'ENTRADA', MEIODIA - 10 * MIN, 'FORA_HORARIO')
        ], MEIODIA, opts);
        expect(r.contadores.foraLegado).toBe(1);
        expect(r.contadores.avantCreneau).toBe(0);
        expect(r.contadores.apresCreneau).toBe(0);
    });

    it('★★★ courts et longs comptent TOUS les couples du jour, pas seulement les visibles', () => {
        // Une personne sortie il y a plus de 40 min n est plus dans SORTIS —
        // mais son repas trop court a bien eu lieu. Un compteur qui ne verrait
        // que l écran mentirait dès qu une ligne disparaît.
        const r = cantine.classificar([
            ev2('A', 'ENTRADA', MEIODIA - 200 * MIN), ev2('A', 'SAIDA', MEIODIA - 195 * MIN),
            ev2('B', 'ENTRADA', MEIODIA - 180 * MIN), ev2('B', 'SAIDA', MEIODIA - 120 * MIN)
        ], MEIODIA, opts);
        expect(r.sortis).toHaveLength(0);          // rien de visible
        expect(r.contadores.curtas).toBe(1);       // 5 min
        expect(r.contadores.longas).toBe(1);       // 60 min
    });

    it('★★ une durée normale ne compte dans aucune des deux', () => {
        const r = cantine.classificar([
            ev2('A', 'ENTRADA', MEIODIA - 40 * MIN), ev2('A', 'SAIDA', MEIODIA - 20 * MIN)
        ], MEIODIA, opts);
        expect(r.contadores.curtas).toBe(0);
        expect(r.contadores.longas).toBe(0);
    });

    it('★★ les compteurs suivent les seuils configurés', () => {
        cantine.configurar({ cantine: { duracaoCurtaMinutos: 30, duracaoMaximaMinutos: 90 } });
        const r = cantine.classificar([
            ev2('A', 'ENTRADA', MEIODIA - 60 * MIN), ev2('A', 'SAIDA', MEIODIA - 40 * MIN)
        ], MEIODIA, opts);
        expect(r.contadores.curtas).toBe(1);   // 20 min < 30
    });

    it('★ journée sans incident : tout à zéro, et les zéros existent', () => {
        const r = cantine.classificar([ev2('A', 'ENTRADA', MEIODIA - 5 * MIN)], MEIODIA, opts);
        expect(r.contadores).toEqual({ avantCreneau: 0, apresCreneau: 0, foraLegado: 0, curtas: 0, longas: 0 });
    });
});

describe('servicoDe — à quel service appartient un repas', () => {
    const grade = {
        creneaux: [
            { id: 1, diaSemana: 2, hora: '12:30:00', rotulo: '12H30 — prioritaire', ativo: true,
              turmas: [{ turma: '1E2' }, { turma: 'T1' }] },
            { id: 2, diaSemana: 2, hora: '13:00:00', rotulo: '13H00 — secondaire', ativo: true,
              turmas: [{ turma: '1E2' }] }
        ]
    };

    it('★★ une turma dans DEUX créneaux : le plus proche de l heure gagne', () => {
        expect(cantine.servicoDe(grade, '1E2', 2, 12 * 60 + 35)).toBe('12H30 — prioritaire');
        expect(cantine.servicoDe(grade, '1E2', 2, 13 * 60 + 10)).toBe('13H00 — secondaire');
    });

    it('★★ turma sans créneau ce jour-là, ou grade absente : null', () => {
        expect(cantine.servicoDe(grade, '6E1', 2, 12 * 60)).toBeNull();
        expect(cantine.servicoDe(grade, 'T1', 4, 12 * 60)).toBeNull();   // jeudi
        expect(cantine.servicoDe(null, '1E2', 2, 12 * 60)).toBeNull();
    });

    it('★ un créneau désactivé ne compte pas', () => {
        const off = { creneaux: [{ ...grade.creneaux[0], ativo: false }] };
        expect(cantine.servicoDe(off, '1E2', 2, 12 * 60 + 35)).toBeNull();
    });
});
