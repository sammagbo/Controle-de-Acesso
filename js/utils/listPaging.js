// =====================================================================
// PAGINAÇÃO DE LISTA LONGA — aritmética do ListaLimitada
// =====================================================================
// Separado do componente porque é a parte que erra em silêncio: um off-by-one
// aqui mostra "200 de 1197" quando são 199, ou esconde a última linha da lista.
// O relatório real do HikCentral tem 1197 linhas — renderizar todas de uma vez
// congela a janela do Electron por segundos.

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboListPaging = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /** Teto de linhas renderizadas por vez. */
    const LINHAS_POR_PAGINA = 200;

    /**
     * Estado de exibição de uma lista.
     *
     * @param total      linhas existentes
     * @param mostrando  teto pedido no momento (cresce de LINHAS_POR_PAGINA em vez)
     */
    function pageState(total, mostrando, tamanhoPagina) {
        const tam = tamanhoPagina || LINHAS_POR_PAGINA;
        const t = Math.max(0, Number(total) || 0);
        const pedido = Math.max(0, Number(mostrando) || 0);
        const visiveis = Math.min(pedido, t);
        const restantes = t - visiveis;
        return {
            total: t,
            visiveis: visiveis,
            restantes: restantes,
            truncada: restantes > 0,
            // Rótulo do contador: "200 de 1197" enquanto corta, só "9" quando
            // cabe tudo — número solto com "de" sugere que falta coisa.
            rotulo: restantes > 0 ? visiveis + ' de ' + t : String(t),
            proximoLote: Math.min(tam, restantes)
        };
    }

    /** Próximo teto ao clicar em "mostrar mais". Nunca ultrapassa o total. */
    function nextChunk(mostrando, total, tamanhoPagina) {
        const tam = tamanhoPagina || LINHAS_POR_PAGINA;
        const t = Math.max(0, Number(total) || 0);
        return Math.min(t, (Math.max(0, Number(mostrando) || 0)) + tam);
    }

    return {
        LINHAS_POR_PAGINA: LINHAS_POR_PAGINA,
        pageState: pageState,
        nextChunk: nextChunk
    };
});
