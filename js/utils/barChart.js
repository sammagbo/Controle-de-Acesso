// =====================================================================
// GEOMETRIA DAS BARRAS — lógica pura, sem React e sem DOM
// =====================================================================
// Converte uma série de números nas ALTURAS das barras que a representam.
// Fora do componente de propósito: é a única parte do gráfico que pode estar
// errada em silêncio, e a única que dá para testar sem abrir o Electron.
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboBarChart, via <script> no index.html
//   • Vitest    → module.exports (package.json não tem "type": "module")

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboBarChart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * ⚠️ ALTURAS EM PIXELS, NÃO EM PORCENTAGEM — e é este o conserto.
     *
     * O defeito relatado em produção (11/08/2026) era "86 e 2 desenham a mesma
     * barra". O cálculo existia e estava certo; o que não funcionava era o CSS:
     *
     *     <div class="flex items-end h-28">            ← altura definida (112px)
     *       <div class="flex-1 flex flex-col ...">     ← items-end NÃO estica: altura AUTO
     *         <div style="height: 62%; min-height: 8px">
     *
     * `height` em porcentagem só resolve contra um pai de altura DEFINIDA. Com
     * `items-end` o pai não é esticado, sua altura é `auto`, a porcentagem vira
     * `auto`, a barra (vazia) colapsa para zero e o `min-height` assume. Todas
     * as barras saíam com exatamente 8px — 86 e 2 do mesmo tamanho, e no
     * gráfico das horas todas idênticas em 4px.
     *
     * Foi por isso que "Répartition par Niveau" nunca teve o problema: usa
     * `width: %`, e largura resolve contra a largura do pai, que é definida.
     *
     * Devolver pixel elimina a classe inteira do defeito: não depende de
     * nenhum ancestral ter altura resolvível, e não volta se alguém trocar um
     * `items-end` por um `items-center` três meses adiante.
     */
    const ALTURA_MAXIMA_PADRAO = 72;

    /**
     * Piso, em pixels, de uma barra com valor MAIOR QUE ZERO.
     *
     * ⚠️ ELE QUEBRA A PROPORCIONALIDADE NO PÉ DA ESCALA, de propósito, e vale
     * dizer o que se ganha e o que se perde. Com máximo 86 e valor 2, o
     * proporcional daria 1,7px — na prática invisível, e "invisível" já
     * significa outra coisa no gráfico: significa ZERO.
     *
     * Então a garantia que se escolheu preservar não é a proporção exata no
     * pé da escala, é esta: **barra ausente = valor zero, sempre**. Nenhum
     * valor real desaparece, e nenhum zero ganha corpo.
     *
     * 6px contra 72px de máximo: acima da espessura de uma borda (1-2px, que
     * o olho lê como linha e não como barra) e ainda pequeno o bastante para
     * não competir com uma barra de verdade. O custo é que valores abaixo de
     * ~8% do máximo são todos desenhados iguais, com 6px — por isso o número
     * continua impresso acima da barra no gráfico por dia.
     */
    const MINIMO_VISIVEL_PADRAO = 6;

    function numeroPositivo(valor, padrao) {
        const n = Number(valor);
        return (isFinite(n) && n > 0) ? n : padrao;
    }

    /** Valor utilizável: negativo, nulo, NaN e texto viram 0. */
    function valorLimpo(v) {
        const n = Number(v);
        return (isFinite(n) && n > 0) ? n : 0;
    }

    /**
     * Alturas em pixels para uma série, escaladas contra o MAIOR valor dela.
     *
     * Os três casos de borda, e o que cada um faz:
     *
     *  • SÉRIE TODA ZERADA — não há proporção a mostrar, e inventar uma barra
     *    mínima para todo mundo desenharia um gráfico cheio para um dia em que
     *    ninguém entrou. Todas ficam em 0: o gráfico fica visivelmente vazio,
     *    que é a verdade. (Também é o que impede a divisão por zero.)
     *
     *  • UM ÚNICO VALOR NÃO-ZERO — ele É o máximo, então recebe a altura
     *    inteira e os demais ficam em 0. Sem escala relativa, uma barra só não
     *    diz nada sobre grandeza — o número ao lado é que diz.
     *
     *  • MÁXIMO MUITO MAIOR QUE O RESTO — os pequenos caem no piso de
     *    MINIMO_VISIVEL (ver acima). Preferir "pequeno porém visível" a
     *    "matematicamente exato porém invisível", porque invisível já quer
     *    dizer zero neste gráfico.
     *
     * @param valores  série de números na ordem em que serão desenhados
     * @param opcoes   { alturaMaxima, minimoVisivel } em pixels
     * @returns número[] com a MESMA ordem e o MESMO comprimento da entrada
     */
    function alturas(valores, opcoes) {
        const cfg = opcoes || {};
        const alturaMaxima = numeroPositivo(cfg.alturaMaxima, ALTURA_MAXIMA_PADRAO);
        const minimoVisivel = Math.min(
            numeroPositivo(cfg.minimoVisivel, MINIMO_VISIVEL_PADRAO), alturaMaxima);

        const limpos = (Array.isArray(valores) ? valores : []).map(valorLimpo);
        const maximo = limpos.reduce(function (m, v) { return v > m ? v : m; }, 0);

        if (maximo <= 0) return limpos.map(function () { return 0; });

        return limpos.map(function (v) {
            if (v <= 0) return 0;
            return Math.max(minimoVisivel, Math.round(v / maximo * alturaMaxima));
        });
    }

    /**
     * Como `alturas`, mas a partir de um objeto e de uma ordem de chaves.
     *
     * Os dois gráficos do CDI guardam a contagem em objeto — `{1: 8, 2: 0, …}`
     * por dia da semana, `{8: 3, 9: 12, …}` por hora — e a ordem de desenho é a
     * das chaves, não a de inserção. Passar pelo array evita que alguém confie
     * na ordem de `Object.keys`, que para chaves numéricas não é a de inserção.
     *
     * @returns [{ chave, valor, altura, vazio }]
     */
    function series(contagens, chaves, opcoes) {
        const lista = Array.isArray(chaves) ? chaves : [];
        const fonte = contagens || {};
        const valores = lista.map(function (k) { return valorLimpo(fonte[k]); });
        const px = alturas(valores, opcoes);
        return lista.map(function (k, i) {
            return { chave: k, valor: valores[i], altura: px[i], vazio: valores[i] <= 0 };
        });
    }

    return {
        ALTURA_MAXIMA_PADRAO: ALTURA_MAXIMA_PADRAO,
        MINIMO_VISIVEL_PADRAO: MINIMO_VISIVEL_PADRAO,
        alturas: alturas,
        series: series
    };
});
