// =====================================================================
// FILTROS DE RELATÓRIO — lógica pura, sem React e sem DOM
// =====================================================================
// Vive fora dos componentes de propósito: é a única camada do frontend que
// decide QUAIS passagens contam, e a única que dá para testar sem abrir o
// Electron. Os componentes chamam; a regra mora aqui.
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboReport, via <script> no index.html
//   • Vitest    → module.exports (package.json não tem "type": "module")

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * Piso de duração de uma visita, em segundos.
     *
     * FONTE ÚNICA: a property magbo.report.min-visit-seconds do backend,
     * buscada uma vez em GET /api/access/report-config e entregue aqui por
     * `configure()`. Não existe mais constante espelhando o valor — enquanto
     * existia, mudar a property sem mudar o JS fazia a MESMA tela mostrar dois
     * números para o mesmo dia, e nada acusava a divergência.
     *
     * O valor abaixo é FALLBACK, não configuração: só entra em cena se o
     * backend não responder, e serve para a tela não passar a contar visita de
     * 1 segundo quando a rede pisca. Mexer nele não muda o sistema — mexa na
     * property.
     */
    const FALLBACK_MIN_VISIT_SECONDS = 60;

    /**
     * TETO de duração plausível — fallback, como o piso acima.
     *
     * ⚠️ Afirmação sobre ESTA escola, não lei: "ninguém fica mais de duas horas
     * no CDI" (12/08/2026). O valor em vigor vem do backend
     * (magbo.report.max-visit-seconds) via /api/access/report-config; este
     * número só entra se o servidor não responder, para a tela não passar a
     * contar como permanência um par de nove horas quando a rede pisca.
     */
    const FALLBACK_MAX_VISIT_SECONDS = 7200;

    let minVisitSecondsDoBackend = null;
    let maxVisitSecondsDoBackend = null;

    /** Recebe os parâmetros vindos de GET /api/access/report-config. */
    function configure(config) {
        const n = config && Number(config.minVisitSeconds);
        minVisitSecondsDoBackend = (typeof n === 'number' && isFinite(n) && n >= 0) ? n : null;
        const x = config && Number(config.maxVisitSeconds);
        maxVisitSecondsDoBackend = (typeof x === 'number' && isFinite(x) && x > 0) ? x : null;
        return effectiveMinVisitSeconds();
    }

    /** Piso em vigor: o do backend quando já chegou, o fallback enquanto não. */
    function effectiveMinVisitSeconds() {
        return minVisitSecondsDoBackend == null
            ? FALLBACK_MIN_VISIT_SECONDS
            : minVisitSecondsDoBackend;
    }

    /** Teto em vigor: o do backend quando já chegou, o fallback enquanto não. */
    function effectiveMaxVisitSeconds() {
        return maxVisitSecondsDoBackend == null
            ? FALLBACK_MAX_VISIT_SECONDS
            : maxVisitSecondsDoBackend;
    }

    /** true quando o valor em uso veio mesmo do servidor. */
    function isConfigured() {
        return minVisitSecondsDoBackend != null;
    }

    /** Marca da saída sintética das 17:00 (PresenceAutoCloseService.FLAG_FECHAMENTO). */
    const FLAG_FECHAMENTO = 'FECHAMENTO_AUTO';

    /**
     * ENTRADAs de REPETIÇÃO não abrem visita — auditoria de 10/08/2026.
     *
     * Espelho do VisitStatsService (backend) e do postoFixo.js: POSTO_FIXO é a
     * repetição de quem trabalha no ponto, JA_PRESENTE é a entrada de quem já
     * estava dentro. Sem este filtro, cada ENTRADA marcada virava uma "visita
     * aberta" fantasma na pilha do pairVisits, e a visita fechada media do
     * reconhecimento repetido até a saída — o Rapport CDI (calculado AQUI, no
     * cliente) inflava a contagem e encurtava a média.
     *
     * ⚠️ ASSIMÉTRICO: pula ENTRADA marcada, NUNCA uma SAÍDA — a saída marcada
     * continua fechando a visita, mesma regra das consultas do backend.
     */
    const FLAGS_DE_REPETICAO = ['POSTO_FIXO', 'JA_PRESENTE'];

    function entradaDeRepeticao(evento) {
        return !!evento && evento.entrada
            && FLAGS_DE_REPETICAO.indexOf(evento.flag) !== -1;
    }

    const TIPOS_DE_SERVIDOR = ['PROFESSOR', 'FUNCIONARIO'];

    /** true para PROFESSOR/FUNCIONARIO. Pessoa desconhecida não é servidor nem aluno. */
    function ehServidor(user) {
        return !!user && TIPOS_DE_SERVIDOR.indexOf(user.tipo) !== -1;
    }

    function ehAluno(user) {
        return !!user && user.tipo === 'ALUNO';
    }

    /**
     * Mantém só as pessoas que contam na tela.
     *
     * Sem `incluirFuncionarios`, servidor sai. Quem não está no cadastro
     * também sai: não dá para afirmar que é aluno, e deixar passar
     * contrabandearia servidor para dentro de um número que se pediu de aluno.
     */
    function filterPeopleByTipo(people, incluirFuncionarios) {
        const lista = Array.isArray(people) ? people : [];
        if (incluirFuncionarios) return lista.slice();
        return lista.filter(ehAluno);
    }

    /**
     * Mantém só as passagens de quem passa no filtro.
     *
     * @param logs         [{ studentId|userId, ... }]
     * @param lookupUser   (id) => user | null   (window.userCache.byId)
     */
    function filterLogsByTipo(logs, lookupUser, incluirFuncionarios) {
        const lista = Array.isArray(logs) ? logs : [];
        if (incluirFuncionarios) return lista.slice();
        const buscar = typeof lookupUser === 'function' ? lookupUser : function () { return null; };
        return lista.filter(function (l) {
            return ehAluno(buscar(l.studentId != null ? l.studentId : l.userId));
        });
    }

    /**
     * Emparelha ENTRADA→SAIDA por pessoa (e ponto, quando informado).
     *
     * Por PILHA, não por posição. O dado real tem ENTRADA sem SAIDA (a pessoa
     * saiu sem passar o rosto) e SAIDA sem ENTRADA (a entrada caiu na regra de
     * mesma passagem). Emparelhar de dois em dois casaria a entrada de uma
     * visita com a saída de outra — e foi o que produziu durações NEGATIVAS no
     * relatório do CDI.
     *
     * Aceita as duas formas de log que circulam no app:
     *   CDI  → { studentId, action: 'IN'|'OUT', timestamp: ms,   flag }
     *   crua → { userId,    action: 'ENTRADA'|'SAIDA', timestamp, flag }
     *
     * @returns [{ personId, start, end, seconds, open, autoClosed }]
     */
    function pairVisits(logs) {
        const eventos = (Array.isArray(logs) ? logs : [])
            .map(normalizeEvent)
            .filter(function (e) { return e && e.personId != null && e.time != null; })
            // Repetição marcada não abre visita (ver entradaDeRepeticao).
            .filter(function (e) { return !entradaDeRepeticao(e); })
            // Ordem CRESCENTE: o backend devolve do mais novo para o mais
            // antigo, e emparelhar nessa ordem inverte entrada com saída.
            .sort(function (a, b) { return a.time - b.time; });

        const porChave = new Map();
        eventos.forEach(function (e) {
            const chave = e.personId + '|' + (e.pointId || '') + '|' + diaDe(e.time);
            if (!porChave.has(chave)) porChave.set(chave, []);
            porChave.get(chave).push(e);
        });

        const visitas = [];
        porChave.forEach(function (lista) {
            let aberta = null;
            lista.forEach(function (e) {
                if (e.entrada) {
                    if (aberta) visitas.push(montarVisita(aberta, null));
                    aberta = e;
                } else if (aberta) {
                    visitas.push(montarVisita(aberta, e));
                    aberta = null;
                }
                // SAIDA sem entrada aberta: não há visita para fechar.
            });
            if (aberta) visitas.push(montarVisita(aberta, null));
        });
        return visitas;
    }

    function montarVisita(entrada, saida) {
        const seconds = saida ? Math.round((saida.time - entrada.time) / 1000) : null;
        return {
            personId: entrada.personId,
            pointId: entrada.pointId || null,
            start: entrada.time,
            end: saida ? saida.time : null,
            seconds: seconds,
            open: !saida,
            autoClosed: !!(saida && saida.flag === FLAG_FECHAMENTO)
        };
    }

    function normalizeEvent(l) {
        if (!l) return null;
        const acao = String(l.action || l.status || '').toUpperCase();
        const entrada = acao === 'IN' || acao === 'ENTRADA';
        const saida = acao === 'OUT' || acao === 'SAIDA';
        if (!entrada && !saida) return null;
        const bruto = l.timestamp;
        const time = typeof bruto === 'number' ? bruto : new Date(bruto).getTime();
        return {
            personId: l.studentId != null ? l.studentId : l.userId,
            pointId: l.pointId || null,
            time: isNaN(time) ? null : time,
            entrada: entrada,
            flag: l.flag || null
        };
    }

    function diaDe(ms) {
        const d = new Date(ms);
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }

    /**
     * Números de visita, com a regra da passagem rápida aplicada.
     *
     * • visita mais curta que `minVisitSeconds` NÃO conta — quem entra para dar
     *   um recado e sai não teve permanência;
     * • média só sobre visitas FECHADAS por saída REAL: visita aberta não tem
     *   duração, e o fechamento das 17:00 não é hora de saída de ninguém.
     */
    function summariseVisits(visits, minVisitSeconds, maxVisitSeconds) {
        const piso = typeof minVisitSeconds === 'number' ? minVisitSeconds : effectiveMinVisitSeconds();
        const teto = typeof maxVisitSeconds === 'number' ? maxVisitSeconds : effectiveMaxVisitSeconds();
        const lista = Array.isArray(visits) ? visits : [];

        const curtas = lista.filter(function (v) {
            return v.seconds != null && v.seconds < piso;
        });
        const contam = lista.filter(function (v) {
            return v.seconds == null || v.seconds >= piso;
        });
        const comDuracao = contam.filter(function (v) {
            return v.seconds != null && !v.autoClosed;
        });

        // ── TETO: o par longo demais é SAÍDA PERDIDA, não visita longa ──
        // O leitor facial perde saídas; com a reentrada tirada do pareamento
        // pelo JA_PRESENTE, o par formado vai da entrada ORIGINAL até a saída
        // de horas depois. Ele CONTA como visita (aconteceu), mas a DURAÇÃO
        // dele não é evidência de permanência — a mesma assimetria do piso.
        const implausiveis = comDuracao.filter(function (v) { return v.seconds > teto; });
        const plausiveis = comDuracao.filter(function (v) { return v.seconds <= teto; });

        const media = plausiveis.length === 0 ? null
            : Math.round(plausiveis.reduce(function (soma, v) {
                return soma + v.seconds / 60;
            }, 0) / plausiveis.length);

        const pessoas = {};
        contam.forEach(function (v) { pessoas[v.personId] = true; });

        return {
            visits: contam.length,
            uniquePeople: Object.keys(pessoas).length,
            avgDurationMin: media,
            shortVisitsIgnored: curtas.length,
            // Devolvido para a tela poder DIZER quantos ficaram de fora:
            // excluir em silêncio é o defeito que estas regras existem para
            // não repetir.
            implausibleIgnored: implausiveis.length,
            openVisits: contam.filter(function (v) { return v.open; }).length
        };
    }

    /**
     * O que está sendo contado, em texto, para a tela dizer em voz alta.
     *
     * Um número de "visitas" que exclui gente em silêncio é pior que um número
     * errado: o errado alguém contesta, o silencioso vira verdade. Esta linha é
     * a que faz duas pessoas olhando o mesmo dia perceberem que estão vendo
     * escopos diferentes.
     *
     * @returns {{escopo: string, curtas: string|null, partes: string[]}}
     */
    function describeScope(incluirFuncionarios, curtasIgnoradas) {
        const escopo = incluirFuncionarios ? 'Élèves + personnel' : 'Élèves seulement';
        const n = (typeof curtasIgnoradas === 'number' && curtasIgnoradas > 0) ? curtasIgnoradas : 0;
        const curtas = n > 0 ? (n + ' passage(s) éclair ignoré(s)') : null;
        return {
            escopo: escopo,
            curtas: curtas,
            partes: curtas ? [escopo, curtas] : [escopo]
        };
    }

    /** Períodos que a tela do CDI oferece, na ordem em que aparecem. */
    const PERIODOS = ['today', 'week', 'month'];

    const UM_DIA_MS = 24 * 60 * 60 * 1000;

    function emMilissegundos(valor) {
        if (valor == null) return null;
        if (valor instanceof Date) return valor.getTime();
        const n = typeof valor === 'number' ? valor : new Date(valor).getTime();
        return isNaN(n) ? null : n;
    }

    /**
     * A janela de tempo de um período: `[desde, ate)`, `ate` nulo = sem teto.
     *
     * ⚠️ "AUJOURD'HUI" É DIA DE CALENDÁRIO, as outras duas são JANELAS
     * MÓVEIS — e a assimetria é deliberada, não descuido.
     *
     * "Cette Semaine" e "Ce Mois" sempre foram `agora - 7 dias` e `agora - 30
     * dias`, e mudá-las para semana/mês de calendário mudaria em silêncio os
     * números que a documentalista já compara de uma semana para a outra. Não
     * é o que se pediu, então ficam exatamente como estavam.
     *
     * Já "Aujourd'hui" só tem uma leitura honesta: da meia-noite de hoje até a
     * meia-noite de amanhã. Se fosse "últimas 24 horas", às 9h da manhã a tela
     * mostraria metade de ontem sob o rótulo "hoje" — que é precisamente o
     * tipo de número que alguém lê de relance e leva para uma reunião.
     *
     * O teto existe (e as janelas móveis não têm) porque um evento com data no
     * futuro — relógio de terminal errado, fila offline reentregue — apareceria
     * dentro de "hoje" sem ter acontecido hoje.
     *
     * As datas saem do construtor `new Date(ano, mês, dia + 1)` e não de uma
     * soma de 24h: assim viram o mês e o ano sozinhas, e sobreviveriam ao
     * horário de verão se ele voltar (hoje o Brasil não tem).
     */
    function periodRange(range, now) {
        const base = emMilissegundos(now) == null ? Date.now() : emMilissegundos(now);
        const d = new Date(base);

        if (range === 'today') {
            return {
                desde: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
                ate: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
            };
        }
        const dias = range === 'month' ? 30 : 7;
        return { desde: base - dias * UM_DIA_MS, ate: null };
    }

    /**
     * Mantém as passagens dentro do período.
     *
     * Passagem sem hora legível fica FORA: não dá para afirmar que caiu no
     * período, e incluí-la inflaria justamente o número que se foi conferir.
     */
    function filterLogsByPeriod(logs, range, now) {
        const janela = periodRange(range, now);
        return (Array.isArray(logs) ? logs : []).filter(function (l) {
            const t = l ? emMilissegundos(l.timestamp) : null;
            if (t == null) return false;
            if (t < janela.desde) return false;
            return janela.ate == null || t < janela.ate;
        });
    }

    /** Título do relatório impresso, por período. */
    function periodLabel(range) {
        if (range === 'today') return 'Rapport du Jour';
        if (range === 'month') return 'Rapport Mensuel';
        return 'Rapport Hebdomadaire';
    }

    return {
        PERIODOS: PERIODOS,
        periodRange: periodRange,
        filterLogsByPeriod: filterLogsByPeriod,
        periodLabel: periodLabel,
        FALLBACK_MIN_VISIT_SECONDS: FALLBACK_MIN_VISIT_SECONDS,
        FALLBACK_MAX_VISIT_SECONDS: FALLBACK_MAX_VISIT_SECONDS,
        effectiveMaxVisitSeconds: effectiveMaxVisitSeconds,
        describeScope: describeScope,
        configure: configure,
        effectiveMinVisitSeconds: effectiveMinVisitSeconds,
        isConfigured: isConfigured,
        FLAG_FECHAMENTO: FLAG_FECHAMENTO,
        ehServidor: ehServidor,
        ehAluno: ehAluno,
        filterPeopleByTipo: filterPeopleByTipo,
        filterLogsByTipo: filterLogsByTipo,
        pairVisits: pairVisits,
        summariseVisits: summariseVisits
    };
});
