// =====================================================================
// LA MACHINE À ÉTATS DE L'AUTOCOMPLÉTION
// =====================================================================
// Le défaut que ces tests retiennent, dans les mots du panel du 27/08 :
//
//     « Je tape "ma" → la liste de "ma" arrive, l'index 0 est MARCOS. Je
//       continue "marie" et j'appuie sur Entrée avant que la nouvelle liste
//       n'arrive → le parcours de MARCOS s'ouvre, et le champ affiche un nom
//       que je n'ai jamais tapé. »
//
// Sur un écran dont la doctrine écrite est « il n'affirme jamais une présence
// que le système n'a pas vue », il affirmait la présence de quelqu'un d'autre.

import { describe, it, expect } from 'vitest';
import auto from '../js/utils/rechercheAutocomplete.js';

const resposta = (termo, ...nomes) => ({
    termo,
    itens: nomes.map((n, i) => ({ id: '000' + i, nome: n, turma: '6E1' }))
});

describe('une liste n\'appartient qu\'au texte qui l\'a demandée', () => {
    it('★★★ Entrée sur une liste PÉRIMÉE n\'ouvre personne', () => {
        // La liste de « ma » est arrivée ; l'utilisateur a continué à taper.
        const antiga = resposta('ma', 'MARCOS SILVA', 'MARIE DUPONT');
        expect(auto.aoEntrar(antiga, 'marie', 0)).toEqual({ acao: 'esperar' });
        // ⚠️ « esperar », PAS « ouvrir le premier ». Ne rien faire est la bonne
        // réponse : ouvrir MARCOS parce qu'il était surligné dans la liste
        // d'avant, c'est ouvrir la journée d'un autre enfant.
    });

    it('★★★ Entrée sur la liste À JOUR ouvre l\'élément surligné', () => {
        const atual = resposta('marie', 'MARIE DUPONT', 'MARIE LOPES');
        expect(auto.aoEntrar(atual, 'marie', 1))
            .toEqual({ acao: 'abrir', item: atual.itens[1] });
    });

    it('★★ les espaces autour du texte ne rendent pas la liste périmée', () => {
        // La faille signalée : le nom était stocké brut d'un côté et comparé
        // avec trim() de l'autre. Les deux passent par la même normalisation.
        const r = resposta('marie', 'MARIE DUPONT');
        expect(auto.aplicavel(r, '  marie  ')).toBe(true);
        expect(auto.aplicavel({ termo: ' marie ', itens: [] }, 'marie')).toBe(true);
    });

    it('★★ une liste à jour mais VIDE fait attendre, elle n\'ouvre rien', () => {
        expect(auto.aoEntrar(resposta('zzz'), 'zzz', 0)).toEqual({ acao: 'esperar' });
    });

    it('★★ pas de réponse du tout = attendre', () => {
        expect(auto.aoEntrar(null, 'marie', 0)).toEqual({ acao: 'esperar' });
    });

    it('★ moins de deux caractères : rien à chercher, rien à ouvrir', () => {
        expect(auto.aoEntrar(resposta('m', 'X'), 'm', 0)).toEqual({ acao: 'nada' });
        expect(auto.vaiPerguntar('m')).toBe(false);
        expect(auto.vaiPerguntar(' ma ')).toBe(true);
        expect(auto.vaiPerguntar('')).toBe(false);
        expect(auto.vaiPerguntar(null)).toBe(false);
    });

    it('★ un index de surlignage hors des bornes retombe sur le premier', () => {
        // Peut arriver quand une liste plus courte remplace une plus longue.
        const r = resposta('marie', 'MARIE DUPONT');
        expect(auto.aoEntrar(r, 'marie', 7)).toEqual({ acao: 'abrir', item: r.itens[0] });
        expect(auto.aoEntrar(r, 'marie', -1)).toEqual({ acao: 'abrir', item: r.itens[0] });
    });
});

describe('les flèches', () => {
    it('★★ bouclent dans les deux sens', () => {
        expect(auto.proximoDestaque(3, 2, +1)).toBe(0);
        expect(auto.proximoDestaque(3, 0, -1)).toBe(2);
        expect(auto.proximoDestaque(3, 1, +1)).toBe(2);
    });

    it('★ une liste vide ne déplace rien', () => {
        expect(auto.proximoDestaque(0, 0, +1)).toBe(0);
    });
});

describe('les bornes déclarées', () => {
    it('★★ on ne demande jamais plus de 8 suggestions', () => {
        // Le serveur en rendrait 20. Une liste plus longue que l'écran ne
        // s'utilise plus au clavier, et chaque ligne de trop est le nom d'un
        // mineur transmis sans qu'on l'ait demandé.
        expect(auto.LIMITE_SUGESTOES).toBe(8);
        expect(auto.LIMITE_SUGESTOES).toBeLessThan(20);
    });

    it('★ le minimum du client est celui du serveur', () => {
        // StudentSearchService.MINIMO_CARACTERES = 2
        expect(auto.MINIMO).toBe(2);
    });
});
