// =====================================================================
// CARGA DOS PARÂMETROS DE RELATÓRIO — lógica pura, sem React e sem DOM
// =====================================================================
// O piso de visita curta vive em magbo.report.min-visit-seconds, no backend,
// mas o Rapport CDI é calculado no CLIENTE. Sem esta busca o JS usaria o
// próprio número e, mudada a property, a MESMA tela mostraria dois valores
// para o mesmo dia — sem nada acusar a divergência.
//
// O que se garante aqui é o comportamento em FALHA: se o servidor não
// responder, a tela NÃO pode ficar sem piso (passaria a contar visita de 1
// segundo como permanência) e NÃO pode quebrar. Ela segue com o fallback.
//
// Vive fora do App.js para poder ser testado — o efeito do React não é
// alcançável sem Electron.
//
// Carrega dos dois jeitos:
//   • navegador → window.MagboReportConfig, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboReportConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * Busca os parâmetros e entrega ao módulo de relatório.
     *
     * NUNCA lança: quem chama é um efeito do React logo depois do login, e uma
     * exceção ali derrubaria a montagem da tela por causa de um número de
     * ajuste fino.
     *
     * @param api     objeto com fetchReportConfig() (window.api)
     * @param report  objeto com configure() e effectiveMinVisitSeconds() (window.MagboReport)
     * @param log     opcional, para o aviso de falha (console)
     * @param cantine opcional, objeto com configurar() (window.MagboCantine)
     * @returns {Promise<{ok: boolean, minVisitSeconds: number, motivo: string|null}>}
     */
    async function carregar(api, report, log, cantine) {
        const aviso = (log && typeof log.warn === 'function') ? log.warn.bind(log) : function () {};

        if (!report || typeof report.configure !== 'function') {
            // Sem o módulo de relatório não há o que configurar. Não é erro de
            // rede: é ordem de carga dos <script> no index.html.
            return resultado(false, report, 'MagboReport ausente');
        }
        if (!api || typeof api.fetchReportConfig !== 'function') {
            aviso('[report-config] API indisponível; mantendo o fallback local');
            return resultado(false, report, 'api.fetchReportConfig ausente');
        }

        try {
            const cfg = await api.fetchReportConfig();
            report.configure(cfg);

            // ⚠️ MESMA RESPOSTA, SEGUNDO CONSUMIDOR — e num try/catch próprio.
            // O Moniteur Cantine lê os horários e as durações do mesmo bloco.
            // Uma falha a configurar a cantina não pode derrubar o piso de
            // visita do Rapport CDI, que é o motivo original desta busca: são
            // duas telas diferentes e nenhuma depende da outra.
            if (cantine && typeof cantine.configurar === 'function') {
                try {
                    if (!cantine.configurar(cfg)) {
                        aviso('[report-config] bloco cantine ausente ou inutilizável; a tela segue com o fallback');
                    }
                } catch (e) {
                    aviso('[report-config] cantine: ' + (e && e.message));
                }
            }
            // configure() já recusa lixo e volta ao fallback sozinho; aqui só se
            // reporta o que ficou VALENDO, que é o que importa para quem chama.
            const configurado = typeof report.isConfigured === 'function'
                ? report.isConfigured() : true;
            return resultado(configurado, report,
                configurado ? null : 'resposta sem minVisitSeconds utilizável');
        } catch (e) {
            aviso('[report-config] mantendo o fallback local: ' + (e && e.message));
            return resultado(false, report, (e && e.message) || 'falha na busca');
        }
    }

    function resultado(ok, report, motivo) {
        const piso = (report && typeof report.effectiveMinVisitSeconds === 'function')
            ? report.effectiveMinVisitSeconds()
            : null;
        return { ok: ok, minVisitSeconds: piso, motivo: motivo };
    }

    return { carregar: carregar };
});
