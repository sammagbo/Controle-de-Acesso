// =====================================================================
// TRAVA DE VOO — uma requisição por vez, e a resposta certa aplicada
// =====================================================================
// ⚠️ CORREÇÃO A UM DIAGNÓSTICO. O relato original era "falta guarda de
// requisição em voo, chegam respostas fora de ordem". A primeira metade é
// verdade; a segunda não. O efeito do SectorView JÁ tinha `let vivo = true` com
// cleanup, e o React roda o cleanup do efeito anterior ANTES do próximo — então
// só a resposta do efeito MAIS RECENTE escrevia estado. Resposta fora de ordem
// não produzia estado fora de ordem.
//
// Os dois defeitos REAIS, que o `vivo` não cobre:
//
//   1. RESPOSTA BOA DESCARTADA. Quando a resposta N-1 chega, o efeito que a
//      pediu já foi limpo (`vivo = false`) e ela é jogada fora — mesmo sendo
//      mais fresca do que o que está na tela, e mesmo sendo do MESMO ponto. Num
//      período lento a faixa CONGELA no último veredicto que conseguiu chegar
//      enquanto ainda era o mais novo, enquanto respostas continuam chegando e
//      sendo descartadas a cada 3 s. Não é desordem: é uma tela parada com a
//      rede trabalhando.
//
//   2. EMPILHAMENTO. Nada impede a chamada seguinte de sair com a anterior
//      ainda no ar. O ciclo do App.js é de 3 s; se o endpoint do regime levar
//      15 s, são cinco chamadas simultâneas ao mesmo endpoint — e o navegador
//      dá ~6 conexões por host, então o empilhamento pode faminto o próprio
//      polling de logs de que a tela depende.
//
// O App.js já resolveu isto uma vez, a poucas linhas de distância, e o
// SectorView copiou metade: lá existem `cancelled` (o papel do `vivo`) E
// `inFlight`. Este módulo é a outra metade, num lugar onde ela pode ser testada
// sem abrir o Electron.
//
// ⚠️ A CHAVE é o que decide se a resposta serve — aqui, o id do ponto. Uma
// resposta do PORT1 não pode pintar a tela do PORT2; uma resposta do PORT1
// pode, sim, pintar a tela do PORT1, tenha o efeito que a pediu sido limpo ou
// não. É essa distinção que separa "descartar o errado" de "descartar o velho".
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboTravaDeVoo, via <script> no index.html
//   • Vitest    → module.exports (package.json não tem "type": "module")

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboTravaDeVoo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * Cria uma trava. O estado vive no fechamento — num componente React ela
     * mora num useRef, para sobreviver às remontagens do efeito (é justamente
     * a sobrevivência que conserta o defeito 1).
     */
    function criar() {
        let emVoo = false;

        return {
            /**
             * Pode disparar agora?
             * @returns true se entrou (e a trava fechou); false se já havia uma
             *          requisição no ar — nesse caso NÃO dispare.
             */
            entrar() {
                if (emVoo) return false;
                emVoo = true;
                return true;
            },

            /** Terminou (com sucesso OU com erro — sempre no finally). */
            sair() {
                emVoo = false;
            },

            /** Só para teste e diagnóstico. */
            ocupada() {
                return emVoo;
            },

            /**
             * A resposta que chegou serve para o que está na tela agora?
             *
             * @param chavePedida chave de quando a requisição saiu (o ponto)
             * @param chaveAtual  chave do que está na tela AGORA
             *
             * ⚠️ Compara a CHAVE, nunca "o efeito ainda está vivo". Uma resposta
             * do mesmo ponto continua servindo mesmo que o efeito que a pediu já
             * tenha sido substituído por outro ciclo de polling — descartá-la é
             * o que congela a faixa.
             */
            aplicavel(chavePedida, chaveAtual) {
                return chavePedida != null && chavePedida === chaveAtual;
            }
        };
    }

    return { criar: criar };
});
