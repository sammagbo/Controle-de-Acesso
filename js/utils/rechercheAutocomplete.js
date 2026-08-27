// =====================================================================
// LA MACHINE À ÉTATS DE L'AUTOCOMPLÉTION — pure, testable, hors du JSX
// =====================================================================
// ⚠️ POURQUOI ELLE EXISTE. La première version tenait cette logique en ligne
// dans le composant, et le panel du 27/08 y a trouvé le défaut le plus grave
// de la nuit : Entrée appliquée à une liste PÉRIMÉE ouvrait le parcours d'un
// autre enfant. Le compteur de requêtes protégeait bien l'écriture de l'état
// — mais pas l'ACTION. Une réponse jetée et une réponse affichée puis agie
// sont deux choses différentes, et rien dans le composant ne disait laquelle
// était laquelle.
//
// ⚠️ LA RÈGLE, EN UNE PHRASE : une liste n'appartient qu'au texte qui l'a
// demandée. Tant que le terme affiché et le terme de la liste diffèrent, la
// liste ne peut être ni ouverte au clavier, ni traitée comme une réponse.
// C'est pour cela que `Resposta` transporte son terme : un tableau nu ne peut
// pas dire de quelle question il est la réponse.
//
// Aucune dépendance, aucun DOM, aucun React : c'est du calcul, et le projet a
// déjà cette forme (`postoFixo.js`, `travaDeVoo.js`, `permissions.js`).

(function (global) {
    'use strict';

    /** Le minimum en dessous duquel on ne demande rien. Le serveur l'applique aussi. */
    var MINIMO = 2;

    /**
     * ⚠️ 250 ms. En dessous, taper « Marie » part cinq fois dont quatre déjà
     * périmées ; au-dessus, la liste traîne derrière les doigts.
     */
    var DEBOUNCE_MS = 250;

    /**
     * ⚠️ 8, pas les 20 du serveur. Une liste d'autocomplétion qui dépasse la
     * hauteur de l'écran n'aide plus : on flèche dans le vide. Et chaque ligne
     * de trop est le nom d'un mineur transmis sans qu'on l'ait demandé.
     */
    var LIMITE_SUGESTOES = 8;

    /** Le texte, débarrassé de ce qui ne compte pas. Un seul endroit. */
    function normaliza(t) {
        return String(t == null ? '' : t).trim();
    }

    /** Faut-il demander quoi que ce soit pour ce texte ? */
    function vaiPerguntar(texto) {
        return normaliza(texto).length >= MINIMO;
    }

    /**
     * Cette réponse répond-elle à ce qui est écrit MAINTENANT ?
     *
     * ⚠️ Le cœur de la correction. `resposta` porte le terme qui l'a demandée ;
     * si l'utilisateur a continué à taper, la réponse est un document
     * historique, pas une liste d'options. On ne l'affiche pas, et surtout on
     * n'agit pas dessus.
     */
    function aplicavel(resposta, textoAtual) {
        if (!resposta) return false;
        return normaliza(resposta.termo) === normaliza(textoAtual);
    }

    /**
     * Ce que fait Entrée.
     *
     * `{acao:'abrir', item}`   — la liste est à jour et un élément est surligné
     * `{acao:'esperar'}`       — la liste est périmée ou pas encore arrivée :
     *                            NE RIEN FAIRE est la bonne réponse. Ouvrir le
     *                            premier venu, c'est ouvrir un autre enfant.
     * `{acao:'nada'}`          — rien à chercher (moins de 2 caractères)
     */
    function aoEntrar(resposta, textoAtual, destaque) {
        if (!vaiPerguntar(textoAtual)) return { acao: 'nada' };
        if (!aplicavel(resposta, textoAtual)) return { acao: 'esperar' };
        var itens = (resposta && resposta.itens) || [];
        if (!itens.length) return { acao: 'esperar' };
        var i = (typeof destaque === 'number' && destaque >= 0 && destaque < itens.length)
            ? destaque : 0;
        return { acao: 'abrir', item: itens[i] };
    }

    /**
     * Le déplacement des flèches, en boucle.
     *
     * ⚠️ Il boucle de propos délibéré : au bout de huit lignes, redescendre
     * jusqu'en haut est plus rapide que de remonter huit fois.
     */
    function proximoDestaque(total, atual, direcao) {
        if (!total || total < 1) return 0;
        var i = (typeof atual === 'number' && atual >= 0) ? atual : 0;
        return ((i + direcao) % total + total) % total;
    }

    global.MagboRechercheAuto = {
        MINIMO: MINIMO,
        DEBOUNCE_MS: DEBOUNCE_MS,
        LIMITE_SUGESTOES: LIMITE_SUGESTOES,
        normaliza: normaliza,
        vaiPerguntar: vaiPerguntar,
        aplicavel: aplicavel,
        aoEntrar: aoEntrar,
        proximoDestaque: proximoDestaque
    };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = (typeof window !== 'undefined' ? window : globalThis).MagboRechercheAuto;
}
