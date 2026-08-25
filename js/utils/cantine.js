// =====================================================================
// MONITEUR CANTINE — as regras da tela, fora do React
// =====================================================================
// Em que coluna cada pessoa cai, quanto tempo ficou, o que decanta e o que
// ainda conta. Tudo isto era `useMemo` dentro do CantineMonitor, onde nenhuma
// suíte deste projeto alcança: **nada aqui renderiza React**, e por isso nada
// aqui era testado. As três decisões que a tela toma sobre uma criança —
// «está dentro», «ficou tempo demais», «passou sem comer» — passaram a viver
// aqui para poderem ser provadas.
//
// ⚠️ NÚMEROS VÊM DO BACKEND, com fallback. Os quatro parâmetros (abertura,
// duração curta, duração máxima, decantação) são properties `magbo.cantine.*`
// e descem por GET /api/access/report-config. Enquanto o teto vivia como
// `STAY_LIMIT_MS = 1h` neste ficheiro E como `MAX_CANTINA_TIME = 1h` no Java,
// mudar um deixava a tela a afirmar o contrário do que o servidor gravava —
// exatamente o defeito que `f442db9` corrigiu para o piso de visita. O
// fallback existe para a tela nunca ficar SEM regra se a busca falhar, e é
// igual ao default do `CantineProperties`.
//
// Carrega dos dois jeitos:
//   • navegador → window.MagboCantine, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboCantine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // Espelho dos defaults de CantineProperties.java. Mudar os dois juntos.
    const FALLBACK = {
        lyceeInicio: '11:00',
        lyceeFim: '15:00',
        duracaoCurtaMinutos: 15,
        duracaoMaximaMinutos: 30,
        decantacaoMinutos: 15
    };

    // Quanto tempo quem saiu continua visível. NÃO é configurável de propósito:
    // não é uma afirmação sobre a escola, é o tamanho da memória curta da tela.
    const SORTIS_VISIVEL_MS = 40 * 60 * 1000;

    let atual = Object.assign({}, FALLBACK);
    let veioDoServidor = false;

    /**
     * Recebe o bloco `cantine` de GET /api/access/report-config.
     *
     * Recusa lixo campo a campo e mantém o fallback do que não servir — meio
     * bloco válido é melhor que nenhum, e uma tela sem teto de permanência
     * poria toda a gente em DOIT SORTIR ou ninguém.
     */
    function configurar(cfg) {
        const bloco = (cfg && cfg.cantine) || cfg;
        if (!bloco || typeof bloco !== 'object') return false;
        let algum = false;

        ['lyceeInicio', 'lyceeFim'].forEach(function (k) {
            if (validarHora(bloco[k])) { atual[k] = bloco[k]; algum = true; }
        });
        ['duracaoCurtaMinutos', 'duracaoMaximaMinutos', 'decantacaoMinutos'].forEach(function (k) {
            const n = Number(bloco[k]);
            if (isFinite(n) && n >= 0) { atual[k] = n; algum = true; }
        });

        if (algum) veioDoServidor = true;
        return algum;
    }

    function validarHora(v) {
        return typeof v === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(v);
    }

    function config() { return Object.assign({}, atual); }
    function configurado() { return veioDoServidor; }

    /** Só para os testes: devolve o módulo ao estado de arranque. */
    function _reset() {
        atual = Object.assign({}, FALLBACK);
        veioDoServidor = false;
    }

    /** '11:00' -> minutos desde a meia-noite. */
    function minutosDe(hhmm) {
        const p = String(hhmm || '').split(':');
        return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
    }

    /**
     * A FAIXA DE DURAÇÃO de uma refeição.
     *
     * ⚠️ SÓ PARA QUEM ATRAVESSOU OS DOIS LEITORES. Sem a ENTRADA emparelhada
     * não há duração nenhuma, e inventar uma a partir do início do serviço
     * marcaria como «passou sem comer» quem o leitor da entrada não viu — que
     * é precisamente o defeito que a cantina teve em produção (95 entradas
     * perdidas num dia). Sem par, `faixa` é null e a linha não recebe marca:
     * a tela cala-se em vez de afirmar o que não sabe.
     */
    function faixaDe(duracaoMin, cfg) {
        if (duracaoMin === null || duracaoMin === undefined) return null;
        const c = cfg || atual;
        if (duracaoMin < c.duracaoCurtaMinutos) return 'curta';
        if (duracaoMin > c.duracaoMaximaMinutos) return 'longa';
        return 'normal';
    }

    /**
     * ESTA LINHA FOI RETIRADA À MÃO?
     *
     * ⚠️ A RETIRADA ESCONDE A LINHA COMO ELA ESTAVA, NUNCA A PESSOA PELO DIA.
     * Só conta se a passagem for ANTERIOR ao instante da retirada. Se a pessoa
     * voltar a entrar às 13h depois de ter sido retirada às 12h30, a entrada
     * nova reaparece — e tem de reaparecer: quem carregou no × às 12h30 não
     * sabia nada sobre as 13h, e um ecrã que continuasse calado estaria a
     * obedecer a uma ordem que ninguém deu.
     *
     * A chave é (pessoa, PONTO): o monitor mostra REFEI1, REFEI2 e CANTINA1 na
     * mesma tela e a mesma pessoa pode ter linha em mais do que uma.
     *
     * @param mapa  Map de "userId|pointId" -> instante da retirada (ms)
     */
    function foiRetirada(mapa, ev) {
        if (!mapa || mapa.size === 0) return false;
        const quando = mapa.get(ev.userId + '|' + (ev.pointId || ''));
        return quando !== undefined && ev._t <= quando;
    }

    /**
     * Indexa as retiradas vindas de GET /api/admin/cantine/removals.
     *
     * Uma linha sem `removidoEm` legível é IGNORADA em vez de esconder para
     * sempre: sem instante não há como saber o que ela cala, e o erro seguro
     * numa tela que diz quem está no refeitório é mostrar a mais.
     */
    function indexarRetiradas(retiradas) {
        const mapa = new Map();
        for (const r of (retiradas || [])) {
            if (!r || !r.userId) continue;
            const ms = new Date(r.removidoEm).getTime();
            if (!isFinite(ms)) continue;
            mapa.set(r.userId + '|' + (r.pointId || ''), ms);
        }
        return mapa;
    }

    /**
     * Reparte os eventos do dia nas colunas da tela.
     *
     * @param logs   eventos crus (userId, action, timestamp já em ms no campo _t
     *               ou parseáveis pelo `parseMs` recebido)
     * @param agora  Date.now() da tela
     * @param opts   { pisoMs, parseMs, retiradas }
     *
     * Devolve { dans, doitSortir, decantados, sortis, antesDaAbertura }.
     *
     * ⚠️ `decantados` NÃO é uma lista de descartados. São as linhas que já
     * passaram o tempo de decantação e saíram da COLUNA — continuam contadas,
     * e é isso que a pastilha do cabeçalho abre. Uma coluna com trinta nomes
     * não é uma lista de tarefas, é um muro; quem vê trinta anomalias não age
     * sobre nenhuma. O que decanta some da vista, nunca da contabilidade.
     */
    function classificar(logs, agora, opts) {
        const o = opts || {};
        const parseMs = o.parseMs || function (x) { return new Date(x).getTime(); };
        const piso = typeof o.pisoMs === 'number' ? o.pisoMs : 0;
        const retiradas = indexarRetiradas(o.retiradas);
        const c = atual;

        const tetoMs = c.duracaoMaximaMinutos * 60 * 1000;
        const decantaMs = c.decantacaoMinutos * 60 * 1000;

        // Todos os eventos do dia por pessoa, em ordem — é o par ENTRADA/SAIDA
        // que dá a duração, e o último evento sozinho não o dá.
        const porPessoa = new Map();
        for (const log of (logs || [])) {
            const ms = parseMs(log.timestamp);
            if (!isFinite(ms) || ms < piso) continue;
            if (!porPessoa.has(log.userId)) porPessoa.set(log.userId, []);
            porPessoa.get(log.userId).push(Object.assign({}, log, { _t: ms }));
        }

        const dans = [], doitSortir = [], decantados = [], sortis = [];
        const aberturaMin = minutosDe(c.lyceeInicio);
        let antesDaAbertura = 0;
        // Quantas linhas o operador tirou da vista. O ecrã DIZ este número em
        // vez de as fazer desaparecer sem rasto: uma linha que some sem
        // explicação é indistinguível de um defeito, e este sistema já perdeu
        // 95 entradas num dia sem ninguém reparar.
        let retiradosDaVista = 0;
        // ⚠️ QUAIS, e não só quantas. O rodapé conta as linhas escondidas AGORA;
        // a lista de retiradas do servidor traz todas as de hoje, incluindo as
        // que já não escondem nada (a pessoa saiu depois, e a saída é um facto
        // novo que a retirada não alcança). Mostrar os dois números lado a lado
        // — «1 ligne retirée» e um modal com três — faria o operador procurar
        // um defeito que não existe. As chaves deixam a tela listar exatamente
        // o que ela está a contar.
        const chavesRetiradas = new Set();

        for (const eventos of porPessoa.values()) {
            eventos.sort(function (a, b) { return a._t - b._t; });

            for (const ev of eventos) {
                if (ev.action !== 'ENTRADA') continue;
                const d = new Date(ev._t);
                if (d.getHours() * 60 + d.getMinutes() < aberturaMin) antesDaAbertura++;
            }

            const ultimo = eventos[eventos.length - 1];
            const decorrido = agora - ultimo._t;

            if (ultimo.action === 'ENTRADA') {
                // ⚠️ A retirada só alcança quem o ecrã dá como AINDA LÁ DENTRO —
                // as três famílias abaixo. Não alcança SORTIS, e é de propósito:
                // uma SAIDA é um facto NOVO, lido por um terminal depois de o
                // operador ter carimbado a linha como resolvida. Escondê-la
                // apagaria a prova de que ele tinha razão.
                if (foiRetirada(retiradas, ultimo)) {
                    retiradosDaVista++;
                    chavesRetiradas.add(ultimo.userId + '|' + (ultimo.pointId || ''));
                } else if (decorrido > tetoMs) {
                    // Passou o teto. Fica na coluna enquanto for acionável;
                    // depois decanta para a pastilha — sem sair da conta.
                    (decorrido > tetoMs + decantaMs ? decantados : doitSortir).push(ultimo);
                } else {
                    dans.push(ultimo);
                }
            } else if (ultimo.action === 'SAIDA') {
                if (decorrido >= SORTIS_VISIVEL_MS) continue;

                // A ENTRADA emparelhada: a mais recente ESTRITAMENTE antes
                // desta saída. Se não houver, a pessoa saiu sem ter sido vista
                // a entrar e não há duração a afirmar.
                let entradaT = null;
                for (const ev of eventos) {
                    if (ev.action === 'ENTRADA' && ev._t < ultimo._t) entradaT = ev._t;
                }
                const duracaoMin = entradaT === null
                    ? null
                    : Math.floor((ultimo._t - entradaT) / 60000);

                sortis.push(Object.assign({}, ultimo, {
                    _entradaT: entradaT,
                    duracaoMin: duracaoMin,
                    faixa: faixaDe(duracaoMin, c)
                }));
            }
        }

        dans.sort(function (a, b) { return b._t - a._t; });
        sortis.sort(function (a, b) { return b._t - a._t; });
        // Mais tempo dentro primeiro: é por quem se começa.
        doitSortir.sort(function (a, b) { return a._t - b._t; });
        decantados.sort(function (a, b) { return a._t - b._t; });

        return {
            dans: dans,
            doitSortir: doitSortir,
            decantados: decantados,
            sortis: sortis,
            antesDaAbertura: antesDaAbertura,
            retiradosDaVista: retiradosDaVista,
            chavesRetiradas: chavesRetiradas
        };
    }

    return {
        configurar: configurar,
        configurado: configurado,
        config: config,
        classificar: classificar,
        indexarRetiradas: indexarRetiradas,
        foiRetirada: foiRetirada,
        faixaDe: faixaDe,
        minutosDe: minutosDe,
        FALLBACK: FALLBACK,
        SORTIS_VISIVEL_MS: SORTIS_VISIVEL_MS,
        _reset: _reset
    };
});
