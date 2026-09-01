package com.magbo.access.services.licence;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * LE VERDICT — l'état de la licence à une date donnée, et pourquoi.
 *
 * Immuable et calculable sans rien : c'est ici que vit toute l'arithmétique des
 * quatre états, et elle se teste en fixant une date, sans base ni horloge
 * système. {@link LicenceService} ne fait qu'appeler les fabriques ci-dessous.
 *
 * @param etat         ce qui se ferme (et rien d'autre ne le décide)
 * @param motif        pourquoi — pour le message et le journal, jamais pour la décision
 * @param etablissement nom porté par la licence, {@code null} si on n'a pas pu la lire
 * @param licenceId    identifiant de la licence, {@code null} si illisible
 * @param emisLe       date d'émission, {@code null} si illisible
 * @param expireLe     dernier jour d'utilisation INCLUS, {@code null} si illisible
 * @param joursRestants jours jusqu'à l'échéance : 0 le dernier jour, négatif après
 * @param detail       précision technique pour le journal (jamais affichée telle quelle)
 */
public record LicenceVerdict(LicenceEtat etat,
                             LicenceMotif motif,
                             String etablissement,
                             String licenceId,
                             LocalDate emisLe,
                             LocalDate expireLe,
                             long joursRestants,
                             String detail) {

    /**
     * ⚠️ LES DEUX SEULS NOMBRES DU MÉCANISME, et ils ne sont pas symétriques
     * par hasard.
     *
     * PREAVIS : les 30 jours AVANT, pendant lesquels le bandeau prévient sans
     * rien fermer. Un mois, c'est le temps qu'il faut pour qu'une décision
     * commerciale remonte une hiérarchie scolaire et redescende.
     *
     * COURTOISIE : les 30 jours APRÈS, pendant lesquels RIEN ne se ferme
     * encore. Il existe parce que Sam peut être injoignable — vacances,
     * changement de numéro, négociation en cours — et que personne dans cette
     * école ne doit se retrouver bloqué pour autant. C'est la moitié du
     * dispositif qui protège l'utilisateur plutôt que l'éditeur.
     */
    public static final int JOURS_PREAVIS = 30;
    public static final int JOURS_COURTOISIE = 30;

    /**
     * Le verdict d'une licence dont la signature a été vérifiée.
     *
     * @param aujourdhui la date à laquelle on juge — passée explicitement pour
     *                   que les tests n'aient jamais à dépendre du jour où ils
     *                   tournent. Un test qui change de résultat selon l'heure
     *                   où on le lance ne prouve rien (leçon du régime de sortie).
     */
    public static LicenceVerdict signee(LicenceFichier.Contenu c, LocalDate aujourdhui) {
        long restants = ChronoUnit.DAYS.between(aujourdhui, c.expireLe());
        LicenceEtat etat;
        LicenceMotif motif = LicenceMotif.OK;
        if (restants > JOURS_PREAVIS) {
            etat = LicenceEtat.VALIDE;
        } else if (restants >= 0) {
            // Le jour de l'échéance compte comme utilisable : « valable jusqu'au
            // 30/11 » veut dire que le 30/11 on travaille normalement.
            etat = LicenceEtat.ALERTE;
        } else if (restants >= -JOURS_COURTOISIE) {
            etat = LicenceEtat.COURTOISIE;
        } else {
            etat = LicenceEtat.EXPIREE;
            motif = LicenceMotif.PERIODE_DEPASSEE;
        }
        return new LicenceVerdict(etat, motif, c.etablissement(), c.licenceId(),
                c.emisLe(), c.expireLe(), restants, null);
    }

    /**
     * Le verdict quand il n'y a pas de licence exploitable : absente, illisible,
     * signature invalide, horloge reculée.
     *
     * ⚠️ TOUS CES CAS DONNENT {@link LicenceEtat#EXPIREE}, sans exception et
     * sans état intermédiaire. Aucune période de grâce ici : la courtoisie
     * s'applique à une licence VRAIE qui vient d'échoir, pas à l'absence de
     * licence. Si « pas de fichier » ouvrait 30 jours, supprimer le fichier tous
     * les 29 jours serait la licence perpétuelle.
     *
     * ⚠️ Et jamais l'inverse non plus : pas de motif qui ouvrirait PLUS que
     * l'expiration. Falsifier ne doit rien rapporter de plus que ne rien mettre.
     */
    public static LicenceVerdict sansLicence(LicenceMotif motif, String detail) {
        return new LicenceVerdict(LicenceEtat.EXPIREE, motif, null, null, null, null,
                Long.MIN_VALUE, detail);
    }

    /** Raccourci lisible : la gestion est-elle ouverte ? */
    public boolean gestionOuverte() {
        return etat.gestionOuverte();
    }

    /** Nombre de jours écoulés depuis l'échéance (0 si pas encore échue). */
    public long joursDepuisEcheance() {
        return joursRestants < 0 && joursRestants != Long.MIN_VALUE ? -joursRestants : 0;
    }
}
