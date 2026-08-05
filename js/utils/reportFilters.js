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
     * ⚠️ ESPELHA magbo.report.min-visit-seconds do backend (mesmo default 60,
     * nos quatro perfis). Os dois lados existem porque o Rapport CDI é
     * calculado no cliente e o "Vue d'ensemble" no servidor — mudar um sem o
     * outro faz a mesma tela mostrar dois números para o mesmo dia.
     */
    const MIN_VISIT_SECONDS = 60;

    /** Marca da saída sintética das 17:00 (PresenceAutoCloseService.FLAG_FECHAMENTO). */
    const FLAG_FECHAMENTO = 'FECHAMENTO_AUTO';

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
    function summariseVisits(visits, minVisitSeconds) {
        const piso = typeof minVisitSeconds === 'number' ? minVisitSeconds : MIN_VISIT_SECONDS;
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

        const media = comDuracao.length === 0 ? null
            : Math.round(comDuracao.reduce(function (soma, v) {
                return soma + v.seconds / 60;
            }, 0) / comDuracao.length);

        const pessoas = {};
        contam.forEach(function (v) { pessoas[v.personId] = true; });

        return {
            visits: contam.length,
            uniquePeople: Object.keys(pessoas).length,
            avgDurationMin: media,
            shortVisitsIgnored: curtas.length,
            openVisits: contam.filter(function (v) { return v.open; }).length
        };
    }

    return {
        MIN_VISIT_SECONDS: MIN_VISIT_SECONDS,
        FLAG_FECHAMENTO: FLAG_FECHAMENTO,
        ehServidor: ehServidor,
        ehAluno: ehAluno,
        filterPeopleByTipo: filterPeopleByTipo,
        filterLogsByTipo: filterLogsByTipo,
        pairVisits: pairVisits,
        summariseVisits: summariseVisits
    };
});
