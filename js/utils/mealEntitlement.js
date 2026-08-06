// =====================================================================
// DIREITO À REFEIÇÃO — montagem do corpo do PUT, lógica pura
// =====================================================================
// `PUT /api/admin/meal-entitlements/{userId}` é um PUT de verdade: o
// `upsert` do backend grava `status`, `validFrom`, `validUntil` e `note`
// **incondicionalmente**. Campo que não vier no corpo chega como null e
// APAGA o valor que estava lá.
//
// Isso é o certo para um PUT — e é justamente por isso que quem chama
// precisa mandar o estado inteiro. A tela da cantina mandava só o status
// (com `validUntil: null` fixo), então cada clique no badge apagava em
// silêncio a vigência do aluno. Ninguém via: a lista recarrega do servidor
// logo depois e mostra o novo estado, já sem as datas.
//
// A montagem mora aqui, e não dentro do componente, porque componente
// neste projeto não é testável — não há bundler, as telas só existem
// dentro do Electron. Uma regra que decide o que é APAGADO no banco não
// pode ficar sem teste.
//
// Carrega dos dois jeitos:
//   • navegador → window.MagboMealEntitlement, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboMealEntitlement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    const AUTHORIZED = 'AUTHORIZED';
    const NOT_AUTHORIZED = 'NOT_AUTHORIZED';

    /**
     * Próximo status do badge.
     *
     * Só AUTHORIZED vira NOT_AUTHORIZED; qualquer outra coisa — inclusive
     * PENDING, que é o estado dos alunos sem linha — vira AUTHORIZED. É o
     * comportamento que já estava na tela, preservado de propósito: mudar o
     * destino do clique de PENDING é decisão de operação, não refatoração.
     */
    function nextStatus(currentStatus) {
        return currentStatus === AUTHORIZED ? NOT_AUTHORIZED : AUTHORIZED;
    }

    /**
     * Corpo do PUT para um clique no badge de status.
     *
     * Reenvia a vigência ATUAL porque o PUT substitui a linha inteira. Sem
     * isso, alternar o status apagava `valid_from` e `valid_until` — e um
     * aluno autorizado só até o fim do semestre passava a ficar autorizado
     * para sempre, sem que nada na tela indicasse a mudança.
     *
     * `note` NÃO é preservada de propósito: ela descreve a última alteração,
     * e cada alteração grava um evento no histórico com a sua própria nota.
     * A nota anterior continua legível na linha do tempo.
     *
     * @param current linha atual do entitlement (o DTO do backend), ou null
     *                quando o aluno ainda não tem linha (PENDING)
     * @param note    texto da alteração
     * @returns corpo pronto para `window.api.putMealEntitlement`
     */
    function buildTogglePayload(current, note) {
        const atual = current || {};
        return {
            status: nextStatus(atual.status),
            // `?? null` e não `|| null`: string vazia também vira null, e o
            // que importa é não mandar `undefined` — o JSON.stringify o
            // remove do corpo, o campo chega ausente no DTO e o efeito é
            // exatamente o apagamento que se está corrigindo.
            validFrom: atual.validFrom == null ? null : atual.validFrom,
            validUntil: atual.validUntil == null ? null : atual.validUntil,
            note: note
        };
    }

    return {
        AUTHORIZED: AUTHORIZED,
        NOT_AUTHORIZED: NOT_AUTHORIZED,
        nextStatus: nextStatus,
        buildTogglePayload: buildTogglePayload
    };
});
