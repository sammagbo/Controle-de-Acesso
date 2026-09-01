package com.magbo.access.services.licence;

/**
 * LES QUATRE ÉTATS DE LA LICENCE — et ce que chacun ferme.
 *
 * ⚠️ LE PRINCIPE QUI GOUVERNE TOUT CE PAQUET, ET QUI N'EST PAS NÉGOCIABLE :
 * une licence expirée AVERTIT, elle ne supprime rien et ne met personne en
 * danger. L'enregistrement des passages et la liste NOMINATIVE du PPMS
 * fonctionnent dans les QUATRE états, licence absente comprise. Dans une
 * évacuation, c'est le nom qui permet de retrouver un enfant : aucun désaccord
 * commercial ne justifie de le retirer. Ce qui se ferme, ce sont les écrans de
 * GESTION — voir {@link LicencePortee}, qui en tient l'inventaire.
 *
 * ⚠️ POURQUOI QUATRE ET PAS DEUX. Un interrupteur « valide / expirée » place
 * toute la conséquence sur un seul jour de calendrier, et ce jour-là Sam peut
 * être injoignable. Les deux états du milieu existent pour que personne ne se
 * retrouve bloqué par un silence : ALERTE prévient pendant un mois avant, et
 * COURTOISIE laisse tout ouvert pendant un mois APRÈS. Le système ne se ferme
 * qu'au bout de soixante jours de préavis visible.
 *
 * Les motifs de fermeture (absence, signature invalide, recul d'horloge) ne
 * sont PAS des états : ils produisent l'état {@link #EXPIREE} et se racontent
 * dans {@link LicenceMotif}. Un fichier absent et un fichier falsifié doivent
 * avoir exactement le même effet — sinon falsifier deviendrait plus rentable
 * que ne rien mettre.
 */
public enum LicenceEtat {

    /** Plus de 30 jours avant l'échéance. Rien ne change, aucun bandeau. */
    VALIDE,

    /**
     * Les 30 derniers jours. Bandeau pour ADMIN et direction, comptant les
     * jours restants. Les opérateurs (portail, cantine, CDI) ne le voient PAS :
     * ils ne peuvent rien y faire, et un bandeau permanent pendant un mois sur
     * l'écran du portail devient du décor qu'on cesse de lire — exactement ce
     * qui est arrivé au gris de MISSING_DOOR_MAPPING.
     */
    ALERTE,

    /**
     * Les 30 jours APRÈS l'échéance. Bandeau plus visible, mais RIEN NE SE
     * FERME. C'est l'état qui protège l'école d'un désaccord commercial en
     * cours ou d'un émetteur injoignable.
     */
    COURTOISIE,

    /**
     * Au-delà. Les écrans de GESTION se ferment ; tout le reste continue —
     * webhook, écrans de poste, PPMS nominatif, connexion des opérateurs.
     */
    EXPIREE;

    /**
     * La gestion est-elle encore ouverte ?
     *
     * ⚠️ C'est l'unique prédicat qui décide de fermer quoi que ce soit. Il est
     * ici, et pas dans l'intercepteur, pour qu'un test puisse l'interroger sans
     * monter de contexte HTTP — et pour qu'il n'existe qu'à un seul endroit.
     */
    public boolean gestionOuverte() {
        return this != EXPIREE;
    }

    /** Faut-il afficher un bandeau ? (VALIDE est le seul état silencieux.) */
    public boolean bandeau() {
        return this != VALIDE;
    }
}
