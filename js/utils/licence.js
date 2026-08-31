// =====================================================================
// LICENCE — qui voit le bandeau, et ce qu'il dit. Logique pure.
// =====================================================================
// ⚠️ CE MODULE NE DÉCIDE RIEN. C'est `LicenceGate`, côté serveur, qui refuse
// les routes de gestion ; ici on ne fait qu'AFFICHER un état déjà tranché.
// La vérification est côté backend uniquement, et pour une raison précise :
// un poste dont on remplacerait le .exe par une version antérieure
// contournerait n'importe quelle vérification embarquée dans le client — et
// sur ces postes, remplacer un exécutable est une manipulation ordinaire.
//
// ⚠️ IL N'Y A DONC PAS DE GRILLE MIROIR ICI. Aucune liste de routes fermées
// côté client : elle divergerait de `LicencePortee` au premier écran ajouté,
// et une tuile grisée à tort est indiscernable d'une panne. Les écrans de
// gestion restent NAVIGABLES ; quand la licence est expirée, le serveur
// répond 402 avec un message français, et `handleResponse` de js/api.js
// l'affiche tel quel. La leçon du projet — un message qui ment sur sa cause
// coûte plus cher que l'erreur — vaut ici aussi.
//
// Charge des deux façons (il n'y a pas de bundler) :
//   • navigateur → window.MagboLicence, via <script> dans index.html
//   • Vitest     → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboLicence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /** Les quatre états, tels que le backend les nomme (LicenceEtat.java). */
    const ETATS = {
        VALIDE: 'VALIDE',
        ALERTE: 'ALERTE',
        COURTOISIE: 'COURTOISIE',
        EXPIREE: 'EXPIREE'
    };

    /**
     * Les permissions dont l'écran SE FERME quand la licence expire.
     *
     * ⚠️ Miroir de LicencePortee côté backend, et volontairement PARTIEL :
     * `CANTINE_REMOVAL_WRITE`, `PARCOURS_READ` et `PPMS_READ` n'y sont pas,
     * parce que leurs routes restent ouvertes dans les quatre états.
     *
     * ⚠️ Cette liste ne sert plus qu'à l'état COURTOISIE — celui où rien n'est
     * encore fermé et où l'on ne prévient que ceux qui devront agir. En
     * EXPIREE, tout compte connecté voit le bandeau : voir `montreBandeau`.
     */
    const PERMISSIONS_DE_GESTION = [
        'CONFIG_WRITE',
        'MEAL_ENTITLEMENT_WRITE',
        'EXIT_PERMISSION_WRITE',
        'REGIME_WRITE',
        'MEAL_SLOT_WRITE',
        'CDI_EXCLUSION_WRITE',
        'ATTEMPTS_READ'
    ];

    function detient(auth, permission) {
        return !!auth && typeof auth.hasPermission === 'function'
            && auth.hasPermission(permission) === true;
    }

    function estAdmin(auth) {
        return !!auth && typeof auth.isAdmin === 'function' && auth.isAdmin() === true;
    }

    /**
     * ⚠️ « La direction », dans un système qui n'a que deux rôles.
     *
     * Le cahier des charges dit « ADMIN et direction ». Il n'existe pas de rôle
     * DIRECTION : les rôles sont ADMIN et OPERATOR. Le plus proche équivalent
     * porteur de sens est `CONFIG_WRITE` — la permission qui signifie
     * « administre le système », accordée à la main par Sam. C'est une
     * interprétation, et elle est écrite ici pour pouvoir être contestée.
     */
    function estDirection(auth) {
        return detient(auth, 'CONFIG_WRITE');
    }

    /**
     * Ce compte peut-il se heurter à un écran fermé ?
     *
     * C'est le critère d'affichage une fois la date passée : on prévient qui
     * peut être bloqué, pas tout le monde.
     */
    function toucheALaGestion(auth) {
        return PERMISSIONS_DE_GESTION.some(function (p) { return detient(auth, p); });
    }

    /**
     * LE BANDEAU DOIT-IL S'AFFICHER POUR CE COMPTE ?
     *
     * ⚠️ EN ÉTAT ALERTE, LES OPÉRATEURS NE LE VOIENT PAS. Le portail, la
     * cantine et le CDI ne peuvent rien y faire, et un bandeau permanent
     * pendant trente jours sur l'écran d'un poste devient du décor qu'on cesse
     * de lire — exactement ce qui est arrivé au gris de MISSING_DOOR_MAPPING.
     *
     * ⚠️ LE CERCLE S'ÉLARGIT EN DEUX TEMPS. En COURTOISIE (rien n'est encore
     * fermé), on ajoute ceux qui gèrent, pour qu'ils préparent la suite. En
     * EXPIREE, TOUT compte connecté — parce que des écrans se ferment
     * réellement, et qu'un écran vide sans explication se lit comme des données
     * effacées.
     */
    function montreBandeau(auth, licence) {
        if (!auth || !licence || !licence.etat) return false;
        if (licence.etat === ETATS.VALIDE) return false;
        if (estAdmin(auth) || estDirection(auth)) return true;

        // ALERTE : direction seulement — rien n'est fermé, et un bandeau
        // permanent pendant trente jours sur l'écran du portail devient du
        // décor qu'on cesse de lire.
        if (licence.etat === ETATS.ALERTE) return false;

        // COURTOISIE : ceux qui gèrent, pour qu'ils préparent la suite.
        if (licence.etat === ETATS.COURTOISIE) return toucheALaGestion(auth);

        // ⚠️ EXPIREE : TOUT COMPTE CONNECTÉ, et c'est le point de bascule de ce
        // module. La version précédente s'arrêtait aux permissions de gestion,
        // en supposant que les autres « ne perdent rien ». C'était faux, et le
        // panel de revue (Vie Scolaire, 31/08/2026) a nommé les deux cas :
        //
        //   · « Rapport Cantine » et « Rapport Infirmerie » ne sont PAS `hidden`
        //     dans constants.js — ce sont des tuiles du tableau de bord de tout
        //     opérateur ayant l'aire `cantine` ou `infirmerie` ;
        //   · ces écrans rendaient « aucune visite » sur un refus, c'est-à-dire
        //     « votre registre est vide ».
        //
        // L'infirmière qui lit ça en conclut que les données ont été effacées et
        // ouvre un cahier papier — perdant les passages que le système continue
        // justement d'enregistrer. Le bandeau est la seule chose qui l'empêche.
        // Un mois de bruit sur un poste est un coût ; celui-là ne l'est pas.
        return true;
    }

    /**
     * La gravité visuelle, pour la couleur du bandeau.
     * ⚠️ Aucune des trois n'est « rouge danger » : rien de ce que dit ce
     * bandeau ne met qui que ce soit en danger, et le ton doit rester neutre.
     */
    function ton(licence) {
        if (!licence) return null;
        if (licence.etat === ETATS.ALERTE) return 'info';
        if (licence.etat === ETATS.COURTOISIE) return 'attention';
        if (licence.etat === ETATS.EXPIREE) return 'suspendu';
        return null;
    }

    /**
     * Le motif, en clé i18n — pour dire à l'exploitant OÙ regarder.
     *
     * ⚠️ « Fichier absent » et « signature invalide » ferment exactement la
     * même chose, mais n'envoient pas au même endroit : neuf fois sur dix,
     * l'absence est un montage de volume oublié le jour du déploiement, et le
     * message doit envoyer vérifier le chemin plutôt que chercher à renouveler
     * une licence qui, elle, est peut-être parfaitement valide.
     */
    function cleMotif(licence) {
        const motifs = {
            ABSENTE: 'licence.motif.absente',
            ILLISIBLE: 'licence.motif.illisible',
            SIGNATURE_INVALIDE: 'licence.motif.signature',
            HORLOGE_RECULEE: 'licence.motif.horloge',
            PERIODE_DEPASSEE: 'licence.motif.periode'
        };
        return (licence && motifs[licence.motif]) || null;
    }

    /**
     * Jours restants, jamais négatif ni sentinelle.
     *
     * ⚠️ Le backend renvoie `null` quand il n'y a pas de licence du tout
     * (plutôt que la valeur sentinelle interne, qui finirait par s'afficher).
     * Ici on ne rend un nombre que s'il en existe un.
     */
    function joursRestants(licence) {
        if (!licence || typeof licence.joursRestants !== 'number') return null;
        return licence.joursRestants;
    }

    /** Jours écoulés depuis l'échéance, ou null. */
    function joursDepassement(licence) {
        const j = joursRestants(licence);
        return (j === null || j >= 0) ? null : -j;
    }

    /**
     * La gestion est-elle fermée ? Sert à marquer les tuiles des écrans
     * concernés — jamais à les masquer ni à les désactiver.
     */
    function gestionFermee(licence) {
        return !!licence && licence.gestionOuverte === false;
    }

    return {
        ETATS: ETATS,
        PERMISSIONS_DE_GESTION: PERMISSIONS_DE_GESTION,
        montreBandeau: montreBandeau,
        estDirection: estDirection,
        toucheALaGestion: toucheALaGestion,
        ton: ton,
        cleMotif: cleMotif,
        joursRestants: joursRestants,
        joursDepassement: joursDepassement,
        gestionFermee: gestionFermee
    };
});
