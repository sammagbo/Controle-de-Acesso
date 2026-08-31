// =====================================================================
// LICENCE — qui voit le bandeau (ADR-006)
// =====================================================================
// ⚠️ CE QUE CES TESTS NE PROUVENT PAS, et il faut le dire d'abord : ils ne
// prouvent RIEN sur ce qui se ferme. La fermeture est entièrement côté
// serveur — `LicencePortee` + `LicenceGate`, prouvés par `LicenceExpireeIT`.
// Ici on ne teste qu'une chose : à QUI le bandeau s'affiche. C'est de la
// présentation, et si ce module disparaissait, le système continuerait de se
// comporter exactement pareil — l'école perdrait l'explication, pas la règle.
//
// ⚠️ Et c'est justement pour ça que « à qui » mérite un test : un bandeau
// affiché à la mauvaise personne est soit du bruit sur un écran de poste, soit
// un silence pour quelqu'un qui va se heurter à un mur sans comprendre.

import { describe, it, expect } from 'vitest';
import L from '../js/utils/licence.js';

/** Un faux `window.auth` : admin, et/ou une liste de permissions. */
function auth({ admin = false, permissions = [] } = {}) {
    return {
        isAdmin: () => admin,
        hasPermission: (p) => permissions.includes(p),
        canAccessArea: () => true
    };
}

const VALIDE = { etat: 'VALIDE', motif: 'OK', gestionOuverte: true, joursRestants: 91 };
const ALERTE = { etat: 'ALERTE', motif: 'OK', gestionOuverte: true, joursRestants: 12 };
const COURTOISIE = { etat: 'COURTOISIE', motif: 'OK', gestionOuverte: true, joursRestants: -5 };
const EXPIREE = { etat: 'EXPIREE', motif: 'PERIODE_DEPASSEE', gestionOuverte: false, joursRestants: null };

const OPERATEUR_PORTAIL = auth({ permissions: [] });
const OPERATEUR_CANTINE = auth({ permissions: ['CANTINE_REMOVAL_WRITE'] });
const AED_PPMS = auth({ permissions: ['PPMS_READ', 'PARCOURS_READ'] });
const VIE_SCOLAIRE = auth({ permissions: ['EXIT_PERMISSION_WRITE', 'REGIME_WRITE'] });
const DIRECTION = auth({ permissions: ['CONFIG_WRITE'] });
const ADMIN = auth({ admin: true });

describe('licence — état VALIDE : personne ne voit rien', () => {

    it('★ aucun bandeau, pour aucun profil', () => {
        for (const a of [OPERATEUR_PORTAIL, OPERATEUR_CANTINE, AED_PPMS,
                         VIE_SCOLAIRE, DIRECTION, ADMIN]) {
            expect(L.montreBandeau(a, VALIDE)).toBe(false);
        }
    });

    it('le ton est nul : rien à peindre', () => {
        expect(L.ton(VALIDE)).toBe(null);
    });
});

describe('licence — état ALERTE : ADMIN et direction SEULEMENT', () => {

    /**
     * ⚠️ LE TEST QUI PROTÈGE LES POSTES. Trente jours de bandeau permanent sur
     * l'écran du portail, pour une chose sur laquelle l'opérateur ne peut rien,
     * deviendraient du décor qu'on cesse de lire — exactement ce qui est arrivé
     * au gris de MISSING_DOOR_MAPPING.
     */
    it('★★ les opérateurs (portail, cantine, CDI) ne le voient PAS', () => {
        expect(L.montreBandeau(OPERATEUR_PORTAIL, ALERTE)).toBe(false);
        expect(L.montreBandeau(OPERATEUR_CANTINE, ALERTE)).toBe(false);
        expect(L.montreBandeau(AED_PPMS, ALERTE)).toBe(false);
    });

    it('★★ l’ADMIN et la direction le voient', () => {
        expect(L.montreBandeau(ADMIN, ALERTE)).toBe(true);
        expect(L.montreBandeau(DIRECTION, ALERTE)).toBe(true);
    });

    /**
     * ⚠️ Un compte qui ne détient qu'une permission de gestion, sans
     * CONFIG_WRITE, n'est pas « la direction » : en état ALERTE rien n'est
     * fermé, donc il n'a rien à savoir encore.
     */
    it('la Vie Scolaire ne le voit pas encore en ALERTE', () => {
        expect(L.montreBandeau(VIE_SCOLAIRE, ALERTE)).toBe(false);
    });
});

describe('licence — après la date : le cercle s’élargit à qui peut être bloqué', () => {

    /**
     * ⚠️ C'EST LE POINT DE BASCULE DU MODULE. Une fois la date passée, un
     * détenteur de permission de gestion peut se heurter à un écran fermé.
     * Lui cacher le bandeau reviendrait à le laisser conclure à une panne — et
     * à chercher un problème réseau qui n'existe pas.
     */
    it('★★ la Vie Scolaire voit le bandeau dès la COURTOISIE', () => {
        expect(L.montreBandeau(VIE_SCOLAIRE, COURTOISIE)).toBe(true);
        expect(L.montreBandeau(VIE_SCOLAIRE, EXPIREE)).toBe(true);
    });

    /**
     * ⚠️ EN COURTOISIE, RIEN N'EST FERMÉ — donc l'opérateur de poste n'a encore
     * rien à savoir. C'est la dernière étape où le silence est justifié.
     */
    it('★ en COURTOISIE, l’opérateur de poste ne le voit pas encore', () => {
        expect(L.montreBandeau(OPERATEUR_PORTAIL, COURTOISIE)).toBe(false);
        expect(L.montreBandeau(OPERATEUR_CANTINE, COURTOISIE)).toBe(false);
        expect(L.montreBandeau(AED_PPMS, COURTOISIE)).toBe(false);
    });

    /**
     * ⚠️★★ EN EXPIREE, TOUT LE MONDE LE VOIT — et c'est une correction du panel
     * de revue (Vie Scolaire, 31/08/2026), pas le dessin d'origine.
     *
     * La version précédente s'arrêtait aux permissions de gestion, en supposant
     * que les opérateurs de poste « ne perdent rien ». C'était faux : « Rapport
     * Cantine » et « Rapport Infirmerie » ne sont PAS `hidden` dans
     * constants.js — ce sont des tuiles du tableau de bord de tout opérateur
     * ayant l'aire correspondante — et ces écrans affichaient « aucune visite »
     * sur un refus, c'est-à-dire « votre registre est vide ».
     *
     * L'infirmière qui lit ça en conclut que les données ont été effacées et
     * ouvre un cahier papier, perdant les passages que le système continue
     * justement d'enregistrer. Le bandeau est la seule chose qui l'en empêche.
     */
    it('★★ en EXPIREE, TOUT compte connecté voit le bandeau', () => {
        expect(L.montreBandeau(OPERATEUR_PORTAIL, EXPIREE)).toBe(true);
        expect(L.montreBandeau(OPERATEUR_CANTINE, EXPIREE)).toBe(true);
        expect(L.montreBandeau(AED_PPMS, EXPIREE)).toBe(true);
        expect(L.montreBandeau(VIE_SCOLAIRE, EXPIREE)).toBe(true);
        expect(L.montreBandeau(DIRECTION, EXPIREE)).toBe(true);
        expect(L.montreBandeau(ADMIN, EXPIREE)).toBe(true);
    });

    it('l’ADMIN et la direction le voient dans les trois états non-VALIDE', () => {
        for (const etat of [ALERTE, COURTOISIE, EXPIREE]) {
            expect(L.montreBandeau(ADMIN, etat)).toBe(true);
            expect(L.montreBandeau(DIRECTION, etat)).toBe(true);
        }
    });
});

describe('licence — le miroir des permissions reste PARTIEL, et exprès', () => {

    /**
     * ⚠️ Ces trois-là gouvernent des routes qui restent OUVERTES sous licence
     * expirée (voir LicencePortee). Les ajouter à PERMISSIONS_DE_GESTION
     * ferait apparaître un bandeau chez des gens que rien ne bloque.
     */
    it('★ CANTINE_REMOVAL_WRITE, PPMS_READ et PARCOURS_READ n’y sont pas (COURTOISIE)', () => {
        expect(L.PERMISSIONS_DE_GESTION).not.toContain('CANTINE_REMOVAL_WRITE');
        expect(L.PERMISSIONS_DE_GESTION).not.toContain('PPMS_READ');
        expect(L.PERMISSIONS_DE_GESTION).not.toContain('PARCOURS_READ');
    });

    it('les permissions dont l’écran se ferme y sont toutes', () => {
        for (const p of ['CONFIG_WRITE', 'MEAL_ENTITLEMENT_WRITE', 'EXIT_PERMISSION_WRITE',
                         'REGIME_WRITE', 'MEAL_SLOT_WRITE', 'CDI_EXCLUSION_WRITE']) {
            expect(L.PERMISSIONS_DE_GESTION).toContain(p);
        }
    });
});

describe('licence — robustesse : rien ne casse sans données', () => {

    /**
     * ⚠️ `getLicence` rend `null` quand le serveur ne répond pas ou qu'il est
     * d'une version antérieure. Ce cas arrive sur un vrai poste, un vrai jour :
     * le bandeau doit simplement ne pas s'afficher.
     */
    it('★ licence null ou vide : pas de bandeau, pas d’exception', () => {
        expect(L.montreBandeau(ADMIN, null)).toBe(false);
        expect(L.montreBandeau(ADMIN, {})).toBe(false);
        expect(L.montreBandeau(ADMIN, undefined)).toBe(false);
    });

    it('auth absent : pas de bandeau, pas d’exception', () => {
        expect(L.montreBandeau(null, EXPIREE)).toBe(false);
        expect(L.montreBandeau(undefined, EXPIREE)).toBe(false);
    });

    /**
     * ⚠️ Un `auth` PRÉSENT mais incomplet (chargement en cours, bundle partiel)
     * voit le bandeau en EXPIREE. C'est le bon côté sur lequel se tromper :
     * afficher une explication à quelqu'un qui n'en avait pas besoin coûte une
     * ligne de texte ; la cacher à quelqu'un qui se heurte à un écran fermé lui
     * fait conclure à une panne.
     */
    it('★ auth incomplet en EXPIREE : le bandeau s’affiche quand meme', () => {
        expect(L.montreBandeau({}, EXPIREE)).toBe(true);
        expect(L.montreBandeau({}, ALERTE)).toBe(false);
        expect(L.montreBandeau({}, VALIDE)).toBe(false);
    });

    it('un état inconnu du backend ne peint rien', () => {
        expect(L.ton({ etat: 'QUELQUE_CHOSE_DE_NOUVEAU' })).toBe(null);
    });
});

describe('licence — le décompte et le motif', () => {

    it('les jours restants passent tels quels', () => {
        expect(L.joursRestants(ALERTE)).toBe(12);
        expect(L.joursDepassement(ALERTE)).toBe(null);
    });

    it('après la date, le dépassement est un nombre POSITIF', () => {
        expect(L.joursDepassement(COURTOISIE)).toBe(5);
    });

    /**
     * ⚠️ Sans licence du tout, le backend renvoie `null` plutôt que sa valeur
     * sentinelle interne (Long.MIN_VALUE). Un nombre sentinelle qui arrive au
     * front finit toujours par s'afficher — « expirée depuis
     * 9223372036854775807 jours ».
     */
    it('★ pas de licence : ni décompte, ni dépassement', () => {
        expect(L.joursRestants(EXPIREE)).toBe(null);
        expect(L.joursDepassement(EXPIREE)).toBe(null);
    });

    it('★ chaque motif a une clé de message distincte', () => {
        const cles = ['ABSENTE', 'ILLISIBLE', 'SIGNATURE_INVALIDE',
                      'HORLOGE_RECULEE', 'PERIODE_DEPASSEE']
            .map(m => L.cleMotif({ motif: m }));
        expect(cles.every(Boolean)).toBe(true);
        expect(new Set(cles).size).toBe(cles.length);
    });

    it('un motif inconnu ne fabrique pas de clé fantôme', () => {
        expect(L.cleMotif({ motif: 'MOTIF_QUI_NEXISTE_PAS' })).toBe(null);
        expect(L.cleMotif(null)).toBe(null);
    });
});

describe('licence — gestionFermee ne sert qu’à MARQUER, jamais à masquer', () => {

    it('reflète exactement ce que dit le serveur', () => {
        expect(L.gestionFermee(EXPIREE)).toBe(true);
        expect(L.gestionFermee(COURTOISIE)).toBe(false);
        expect(L.gestionFermee(VALIDE)).toBe(false);
        expect(L.gestionFermee(null)).toBe(false);
    });

    /**
     * ⚠️ IL N'Y A PAS DE GRILLE MIROIR CÔTÉ CLIENT, et ce test le fige.
     * Une liste de routes fermées ici divergerait de `LicencePortee` au premier
     * écran ajouté, et une tuile grisée à tort est indiscernable d'une panne.
     * Le serveur répond 402 avec un message français ; c'est lui qui explique.
     */
    it('★★ le module n’expose AUCUNE liste de routes', () => {
        const cles = Object.keys(L);
        expect(cles.some(k => /route|endpoint|url|chemin|path/i.test(k)))
            .toBe(false);
    });
});
