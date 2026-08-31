package com.magbo.access.services.licence;

import org.springframework.util.AntPathMatcher;

import java.util.List;
import java.util.Set;

/**
 * L'INVENTAIRE : quelles routes se ferment quand la licence est expirée, et
 * lesquelles continuent quoi qu'il arrive.
 *
 * <h3>⚠️ Ce qui continue, licence expirée ou absente</h3>
 * <ul>
 *   <li><b>L'enregistrement des passages</b> venant des terminaux (le webhook).</li>
 *   <li><b>Les écrans des postes</b> — portail, CDI, cantine, infirmerie.</li>
 *   <li><b>Le PPMS avec la liste NOMINATIVE</b> et son impression.</li>
 *   <li><b>La connexion des opérateurs.</b></li>
 * </ul>
 * Dans une évacuation, c'est le nom qui permet de retrouver un enfant. Aucun
 * désaccord commercial ne justifie de le retirer, et c'est pour cela que
 * {@code /api/ppms/**} figure explicitement dans la liste OUVERT au lieu de
 * bénéficier d'un défaut : un défaut se change par distraction, une ligne
 * nommée avec sa raison se change par décision.
 *
 * <h3>⚠️ Pourquoi une liste déclarée et pas une heuristique</h3>
 * On aurait pu fermer « tout {@code /api/admin/**} ». Ça aurait cassé quatre
 * choses opérationnelles qui vivent sous ce préfixe par accident d'histoire :
 * le verdict de régime affiché au portail ({@code /api/admin/regimes/gate/**},
 * lu toutes les 3 s par {@code SectorView}), le retrait d'une ligne du Moniteur
 * Cantine, l'état du CDI lu par la banque de prêt, et le parcours du jour. Une
 * heuristique qui se trompe ici éteint un écran de poste un mardi midi.
 *
 * <h3>⚠️ L'ordre des règles EST la sémantique — première correspondance gagne</h3>
 * Les exceptions opérationnelles sont déclarées AVANT la règle large qui les
 * contient. Déplacer une ligne change le comportement sans changer un seul
 * caractère de logique : c'est la raison du test
 * {@code LicencePorteeGuardTest}, qui vérifie que chaque endpoint réellement
 * présent dans les contrôleurs tombe sur une règle NOMMÉE.
 *
 * <h3>⚠️ Par défaut, une route inconnue reste OUVERTE</h3>
 * Le choix inverse — tout fermer sauf liste blanche — donnerait qu'un endpoint
 * opérationnel ajouté plus tard serait fermé par une licence expirée, c'est-à-dire
 * qu'un écran de poste s'éteindrait. Le principe non négociable tranche : dans le
 * doute, ça continue de fonctionner. Le prix, c'est qu'un écran de gestion ajouté
 * plus tard échapperait à la licence — et c'est précisément ce que le test
 * d'inventaire empêche de rester silencieux : il devient rouge tant que quelqu'un
 * n'a pas écrit dans quelle case le nouvel endpoint tombe.
 *
 * <h3>⚠️ Ce n'est pas une frontière de sécurité</h3>
 * {@code /api/access/refectory/meals} (le rapport de facturation) est fermé
 * alors que {@code /api/access/logs/refectory} (l'écran du poste) est ouvert et
 * rend des données voisines : qui a mangé aujourd'hui se déduit des deux. C'est
 * assumé — ceci est une licence, pas un contrôle d'accès. Les vraies frontières
 * restent {@code @PreAuthorize} et {@code AreaSecurity}, qui ne bougent pas d'un
 * iota avec la licence.
 *
 * <h3>⚠️ Une règle FERMÉE se vérifie contre l'ÉCRAN qui l'appelle</h3>
 * Le garde d'inventaire prouve que chaque endpoint est classé ; il ne peut pas
 * savoir quel écran appelle quoi. C'est ainsi que {@code /api/access/logs/refectory}
 * — la route que le Moniteur Cantine relit toutes les 3 s pendant le service —
 * s'est retrouvée classée « rapport », avec un commentaire affirmant le
 * contraire. Avant de fermer une route, ouvrir le composant qui la consomme.
 */
public final class LicencePortee {

    /** Ce que fait une règle. */
    public enum Effet {
        /** Se ferme quand la licence est expirée : écran de GESTION. */
        FERME,
        /** Continue toujours : opération, sécurité des personnes, ou connexion. */
        OUVERT
    }

    /**
     * Une règle nommée.
     *
     * @param effet   fermer ou laisser passer
     * @param verbes  méthodes HTTP concernées ; vide = toutes
     * @param motif   patron Ant sur le chemin de la requête
     * @param raison  POURQUOI — lue par le test d'inventaire et par le prochain lecteur
     */
    public record Regle(Effet effet, Set<String> verbes, String motif, String raison) {

        boolean correspond(String verbe, String chemin) {
            if (!verbes.isEmpty() && !verbes.contains(verbe)) return false;
            return MATCHER.match(motif, chemin);
        }
    }

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    private static final Set<String> TOUS = Set.of();
    private static final Set<String> LECTURE = Set.of("GET", "HEAD");
    private static final Set<String> ECRITURE = Set.of("POST", "PUT", "DELETE", "PATCH");

    private static Regle ouvert(Set<String> verbes, String motif, String raison) {
        return new Regle(Effet.OUVERT, verbes, motif, raison);
    }

    private static Regle ferme(Set<String> verbes, String motif, String raison) {
        return new Regle(Effet.FERME, verbes, motif, raison);
    }

    /**
     * LES RÈGLES, DANS L'ORDRE. Première correspondance gagne.
     *
     * ⚠️ Ne jamais réordonner sans relire les raisons : une exception
     * opérationnelle placée après la règle large qui la contient devient du
     * code mort, et l'écran qu'elle protégeait s'éteint en silence.
     */
    public static final List<Regle> REGLES = List.of(

            // ═══════════════════════════════════════════════════════════
            // 1. CE QUI NE SE FERME JAMAIS — le cœur du principe
            // ═══════════════════════════════════════════════════════════

            ouvert(TOUS, "/api/hikvision/**",
                    "L'ENREGISTREMENT DES PASSAGES. Ce sont les terminaux qui appellent, pas une "
                            + "personne : fermer ici ferait perdre des passages d'enfants pour de bon "
                            + "(le terminal reessaie un temps, puis abandonne). Rien de ce qui touche "
                            + "a la licence ne doit pouvoir creer un trou dans le registre."),

            ouvert(TOUS, "/api/ppms/**",
                    "LE PPMS ET SA LISTE NOMINATIVE. Dans une evacuation, c'est le nom qui permet "
                            + "de retrouver un enfant ; un comptage anonyme ne sert a chercher personne. "
                            + "Aucun desaccord commercial ne justifie de le retirer. Cette ligne est "
                            + "la raison d'etre de la degradation par couches."),

            ouvert(TOUS, "/api/auth/**",
                    "LA CONNEXION DES OPERATEURS. Une licence qui empeche de se connecter n'avertit "
                            + "pas : elle eteint l'etablissement. Le login reste ouvert dans les quatre "
                            + "etats."),

            ouvert(TOUS, "/api/health",
                    "Sonde de sante, lue par le deploiement. Elle porte aussi l'etat de la licence : "
                            + "c'est par elle qu'on verifie un deploiement sans ouvrir l'application."),

            ouvert(TOUS, "/api/licence",
                    "L'ETAT DE LA LICENCE lui-meme, lu par le bandeau. Le fermer rendrait le "
                            + "bandeau muet exactement quand il a quelque chose a dire."),

            ouvert(TOUS, "/api/admin/licence/**",
                    "LA RELECTURE DU FICHIER (ADMIN). C'est le geste du renouvellement a distance : "
                            + "quelqu'un depose la nouvelle cle sur la VM, un ADMIN appelle cette route, "
                            + "et l'ecole repart. La fermer sous licence expiree rendrait le "
                            + "renouvellement impossible SANS redemarrage — le systeme se verrouillerait "
                            + "lui-meme hors de sa propre reparation. Ce n'est pas un contournement : "
                            + "la relecture repasse par la signature."),

            ouvert(TOUS, "/error",
                    "Renvoi interne de Spring. Le fermer transformerait toute erreur applicative en "
                            + "402 trompeur — la classe de defaut la plus chere du projet (un message "
                            + "qui ment sur sa cause)."),

            ouvert(TOUS, "/api/admin/password-reset-requests/**",
                    "Le REGISTRE des demandes de mot de passe oublie : la demande (publique) et sa "
                            + "consultation par un administrateur restent possibles. ⚠️ ET CETTE RAISON A "
                            + "ETE CORRIGEE : elle affirmait que « le deblocage reste ouvert », ce qui "
                            + "etait FAUX. `tratar` ne fait que marquer la demande HANDLED ; la "
                            + "redefinition du mot de passe passe par PUT /api/system-users/{id}, qui est "
                            + "FERME. Un operateur qui oublie son mot de passe sous licence expiree ne "
                            + "peut donc PAS etre debloque par cette route. C'est une LIMITE CONNUE, "
                            + "ecrite dans l'ADR-006 et dans la procedure ; la parade operationnelle est "
                            + "que le compte ADMIN, lui, se connecte toujours. Apanhado par le panel de "
                            + "revue (Vie Scolaire) le 31/08/2026."),

            // ═══════════════════════════════════════════════════════════
            // 2. LES ÉCRANS DE POSTE — exceptions déclarées AVANT les
            //    règles larges de gestion qui les contiendraient
            // ═══════════════════════════════════════════════════════════

            ouvert(LECTURE, "/api/admin/regimes/gate/**",
                    "Le verdict de regime affiche au PORTAIL, relu toutes les 3 s par SectorView. "
                            + "Sous /api/admin/** par accident d'histoire, mais c'est un ecran de poste. "
                            + "La GESTION des regimes, elle, se ferme."),

            ouvert(TOUS, "/api/admin/cantine/removals/**",
                    "Le retrait d'une ligne du Moniteur Cantine : geste d'operateur pendant le "
                            + "service, pas de la gestion."),

            ouvert(LECTURE, "/api/admin/cdi/etat",
                    "Lu par la banque de pret du CDI (BibliotecaView) pour connaitre la capacite. "
                            + "L'ECRITURE de cet etat est de la configuration et se ferme."),

            ouvert(Set.of("POST"), "/api/admin/cdi/alertes",
                    "L'alerte ecrite quand un eleve exclu badge au CDI : c'est l'operateur qui "
                            + "travaille. L'HISTORIQUE (GET) est un rapport et se ferme."),

            ouvert(LECTURE, "/api/access/logs/refectory",
                    "⚠️ L'ECRAN DU MONITEUR CANTINE, et rien d'autre. C'est CETTE route que "
                            + "CantineMonitor.js relit toutes les 3 s pendant le service (ligne 418, "
                            + "fetchRefectoryLogs) — pas /api/access/logs/{pointId}, comme on l'a "
                            + "d'abord ecrit ici. La fermer affichait, un mardi a 11h50 avec 250 "
                            + "eleves qui defilent, une SALLE VIDE avec « mis a jour a 11:50 » qui se "
                            + "rafraichit : la couche HTTP rend [] sur un refus, donc l'ecran ment "
                            + "sans rien dire. Apanhado par le panel de revue (Vie Scolaire) le "
                            + "31/08/2026. Le RAPPORT de facturation (/api/access/refectory/meals) "
                            + "reste ferme, lui."),

            ouvert(LECTURE, "/api/access/attempts/refectory",
                    "Le fil des tentatives refusees du Moniteur Cantine — la piece par laquelle "
                            + "l'operateur voit qui vient d'etre refuse et pourquoi (ADR-004). Sans elle, "
                            + "le blocage operationnel assiste n'a plus d'yeux."),

            ouvert(LECTURE, "/api/access/attempts/gate",
                    "Le meme fil, cote portail. Ouvert par symetrie avec la cantine : c'est un fil "
                            + "operationnel de 12 h, pas un rapport."),

            ouvert(LECTURE, "/api/presence/auto-close/preview",
                    "« Encore a l'interieur » — qui sera cloture automatiquement ce soir. Ecran de "
                            + "poste, affiche avant la cloture pour aller verifier."),

            ouvert(TOUS, "/api/admin/parcours/**",
                    "« Ou est cette personne aujourd'hui ». Recherche operationnelle, cousine du "
                            + "PPMS : c'est ce qu'on ouvre quand on cherche quelqu'un, pas quand on "
                            + "administre."),

            ouvert(TOUS, "/api/totvs/**",
                    "Lien vers la fiche d'une personne dans le systeme de l'etablissement. Aucune "
                            + "donnee produite ici, et c'est un geste de consultation."),

            ouvert(Set.of("POST"), "/api/admin/verify",
                    "Le PIN du Panneau Administratif. Le fermer masquerait la vraie raison : "
                            + "l'operateur croirait son PIN faux alors que c'est la licence. Les ecrans "
                            + "du panneau se ferment un a un, avec leur message."),

            // ═══════════════════════════════════════════════════════════
            // 3. LES PERSONNES — lecture ouverte, écriture fermée
            // ═══════════════════════════════════════════════════════════

            ferme(TOUS, "/api/users/staff/**",
                    "GESTION DU PERSONNEL et ses importations (HikCentral, lot, reclassement). "
                            + "Declaree AVANT la lecture ouverte de /api/users/** : c'est un ecran "
                            + "d'administration entier, lecture comprise."),

            ouvert(LECTURE, "/api/users/**",
                    "LE userCache DE TOUTES LES VITRES. Chaque ecran de poste resout un nom et une "
                            + "photo par ici ; fermer cette lecture eteindrait le portail, le CDI et la "
                            + "cantine d'un coup. Inclut /api/users/{id}/photo."),

            ferme(ECRITURE, "/api/users/**",
                    "CREATION, MODIFICATION, SUPPRESSION et import en lot de personnes : de la "
                            + "gestion. La lecture juste au-dessus reste ouverte."),

            ferme(TOUS, "/api/system-users/**",
                    "GESTION DES OPERATEURS (comptes, secteurs, permissions), nommement fermee par le "
                            + "cahier des charges. ⚠️ CONSEQUENCE ASSUMEE ET ECRITE : la redefinition "
                            + "d'un mot de passe passe par ici, donc un operateur qui oublie le sien "
                            + "sous licence expiree ne peut plus etre debloque. Le compte ADMIN, lui, se "
                            + "connecte toujours (/api/auth/** est ouvert). Ouvrir une route etroite "
                            + "POST /api/system-users/{id}/password serait la correction propre — c'est "
                            + "une decision du Sam, pas un effet de bord a decider ici."),

            // ═══════════════════════════════════════════════════════════
            // 4. LES ÉCRANS DE GESTION nommés par la spécification
            // ═══════════════════════════════════════════════════════════

            ferme(TOUS, "/api/admin/settings/**",
                    "CONFIGURATION DU SYSTEME (system_settings, V024)."),

            ferme(TOUS, "/api/admin/class-schedules/**",
                    "CONFIGURATION : la grille des classes (quelle classe mange quel jour). "
                            + "La DECISION de la cantine continue de la lire en interne — c'est "
                            + "l'ecran qui la modifie qui se ferme, pas la regle qu'elle porte."),

            ferme(TOUS, "/api/admin/door-mappings/**",
                    "CONFIGURATION : correspondance terminaux -> points d'acces."),

            ferme(TOUS, "/api/admin/hikvision-mapping/**",
                    "CONFIGURATION, IMPORTATION et EXPORT CSV vers HikCentral."),

            ferme(TOUS, "/api/admin/meal-slots/**",
                    "PLANNING CANTINE : creneaux, classes, exceptions (V021)."),

            ferme(TOUS, "/api/admin/meal-entitlements/**",
                    "DROITS REPAS et leur importation. ⚠️ La DECISION de refus a la cantine, elle, "
                            + "continue : AccessDecisionService lit la table directement, sans passer "
                            + "par HTTP. Le webhook n'est pas concerne."),

            ferme(TOUS, "/api/admin/exit-permissions/**",
                    "AUTORISATIONS DE SORTIE. ⚠️ Meme remarque : l'evaluation d'une sortie au "
                            + "portail se fait en interne, pas par cette route."),

            ferme(TOUS, "/api/admin/regimes/**",
                    "REGIMES DE SORTIE — gestion, import, resume. Le verdict affiche AU PORTAIL est "
                            + "exempte plus haut."),

            ferme(TOUS, "/api/admin/cdi/**",
                    "EXCLUSIONS CDI, historique des alertes, ecriture de l'etat. La lecture de "
                            + "l'etat et l'ecriture d'une alerte sont exemptees plus haut."),

            ferme(TOUS, "/api/admin/photos/**",
                    "IMPORTATION DES PHOTOS d'identification. La LECTURE d'une photo passe par "
                            + "/api/users/{id}/photo, qui reste ouverte."),

            ferme(TOUS, "/api/pronote/**",
                    "IMPORTATION Pronote (declenchement manuel de la synchronisation)."),

            ferme(TOUS, "/api/stats/**",
                    "RAPPORTS : statistiques globales du Panneau Administratif."),

            // ═══════════════════════════════════════════════════════════
            // 5. RAPPORTS ET EXPORTS sous /api/access — nommés un par un,
            //    parce que leurs voisins immédiats sont des écrans de poste
            // ═══════════════════════════════════════════════════════════

            ferme(TOUS, "/api/access/overview",
                    "RAPPORT GENERAL : la vue consolidee (KPIs, eleves, journal). C'est un ecran "
                            + "d'analyse, pas un ecran de poste : personne n'en a besoin pour faire "
                            + "passer quelqu'un au portail."),

            ferme(TOUS, "/api/access/logs/all",
                    "LE JOURNAL : toutes les passages, tous les points. Rapport et export."),

            ferme(TOUS, "/api/access/logs/user/**",
                    "RAPPORT : l'historique complet d'une personne, tous points et toutes dates. "
                            + "⚠️ A distinguer du PARCOURS DU JOUR (/api/admin/parcours/**), qui reste "
                            + "ouvert : chercher ou est quelqu'un maintenant est operationnel, relire "
                            + "ses six derniers mois ne l'est pas."),

            ferme(TOUS, "/api/access/refectory/**",
                    "RAPPORT CANTINE : les repas comptes sur une periode, base de la facturation. "
                            + "⚠️ Une version anterieure de cette raison affirmait que le Moniteur "
                            + "Cantine lisait /api/access/logs/{pointId} : c'etait FAUX, et la route "
                            + "dont il se sert vraiment (/api/access/logs/refectory) etait fermee. "
                            + "Elle est desormais exemptee plus haut, nommement."),

            ferme(TOUS, "/api/access/infirmary/**",
                    "RAPPORT INFIRMERIE : visites et sejours."),

            ferme(TOUS, "/api/access/incomplete-movements",
                    "RAPPORT : les mouvements incomplets (une entree sans sortie). Outil d'analyse "
                            + "de la qualite du registre, consulte apres coup. « Encore a l'interieur » "
                            + "(/api/presence/auto-close/preview), qui sert le soir meme, reste ouvert."),

            ferme(TOUS, "/api/access/attempts/**",
                    "RAPPORT des tentatives refusees et ses agregats. Les deux fils operationnels "
                            + "(cantine, portail) sont exemptes plus haut."),

            // ═══════════════════════════════════════════════════════════
            // 6. LE RESTE DE /api/access — les écrans de poste
            // ═══════════════════════════════════════════════════════════

            ouvert(TOUS, "/api/access/**",
                    "LES ECRANS DE POSTE : lecture des passages d'un point (SectorView, CDI), "
                            + "enregistrement manuel d'une passage par l'operateur, parametres de "
                            + "rapport, comptage. C'est le travail quotidien de l'etablissement.")
    );

    private LicencePortee() {
    }

    /**
     * Cette requête se ferme-t-elle quand la licence est expirée ?
     *
     * @param verbe  méthode HTTP en majuscules
     * @param chemin chemin de la requête, sans query string
     */
    public static boolean ferme(String verbe, String chemin) {
        Regle r = regleDe(verbe, chemin);
        return r != null && r.effet() == Effet.FERME;
    }

    /** La première règle qui correspond, ou {@code null} si aucune (défaut : ouvert). */
    public static Regle regleDe(String verbe, String chemin) {
        String v = verbe == null ? "" : verbe.toUpperCase();
        String c = chemin == null ? "" : chemin;
        for (Regle r : REGLES) {
            if (r.correspond(v, c)) return r;
        }
        return null;
    }
}
