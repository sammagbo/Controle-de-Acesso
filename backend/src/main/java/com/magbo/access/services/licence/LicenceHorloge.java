package com.magbo.access.services.licence;

import com.magbo.access.models.LicenceClock;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.LicenceClockRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.magbo.access.services.EventTimeResolver;
import java.time.temporal.ChronoUnit;

/**
 * ANTI-RECUL D'HORLOGE — le CINQUIÈME piège d'horloge de ce projet.
 *
 * <h3>Les quatre précédents, parce qu'ils expliquent celui-ci</h3>
 * <ol>
 *   <li><b>03/08/2026 — l'heure de réception au lieu de l'heure de l'événement.</b>
 *       Une file hors-ligne de 33 passages vidée d'un coup à 14:51 a inscrit
 *       toutes ces passages à 14:51, produisant des durées de visite négatives.
 *       Corrigé par {@code EventTimeResolver} : on grave l'heure du {@code dateTime}
 *       de l'appareil, pas celle de l'arrivée du paquet.</li>
 *   <li><b>Le conteneur en UTC.</b> {@code eclipse-temurin:17-jre-alpine} monte en
 *       UTC : tout {@code LocalDateTime.now()} nu du backend partait trois heures dans
 *       le futur, à côté de colonnes écrites en heure locale par le resolver.
 *       Mesuré le 25/08/2026 (17:27 local enregistré 20:27). Corrigé par {@code TZ}
 *       dans {@code deploy/docker-compose.yml}.</li>
 *   <li><b>Le régime de sortie jugé à {@code now}.</b> Une sortie de 10h évaluée à
 *       18h devenait « fin de journée — sortie normale », et l'alerte que la Vie
 *       Scolaire devait voir n'avait jamais existé. Corrigé : le régime est
 *       évalué contre l'heure de la PASSAGE, verrouillé par
 *       {@code RegimeGateWiringTest#regimeUsaAHoraDaPassagem}.</li>
 *   <li><b>{@code cantine_removals.removido_em}</b> écrit avec un {@code now()}
 *       décalé : « retirer cette ligne » devenait « taire cette personne pendant
 *       les trois prochaines heures », entrées futures comprises.</li>
 * </ol>
 *
 * <h3>Le cinquième</h3>
 * Une licence qui n'existe que par comparaison de dates est défaite par une
 * horloge qu'on recule. Sur une VM, {@code date -s} ou un BIOS suffisent.
 * D'où la borne : la date la plus récente jamais observée est <b>persistée</b>,
 * et si l'horloge revient nettement en deçà, la licence est traitée comme
 * expirée et l'anomalie est journalisée.
 *
 * <h3>⚠️ Pourquoi la tolérance est de deux jours</h3>
 * Un recul <i>légitime</i> se compte en secondes (correction NTP) ou, au pire,
 * en heures (fuseau mal réglé — 26 h dans le cas extrême, et le {@code TZ} du
 * compose ferme déjà cette porte). Un recul <i>utile à un fraudeur</i> se compte
 * en semaines ou en mois : reculer d'un jour ne prolonge rien. Deux jours
 * avalent tout ce qui est honnête et n'offrent rien qui vaille la peine.
 *
 * <h3>⚠️ Ce que cette règle fait le jour où la pile RTC de la VM meurt</h3>
 * L'horloge repart en 1970, le recul est énorme, la gestion se ferme. C'est le
 * comportement voulu et il est <b>borné</b> : le webhook continue d'enregistrer
 * les passages, le PPMS reste nominatif, les postes travaillent. C'est
 * exactement à cela que sert la dégradation par couches — un incident
 * d'infrastructure ne peut pas mettre l'école en danger, il ne peut que fermer
 * des écrans d'administration. Le journal dit précisément ce qui s'est passé.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class LicenceHorloge {

    /**
     * ⚠️ Deux jours. Voir le javadoc de la classe : c'est le seul nombre qui
     * arbitre entre « NTP a corrigé » et « quelqu'un a reculé l'horloge ».
     */
    public static final long TOLERANCE_JOURS = 2;

    private static final short LIGNE_UNIQUE = 1;

    // ⚠️ TOUS LES HORODATAGES DE CETTE CLASSE SONT DANS LE FUSEAU DE L'ÉCOLE.
    // Un `LocalDateTime.now()` nu prend le fuseau de la JVM : correct tant que
    // `TZ` est dans le compose, faux le jour où quelqu'un l'enlève — et
    // `observe_le` divergerait alors de trois heures de la DATE sur laquelle la
    // décision est prise. C'est le DEUXIÈME des cinq pièges que cette classe
    // énumère ; ne pas le commettre dans le fichier qui en est le monument.
    // (Panel de revue — qualité, 31/08/2026.)

    private final LicenceClockRepository repository;

    /**
     * ⚠️ LE SECOND TÉMOIN, pour deux trous que la borne seule ne ferme pas
     * (panel de revue — sécurité, 31/08/2026) :
     *
     *   · <b>Supprimer la ligne.</b> {@code DELETE FROM licence_clock} puis
     *     reculer l'horloge fait renaître la borne sur la date falsifiée —
     *     licence perpétuelle, pour le prix d'un accès à la base.
     *   · <b>Figer l'horloge.</b> Une VM réglée sur une date valide avec NTP
     *     coupé ne recule jamais : {@code recul = 0}, licence VALIDE
     *     indéfiniment, et rien dans les journaux.
     *
     * La dernière passage enregistrée, elle, avance toute seule des centaines
     * de fois par jour et ne s'efface pas sans toucher au REGISTRE — ce que la
     * licence refuse de faire par principe. On prend donc le MAXIMUM des deux
     * témoins avant de comparer.
     */
    private final AccessLogRepository accessLogRepository;

    /**
     * Confronte la date du jour à la borne, avance la borne si le temps a
     * avancé, et dit si un recul significatif a été détecté.
     *
     * ⚠️ LA BORNE N'EST AVANCÉE QUE VERS L'AVANT. C'est toute la mécanique : si
     * on la réalignait sur une date reculée, il suffirait de reculer l'horloge
     * deux fois pour effacer la trace.
     *
     * ⚠️ NE LÈVE JAMAIS. Une base indisponible ou une écriture refusée ne peut
     * pas décider du sort de la licence : en cas d'échec, on répond « pas de
     * recul » et on journalise. Le contraire — fermer la gestion parce qu'une
     * requête a échoué — punirait l'école pour un incident de base de données.
     *
     * @return {@code true} si l'horloge a reculé de la tolérance ou plus
     */
    @Transactional
    public boolean reculDetecte(LocalDate aujourdhui) {
        try {
            LicenceClock temoin = repository.findById(LIGNE_UNIQUE).orElse(null);

            if (temoin == null) {
                // Première observation : la borne naît. Sur une base VRAIMENT
                // neuve il n'y a rien à comparer, et présumer un recul
                // fermerait la gestion au premier démarrage.
                //
                // ⚠️ MAIS ON REGARDE QUAND MÊME LE REGISTRE. Sans cela,
                // `DELETE FROM licence_clock` puis reculer l'horloge suffirait à
                // repartir de zéro sur une date falsifiée : la ligne renaîtrait
                // innocemment. Une base qui contient déjà des passages de
                // novembre n'est pas une base neuve.
                LocalDate passage = dernierePassage();
                LocalDate depart = plusAvance(aujourdhui, passage);
                repository.save(LicenceClock.builder()
                        .id(LIGNE_UNIQUE)
                        .dateMaxVue(depart)
                        .observeLe(LocalDateTime.now(EventTimeResolver.ZONA_ESCOLA))
                        .build());
                log.info("Licence — temoin d'horloge initialise a {} (jour {}, derniere passage {})",
                        depart, aujourdhui, passage);

                long reculInitial = ChronoUnit.DAYS.between(aujourdhui, depart);
                if (reculInitial >= TOLERANCE_JOURS) {
                    log.error("Licence — RECUL D'HORLOGE des l'initialisation du temoin : "
                                    + "l'horloge indique {} alors que le registre contient des "
                                    + "passages jusqu'au {} ({} jours). Licence traitee comme "
                                    + "EXPIREE ; les passages, le PPMS et les ecrans de poste "
                                    + "continuent de fonctionner.",
                            aujourdhui, depart, reculInitial);
                    return true;
                }
                return false;
            }

            // ⚠️ LE PLUS AVANCÉ DES DEUX TÉMOINS gagne — voir le champ
            // `accessLogRepository`.
            LocalDate reference = plusAvance(temoin.getDateMaxVue(), dernierePassage());
            long recul = ChronoUnit.DAYS.between(aujourdhui, reference);

            if (recul >= TOLERANCE_JOURS) {
                // ⚠️ NOMMER LE TEMOIN QUI A DECIDE. Les deux cas se reparent
                // differemment : la borne par un UPDATE (procedure § 6), le
                // registre pas du tout — il faut d'abord comprendre pourquoi il
                // contient des passages datees du futur.
                String qui = reference.equals(temoin.getDateMaxVue())
                        ? "licence_clock" : "le REGISTRE des passages";
                log.error("Licence — RECUL D'HORLOGE : l'horloge systeme indique {} alors que la date "
                                + "la plus recente observee est {} ({} jours en arriere, tolerance {}). "
                                + "Le temoin qui decide est : {}. "
                                + "La licence est traitee comme EXPIREE. Les passages, le PPMS et les "
                                + "ecrans de poste continuent de fonctionner. Voir "
                                + "docs/operacional/procedimento-licence.md § 6.",
                        aujourdhui, reference, recul, TOLERANCE_JOURS, qui);
                temoin.setReculDetecteLe(LocalDateTime.now(EventTimeResolver.ZONA_ESCOLA));
                temoin.setReculJours(recul);
                repository.save(temoin);
                return true;
            }

            if (aujourdhui.isAfter(temoin.getDateMaxVue())) {
                temoin.setDateMaxVue(aujourdhui);
                temoin.setObserveLe(LocalDateTime.now(EventTimeResolver.ZONA_ESCOLA));
                repository.save(temoin);
            }
            // Entre les deux (recul de 0 ou 1 jour) : rien. Ni écriture, ni
            // alerte — c'est la zone que la tolérance existe pour absorber.
            return false;

        } catch (Exception e) {
            // ⚠️ On répond « pas de recul » et on continue. Voir le javadoc.
            log.warn("Licence — temoin d'horloge inaccessible ({}). Verification de recul ignoree "
                    + "pour ce tour.", e.getMessage());
            return false;
        }
    }

    /**
     * La date de la passage la plus récente, ou {@code null}.
     *
     * ⚠️ Ne lève jamais : sur une base neuve il n'y a aucune passage, et un
     * échec de lecture ne doit pas décider du sort de la licence.
     */
    /**
     * ⚠️ COMBIEN DE PASSAGES IL FAUT POUR QU'UNE JOURNÉE COMPTE.
     *
     * On ne regarde pas la DERNIÈRE passage mais la {@value}-ième : une seule
     * ligne datée du futur — ce qui arrive quand quelqu'un avance l'horloge de
     * la VM et qu'un opérateur enregistre une passage pendant ce temps —
     * fermerait sinon la gestion pour toujours, sans réparation possible autre
     * que modifier le registre. Une journée d'école réelle compte des centaines
     * de passages ; vingt est très en dessous du bruit de fond et très au-dessus
     * d'un accident.
     */
    static final int PASSAGES_POUR_FAIRE_FOI = 20;

    private LocalDate dernierePassage() {
        try {
            var recentes = accessLogRepository.passagesLesPlusRecentes(
                    org.springframework.data.domain.PageRequest.of(
                            PASSAGES_POUR_FAIRE_FOI - 1, 1));
            if (recentes.isEmpty() || recentes.get(0) == null) return null;
            return recentes.get(0).toLocalDate();
        } catch (Exception e) {
            log.warn("Licence — registre des passages illisible ({}) ; seul le temoin de "
                    + "licence_clock sert pour ce tour.", e.getMessage());
            return null;
        }
    }

    /**
     * La date de référence effective et le témoin qui l'a produite.
     *
     * ⚠️ EXISTE POUR QUE LE DIAGNOSTIC SOIT POSSIBLE. Sans cela, l'écran d'état
     * montrait {@code dateMaxVue} — la valeur de la TABLE — alors que la
     * décision pouvait venir du REGISTRE. Quelqu'un qui applique la réparation
     * documentée voyait donc « borne = aujourd'hui, aucun recul apparent » et
     * un motif {@code HORLOGE_RECULEE} : le cadran ne montrait pas l'aiguille
     * qui décide. (Panel de revue, ronde 2.)
     */
    public record Reference(LocalDate date, String temoin) {
    }

    /** La référence effective d'aujourd'hui, pour l'écran d'état. */
    @Transactional(readOnly = true)
    public Reference reference() {
        LicenceClock t = repository.findById(LIGNE_UNIQUE).orElse(null);
        LocalDate borne = t == null ? null : t.getDateMaxVue();
        LocalDate passage = dernierePassage();
        LocalDate eff = plusAvance(borne, passage);
        if (eff == null) return new Reference(null, "aucun");
        String qui = eff.equals(passage) && (borne == null || passage.isAfter(borne))
                ? "registre des passages" : "licence_clock";
        return new Reference(eff, qui);
    }

    /** Le plus avancé des deux témoins ; {@code b} peut être {@code null}. */
    static LocalDate plusAvance(LocalDate a, LocalDate b) {
        if (b == null) return a;
        if (a == null) return b;
        return b.isAfter(a) ? b : a;
    }

    /** La borne actuelle, pour l'écran d'état et le diagnostic. */
    @Transactional(readOnly = true)
    public LicenceClock temoin() {
        return repository.findById(LIGNE_UNIQUE).orElse(null);
    }
}
