// =====================================================================
// PPMS — o RETRATO guardado, e as três razões de apagá-lo
// =====================================================================
// A lista nominativa do PPMS é guardada no localStorage a cada carga boa: numa
// evacuação a rede é a primeira coisa que cai, e uma tela que mostra um erro
// quando alguém precisa procurar uma criança não serve para nada.
//
// Guardar nome, matrícula e turma de MENORES no disco de um quiosque é uma
// decisão séria, e ela só se sustenta enquanto as regras de apagar forem
// respeitadas. Estas regras viviam espalhadas em três arquivos — o componente,
// o logout e um literal repetido — e a chave era uma string crua em dois deles.
// Quem renomeasse num lugar deixaria retrato nominativo em disco no outro, em
// silêncio.
//
// ⚠️ E ELAS NÃO TINHAM TESTE. O painel de revisão de 14/08 apontou: a purga no
// 403 existe e a prova é ler o código. Aqui a decisão vira função pura, e a
// função tem teste.
//
// As três razões de apagar, e por que cada uma:
//
//   1. 403/401 — o servidor disse que ESTE login não pode ver esta lista.
//      Sem esta regra, o componente caía no mesmo `catch` de uma queda de rede
//      e pintava o retrato guardado: nome, matrícula e turma de menores, do
//      disco, para quem o servidor acabou de recusar. E o retrato ficava lá.
//      ⚠️ NÃO é sessão expirada e NÃO desloga — não ter PPMS_READ é outra
//      coisa; é o único lugar do front onde 403 não derruba a sessão.
//
//   2. Retrato de OUTRO DIA — uma lista nominativa sem prazo é pior do que
//      lista nenhuma: às 8h de terça, o retrato de segunda às 17h descreve uma
//      escola que não existe, e quem o lê vai procurar gente que foi para casa.
//
//   3. LOGOUT — o quiosque é compartilhado. O retrato não pode sobreviver à
//      pessoa que o carregou.
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboPpmsCache, via <script> no index.html
//   • Vitest    → module.exports (package.json não tem "type": "module")

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboPpmsCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * A chave, UMA vez.
     *
     * ⚠️ Estava duplicada como literal em js/components/PpmsView.js e em
     * js/utils/auth.js. Renomear num lugar e não no outro deixaria o retrato
     * nominativo em disco depois do logout — e nada quebraria para avisar.
     */
    const CHAVE = 'magbo.ppms.ultimo';

    /**
     * A resposta do servidor obriga a APAGAR o retrato guardado?
     *
     * @param status código HTTP, ou null/undefined quando a requisição nem
     *               chegou a receber resposta (rede caída).
     * @returns true só para recusa de permissão.
     */
    function recusaDePermissao(status) {
        return status === 403 || status === 401;
    }

    /**
     * O retrato guardado ainda serve?
     *
     * @param guardado objeto lido do localStorage (ou null)
     * @param hojeISO  'YYYY-MM-DD' de hoje
     * @returns o retrato, ou null quando ele deve ser descartado.
     *
     * ⚠️ Sem data no retrato, DESCARTA. Um retrato de origem desconhecida é
     * exatamente o que a regra 2 existe para impedir — na dúvida sobre QUANDO
     * aquela lista foi feita, ela não pode ser mostrada como se fosse de agora.
     */
    function aindaServe(guardado, hojeISO) {
        if (!guardado || typeof guardado !== 'object') return null;
        const gerado = guardado.geradoEm;
        if (typeof gerado !== 'string' || gerado.length < 10) return null;
        return gerado.slice(0, 10) === hojeISO ? guardado : null;
    }

    /**
     * Apaga o retrato. Nunca lança — cota cheia, modo privado e localStorage
     * ausente não podem derrubar uma tela de evacuação.
     */
    function apagar(store) {
        try {
            const s = store || (typeof localStorage !== 'undefined' ? localStorage : null);
            if (s) s.removeItem(CHAVE);
            return true;
        } catch (e) {
            return false;
        }
    }

    return {
        CHAVE: CHAVE,
        recusaDePermissao: recusaDePermissao,
        aindaServe: aindaServe,
        apagar: apagar
    };
});
