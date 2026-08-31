package com.magbo.access.services.licence;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;

/**
 * LE SERVICE DE LICENCE — lit le fichier, vérifie la signature, tranche l'état.
 *
 * <h3>⚠️ Vérification CÔTÉ SERVEUR UNIQUEMENT</h3>
 * Rien de tout cela ne vit dans l'application Electron. Un poste dont on
 * remplacerait le {@code .exe} par une version antérieure contournerait
 * n'importe quelle vérification embarquée dans le client — et sur ces postes,
 * remplacer un exécutable est une manipulation ordinaire. Le front reçoit un
 * ÉTAT à afficher ; il ne le calcule pas et ne peut pas le contredire, parce
 * que c'est l'intercepteur du serveur qui refuse les requêtes.
 *
 * <h3>⚠️ HORS LIGNE — aucun appel réseau</h3>
 * Le serveur de l'école ne doit dépendre de rien d'extérieur : pas de serveur
 * de licence à joindre, pas de DNS, pas de certificat à renouveler. Une
 * signature asymétrique se vérifie avec un fichier et une clé publique
 * compilée, et c'est tout. Le jour où internet tombe à l'école, la licence ne
 * doit pas être un deuxième problème.
 *
 * <h3>Quand la vérification a lieu</h3>
 * Au DÉMARRAGE, puis UNE FOIS PAR JOUR. Entre deux évaluations le verdict est
 * en cache — mais le cache porte la date à laquelle il a été calculé et se
 * refait dès que le jour change, ce qui rend le {@code @Scheduled} redondant
 * plutôt qu'indispensable : si l'ordonnanceur venait à être désactivé, la
 * licence continuerait d'expirer à la bonne date. Deux mécanismes pour une
 * seule garantie, parce que celle-ci se vérifie une fois par an et qu'une
 * panne silencieuse ne serait découverte qu'à ce moment-là.
 *
 * <h3>⚠️ Ce service ne lève jamais et ne bloque jamais le démarrage</h3>
 * Un fichier absent, illisible ou falsifié produit un ÉTAT, jamais une
 * exception. Le backend doit monter et enregistrer les passages même sans
 * licence : c'est le principe entier.
 */
@Service
@Slf4j
public class LicenceService {

    private final LicenceVerifier verifier;
    private final LicenceHorloge horloge;
    private final Path chemin;
    private final boolean gateActif;

    /** Remplaçable en test (ReflectionTestUtils), comme dans SettingsService. */
    private Clock clock = Clock.system(com.magbo.access.services.EventTimeResolver.ZONA_ESCOLA);

    private volatile LicenceVerdict verdict;
    private volatile LocalDate calculeLe;

    public LicenceService(LicenceHorloge horloge,
                          @Value("${magbo.licence.path:licence/licence.magbo}") String chemin,
                          @Value("${magbo.licence.gate.enabled:true}") boolean gateProperty) {
        this.verifier = new LicenceVerifier();
        this.horloge = horloge;
        this.chemin = cheminSur(chemin);

        // ═══════════════════════════════════════════════════════════════
        // ⚠️⚠️ LA PROPRIÉTÉ N'AGIT QUE SOUS LE HARNAIS DE TEST
        // ═══════════════════════════════════════════════════════════════
        // La propriété `magbo.licence.gate.enabled` n'existe que pour que les
        // ~1000 tests existants tournent sans déposer de licence. Partout
        // ailleurs elle est IGNORÉE : sans cela, une ligne dans un `.env`
        // serait une porte dérobée d'un seul mot — infiniment moins chère que
        // recompiler le backend, qui est le seul contournement assumé (ADR-006).
        //
        // ⚠️ LA PREMIÈRE VERSION CONDITIONNAIT SUR LE PROFIL `prod`, ET C'ÉTAIT
        // FAUX. Le profil est lui-même une entrée d'environnement :
        // `SPRING_PROFILES_ACTIVE` est une ligne de `docker-compose.yml` comme
        // une autre. Deux lignes éditées sur la VM — un profil nommé autrement
        // que `prod`, plus `MAGBO_LICENCE_GATE_ENABLED=false` — et la grille
        // mourait, sans JDK, sans Maven, en trente secondes. Et le système
        // restait complet : les `SPRING_DATASOURCE_*`, `MAGBO_JWT_SECRET` et
        // `MAGBO_WEBHOOK_TOKEN` du compose l'emportent sur les fichiers de
        // propriétés quel que soit le profil. (Panel de revue — sécurité,
        // 31/08/2026, avec le scénario mesuré.)
        //
        // ⚠️ ON CONDITIONNE DONC SUR QUELQUE CHOSE QUI N'EXISTE PAS DANS LE JAR
        // LIVRÉ : la présence du harnais de test. `spring-boot-starter-test`
        // est en portée `test` dans le pom, donc jamais empaqueté par
        // `spring-boot-maven-plugin`. Aucune variable d'environnement, aucun
        // profil et aucun fichier de propriétés ne peut le faire apparaître —
        // il faudrait modifier le `pom.xml` et reconstruire, c'est-à-dire
        // exactement le contournement déjà assumé.
        boolean harnaisDeTest = org.springframework.util.ClassUtils.isPresent(
                "org.springframework.boot.test.context.SpringBootTest",
                LicenceService.class.getClassLoader());
        this.gateActif = !harnaisDeTest || gateProperty;
        if (!this.gateActif) {
            log.info("Licence — grille DESACTIVEE (harnais de test detecte + "
                    + "magbo.licence.gate.enabled=false). Hors des tests, cette propriete "
                    + "est ignoree.");
        }
    }

    /**
     * ⚠️ UN CHEMIN ILLÉGAL NE DOIT PAS EMPÊCHER LE BACKEND DE MONTER.
     *
     * {@code Path.of} lève {@code InvalidPathException} sur un caractère
     * interdit — une espace en tête, un {@code <}, un guillemet resté collé
     * dans un {@code .env}. Dans un CONSTRUCTEUR de bean, cela veut dire que le
     * contexte Spring ne monte pas : plus de webhook, plus de PPMS, plus
     * d'écrans de poste, à cause d'une faute de frappe dans une variable
     * d'environnement qui ne gouverne qu'une couche commerciale.
     *
     * C'est très exactement ce que le javadoc de cette classe promet de ne
     * jamais faire, et le défaut a été trouvé par {@code LicenceServiceTest}
     * lui-même. On journalise fort et on retombe sur un chemin qui n'existera
     * pas : la licence sera ABSENTE — les écrans de gestion se ferment, tout le
     * reste travaille — au lieu que rien ne démarre.
     */
    private Path cheminSur(String brut) {
        try {
            return Path.of(brut);
        } catch (Exception e) {
            log.error("Licence — chemin de licence INVALIDE (« {} ») : {}. La licence sera "
                            + "traitee comme ABSENTE. Corriger magbo.licence.path / "
                            + "MAGBO_LICENCE_PATH. Les passages, le PPMS et les ecrans de poste "
                            + "ne sont pas concernes.",
                    brut, e.getMessage());
            return Path.of("licence-chemin-invalide.magbo");
        }
    }

    /** La grille de fermeture est-elle active dans cet environnement ? */
    public boolean gateActif() {
        return gateActif;
    }

    /** Le chemin du fichier, pour le diagnostic et le message de démarrage. */
    public Path chemin() {
        return chemin;
    }

    @PostConstruct
    void auDemarrage() {
        // ⚠️ RIEN ICI NE PEUT EMPÊCHER LE BACKEND DE MONTER. Le démarrage
        // touche la base (le témoin d'horloge) et `depends_on: service_healthy`
        // ne garantit pas que le pool soit utilisable : `pg_isready` répond
        // avant que Hikari ne le soit. Un backend qui refuse de monter à cause
        // de la licence, c'est l'école sans enregistrement des passages — très
        // exactement ce que tout ce paquet existe pour empêcher.
        try {
            evaluer(true);
            journaliserBanniere();
        } catch (Exception e) {
            log.error("Licence — evaluation impossible au demarrage ({}). Le backend continue : "
                    + "les passages, le PPMS et les ecrans de poste ne dependent pas d'elle.",
                    e.toString());
        }
    }

    /**
     * Le contrôle quotidien. 03:17 — une heure creuse, décalée des minutes
     * rondes où se bousculent les autres tâches planifiées.
     */
    // ⚠️ `zone` EXPLICITE — convention du projet (PresenceAutoCloseService fait
    // pareil, FinDeJourneeController la documente). Sans elle, c'est le fuseau
    // par défaut de la JVM : correct tant que `TZ` est dans le compose, faux le
    // jour où quelqu'un l'enlève. C'est le deuxième des cinq pièges d'horloge
    // que ce paquet énumère ; ne pas le commettre ici.
    //
    // ⚠️⚠️ ET LE CRON EST ÉCRIT EN DUR, PLUS DANS UNE PROPRIÉTÉ. Il l'était, et
    // c'était le même défaut que celui de `Path.of` corrigé juste au-dessus :
    // une valeur invalide dans `MAGBO_LICENCE_CRON` — que `.env.example`
    // invitait à décommenter — fait lever `CronExpression.parse` pendant le
    // refresh du contexte. Le backend entier refusait donc de monter : plus de
    // webhook, plus de PPMS, plus d'écrans de poste, pour une faute de frappe
    // dans une couche purement commerciale. (Panel de revue — qualité,
    // ronde 2, 31/08/2026.)
    //
    // Le réglage a été supprimé plutôt que validé : personne n'a besoin de
    // choisir l'heure à laquelle une licence est relue, et le cache se refait
    // de toute façon tout seul au changement de jour (voir `etat()`, prouvé par
    // `LicenceServiceTest#recalculAuChangementDeJour`). Un bouton qui ne sert
    // à rien et qui peut éteindre l'école n'est pas un bouton.
    @Scheduled(cron = "0 17 3 * * *", zone = "America/Sao_Paulo")
    void controleQuotidien() {
        LicenceVerdict avant = verdict;
        evaluer(true);
        if (avant == null || avant.etat() != verdict.etat()) {
            journaliserBanniere();
        }
    }

    /**
     * L'état courant. Recalculé si le cache date d'un autre jour — voir le
     * javadoc de la classe : c'est ce qui rend l'ordonnanceur redondant.
     */
    public LicenceVerdict etat() {
        LocalDate aujourdhui = LocalDate.now(clock);
        if (verdict == null || !aujourdhui.equals(calculeLe)) {
            evaluer(false);
        }
        return verdict;
    }

    /**
     * Relit le fichier depuis le disque et réévalue, tout de suite.
     *
     * ⚠️ C'est ce qui permet à Sam de renouveler depuis la France sans
     * redémarrage : quelqu'un dépose le nouveau fichier sur la VM, un compte
     * ADMIN appelle {@code POST /api/admin/licence/recharger}, et c'est fait.
     * Ce n'est PAS un contournement : la relecture repasse par la signature,
     * un fichier invalide reste invalide.
     */
    public synchronized LicenceVerdict recharger() {
        evaluer(true);   // ⚠️ FORCÉ : sinon le cache du jour masque le fichier neuf
        journaliserBanniere();
        return verdict;
    }

    // -----------------------------------------------------------------

    /**
     * @param force relire le disque même si le cache est encore du jour.
     *              ⚠️ OBLIGATOIRE pour {@code recharger()} : c'est le geste du
     *              renouvellement à distance, et un cache qui le court-circuite
     *              ferait répondre « toujours expirée » à Sam qui vient de
     *              déposer une clé neuve — sans qu'il puisse comprendre pourquoi.
     */
    private synchronized void evaluer(boolean force) {
        LocalDate aujourdhui = LocalDate.now(clock);

        // ⚠️ LE SECOND CONTRÔLE DU VERROUILLAGE À DOUBLE CONTRÔLE. `etat()`
        // teste la date HORS du verrou ; sans ce test-ci, N fils qui voient
        // tous un cache périmé à minuit exécutent chacun une lecture disque et
        // une transaction, à la queue leu leu, sur le chemin de toutes les
        // requêtes. Le premier suffit.
        if (!force && verdict != null && aujourdhui.equals(calculeLe)) return;

        // ⚠️ L'ANTI-RECUL PASSE EN PREMIER, avant même de lire le fichier : une
        // horloge reculée rend toute comparaison de dates mensongère, y compris
        // celle d'une licence par ailleurs parfaitement valide.
        // ⚠️ LE TRY/CATCH EST ICI, ET PAS SEULEMENT DANS LicenceHorloge.
        // `reculDetecte` est `@Transactional` : son try/catch interne ne voit ni
        // la CannotCreateTransactionException levée par le proxy AVANT d'entrer
        // dans le corps, ni la TransactionSystemException levée AU COMMIT. Le
        // javadoc de LicenceHorloge promet « ne lève jamais » — vrai pour la
        // méthode, faux pour le bean tel qu'il est câblé. (Panel de revue —
        // qualité, 31/08/2026.)
        //
        // ⚠️ En cas d'échec on répond « pas de recul » et on continue vers la
        // lecture du fichier : une base indisponible ne doit pas fermer les
        // écrans de gestion d'une école.
        boolean recul;
        try {
            recul = horloge.reculDetecte(aujourdhui);
        } catch (Exception e) {
            log.warn("Licence — temoin d'horloge inaccessible via la transaction ({}). "
                    + "Verification de recul ignoree pour ce tour.", e.toString());
            recul = false;
        }
        if (recul) {
            verdict = LicenceVerdict.sansLicence(LicenceMotif.HORLOGE_RECULEE,
                    // ⚠️ « ou plus », pas « plus de » : la condition est `>=`.
                    // Quelqu'un qui diagnostique un recul de 2 jours exactement
                    // lirait sinon un message affirmant que son cas aurait du
                    // etre tolere.
                    "horloge systeme en arriere de " + LicenceHorloge.TOLERANCE_JOURS
                            + " jours ou plus par rapport a la date la plus recente observee");
            calculeLe = aujourdhui;
            return;
        }

        String texte;
        try {
            if (!Files.isRegularFile(chemin)) {
                verdict = LicenceVerdict.sansLicence(LicenceMotif.ABSENTE,
                        "aucun fichier a " + chemin.toAbsolutePath());
                calculeLe = aujourdhui;
                return;
            }
            texte = Files.readString(chemin, StandardCharsets.UTF_8);
        } catch (IOException | RuntimeException e) {
            // Fichier illisible, droits refusés, encodage cassé : un état, pas
            // une exception. Le backend continue d'enregistrer les passages.
            verdict = LicenceVerdict.sansLicence(LicenceMotif.ILLISIBLE,
                    "lecture impossible (" + e.getClass().getSimpleName() + " : " + e.getMessage() + ")");
            calculeLe = aujourdhui;
            return;
        }

        LicenceFichier.Lecture lecture = LicenceFichier.lire(texte);
        if (!lecture.ok()) {
            verdict = LicenceVerdict.sansLicence(LicenceMotif.ILLISIBLE, lecture.detail());
            calculeLe = aujourdhui;
            return;
        }
        if (!verifier.signatureValide(lecture.contenu())) {
            verdict = LicenceVerdict.sansLicence(LicenceMotif.SIGNATURE_INVALIDE,
                    "signature non conforme : fichier modifie apres emission, ou emis avec une "
                            + "autre cle privee");
            calculeLe = aujourdhui;
            return;
        }

        verdict = LicenceVerdict.signee(lecture.contenu(), aujourdhui);
        calculeLe = aujourdhui;
    }

    /**
     * ⚠️ Le message de démarrage est VOLONTAIREMENT bruyant quand quelque chose
     * cloche. Le scénario redouté n'est pas la fraude : c'est un montage de
     * volume oublié le jour du déploiement, qui ferme les écrans de gestion
     * pendant que l'auteur est dans un avion. Ce bloc doit sauter aux yeux dans
     * un {@code docker logs}.
     */
    private void journaliserBanniere() {
        LicenceVerdict v = verdict;
        if (v == null) return;
        if (!gateActif) {
            log.info("Licence — etat {} ({}), grille inactive dans cet environnement.", v.etat(), v.motif());
            return;
        }
        switch (v.etat()) {
            case VALIDE -> log.info("Licence VALIDE — {} · {} · expire le {} ({} jours restants).",
                    v.etablissement(), v.licenceId(), v.expireLe(), v.joursRestants());
            case ALERTE -> log.warn("Licence — ECHEANCE PROCHE : {} · expire le {} dans {} jours. "
                            + "Renouvellement : sammagbo@gmail.com",
                    v.etablissement(), v.expireLe(), v.joursRestants());
            case COURTOISIE -> log.warn("Licence — PERIODE DEPASSEE depuis {} jours (expiree le {}). "
                            + "Rien n'est ferme : periode de courtoisie de {} jours. "
                            + "Renouvellement : sammagbo@gmail.com",
                    v.joursDepuisEcheance(), v.expireLe(), LicenceVerdict.JOURS_COURTOISIE);
            case EXPIREE -> log.error("""

                    ==========================================================
                     LICENCE EXPIREE — LES ECRANS DE GESTION SONT SUSPENDUS
                    ==========================================================
                     Motif   : {}
                     Detail  : {}
                     Fichier : {}

                     CE QUI CONTINUE DE FONCTIONNER, ET CONTINUERA :
                       · l'enregistrement des passages (webhook des terminaux)
                       · les ecrans des postes (portail, CDI, cantine, infirmerie)
                       · le PPMS et sa liste NOMINATIVE, impression comprise
                       · la connexion des operateurs

                     Renouvellement : sammagbo@gmail.com
                     Procedure      : docs/operacional/procedimento-licence.md
                    ==========================================================
                    """, v.motif(), v.detail(), chemin.toAbsolutePath());
        }
    }
}
