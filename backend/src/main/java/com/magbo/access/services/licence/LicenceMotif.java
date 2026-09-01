package com.magbo.access.services.licence;

/**
 * POURQUOI la licence est dans l'état où elle est.
 *
 * ⚠️ LE MOTIF NE CHANGE JAMAIS CE QUI SE FERME — c'est {@link LicenceEtat} qui
 * décide, et lui seul. Le motif sert à écrire le bon message à l'écran et la
 * bonne ligne dans le journal. Un fichier absent, un fichier falsifié et une
 * horloge reculée produisent tous les trois {@link LicenceEtat#EXPIREE} : si
 * l'un d'eux était plus permissif, ce serait la porte à emprunter.
 *
 * ⚠️ ET SURTOUT PAS L'INVERSE : jamais de motif qui OUVRE plus que l'état. La
 * tentation, le jour d'un déploiement raté, sera d'ajouter « ABSENTE = on
 * laisse ouvert, c'est sûrement une erreur de montage ». Ce jour-là, supprimer
 * le fichier deviendra la licence perpétuelle.
 */
public enum LicenceMotif {

    /** Licence lue, signature vérifiée, dans sa période de validité. */
    OK,

    /**
     * Aucun fichier au chemin configuré.
     *
     * ⚠️ Se comporte comme une expiration, mais dit autre chose à l'écran :
     * neuf fois sur dix c'est un montage de volume oublié le jour du déploiement,
     * et le message doit envoyer l'exploitant vérifier le chemin plutôt que
     * chercher à renouveler une licence qui, elle, est peut-être valide.
     */
    ABSENTE,

    /** Fichier présent mais illisible : format cassé, champ manquant, date absurde. */
    ILLISIBLE,

    /**
     * La signature ne correspond pas — champ modifié, ou fichier signé avec une
     * autre clé privée. C'est exactement le cas que la cryptographie existe pour
     * attraper : changer « expire_le » à la main invalide tout le reste.
     */
    SIGNATURE_INVALIDE,

    /**
     * L'horloge système a reculé de façon significative par rapport à la date la
     * plus récente jamais observée. Cinquième piège d'horloge du projet — voir
     * {@link LicenceHorloge} et l'ADR-006.
     */
    HORLOGE_RECULEE,

    /** Signature valide, période dépassée depuis plus de 30 jours. Le cas nominal. */
    PERIODE_DEPASSEE
}
