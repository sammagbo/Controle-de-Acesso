package com.magbo.access.services.licence;

import com.magbo.access.models.LicenceClock;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.LicenceClockRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ANTI-RECUL D'HORLOGE — le cinquième piège d'horloge du projet.
 *
 * Les quatre précédents sont cités dans le javadoc de {@link LicenceHorloge} et
 * dans l'ADR-006. Celui-ci est différent des autres sur un point : les quatre
 * premiers étaient des bugs découverts APRÈS coup, en production. Celui-ci est
 * la seule fois où le piège a été traité avant d'avoir mordu — parce qu'on
 * savait, cette fois, où regarder.
 */
@DisplayName("Licence — anti-recul d'horloge (5e piege d'horloge)")
class LicenceHorlogeTest {

    private LicenceClockRepository repository;
    private AccessLogRepository accessLogRepository;
    private LicenceHorloge horloge;

    private static final short UN = 1;

    @BeforeEach
    void setUp() {
        repository = mock(LicenceClockRepository.class);
        accessLogRepository = mock(AccessLogRepository.class);
        // Par defaut : aucune passage dans le registre.
        when(accessLogRepository.passagesLesPlusRecentes(any()))
                .thenReturn(Collections.emptyList());
        horloge = new LicenceHorloge(repository, accessLogRepository);
    }

    /**
     * Le registre contient assez de passages pour faire foi jusqu'à {@code jour}.
     *
     * ⚠️ Le service demande la {@code PASSAGES_POUR_FAIRE_FOI}-ième passage la
     * plus récente, pas la dernière : une ligne isolée datée du futur ne doit
     * pas pouvoir décider. Ce stub rend donc directement cette N-ième.
     */
    private void registreFaitFoiJusquAu(LocalDate jour) {
        when(accessLogRepository.passagesLesPlusRecentes(any()))
                .thenReturn(List.of(jour.atTime(8, 30)));
    }

    private void temoinA(LocalDate date) {
        when(repository.findById(UN)).thenReturn(Optional.of(
                LicenceClock.builder().id(UN).dateMaxVue(date)
                        .observeLe(date.atStartOfDay()).build()));
    }

    @Test
    @DisplayName("premiere observation : la borne nait, aucun recul conclu")
    void premiereObservation() {
        when(repository.findById(UN)).thenReturn(Optional.empty());

        boolean recul = horloge.reculDetecte(LocalDate.of(2026, 8, 31));

        assertThat(recul).as("sur une base neuve il n'y a rien a comparer").isFalse();
        ArgumentCaptor<LicenceClock> c = ArgumentCaptor.forClass(LicenceClock.class);
        verify(repository).save(c.capture());
        assertThat(c.getValue().getDateMaxVue()).isEqualTo(LocalDate.of(2026, 8, 31));
    }

    @Test
    @DisplayName("le temps avance : la borne suit")
    void leTempsAvance() {
        temoinA(LocalDate.of(2026, 8, 31));

        boolean recul = horloge.reculDetecte(LocalDate.of(2026, 9, 1));

        assertThat(recul).isFalse();
        ArgumentCaptor<LicenceClock> c = ArgumentCaptor.forClass(LicenceClock.class);
        verify(repository).save(c.capture());
        assertThat(c.getValue().getDateMaxVue()).isEqualTo(LocalDate.of(2026, 9, 1));
    }

    @Test
    @DisplayName("meme jour : aucune ecriture")
    void memeJour() {
        temoinA(LocalDate.of(2026, 8, 31));

        assertThat(horloge.reculDetecte(LocalDate.of(2026, 8, 31))).isFalse();
        verify(repository, never()).save(any());
    }

    /**
     * ⚠️ LA TOLÉRANCE. Un recul d'un jour est avalé : correction NTP, fuseau
     * mal réglé, dérive. Le fermer serait fermer les écrans de gestion d'une
     * école pour une seconde de NTP.
     */
    @Test
    @DisplayName("★ recul d'UN jour : tolere, et la borne ne recule pas")
    void reculDUnJourTolere() {
        temoinA(LocalDate.of(2026, 9, 2));

        boolean recul = horloge.reculDetecte(LocalDate.of(2026, 9, 1));

        assertThat(recul).isFalse();
        verify(repository, never()).save(any());
    }

    /**
     * ⚠️ LE TEST QUI DÉFEND LE MÉCANISME. Sans lui, {@code date -s} sur la VM
     * suffit à prolonger la licence indéfiniment.
     */
    @Test
    @DisplayName("★★ recul de DEUX jours : detecte, licence traitee comme expiree")
    void reculDeDeuxJoursDetecte() {
        temoinA(LocalDate.of(2026, 9, 3));

        boolean recul = horloge.reculDetecte(LocalDate.of(2026, 9, 1));

        assertThat(recul).isTrue();
    }

    @Test
    @DisplayName("★★ recul de plusieurs mois : detecte, et la borne NE recule PAS")
    void reculDeMoisNeReculePasLaBorne() {
        temoinA(LocalDate.of(2026, 12, 31));

        boolean recul = horloge.reculDetecte(LocalDate.of(2026, 11, 1));

        assertThat(recul).isTrue();
        ArgumentCaptor<LicenceClock> c = ArgumentCaptor.forClass(LicenceClock.class);
        verify(repository).save(c.capture());
        assertThat(c.getValue().getDateMaxVue())
                .as("realigner la borne sur une date reculee effacerait la trace : "
                        + "il suffirait de reculer deux fois")
                .isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(c.getValue().getReculJours()).isEqualTo(60);
        assertThat(c.getValue().getReculDetecteLe()).isNotNull();
    }

    /**
     * ⚠️ La pile RTC morte. L'horloge repart en 1970, le recul est énorme, la
     * gestion se ferme. C'est voulu et c'est BORNÉ : les passages continuent
     * d'être enregistrés, le PPMS reste nominatif. Un incident d'infrastructure
     * ne peut pas mettre l'école en danger — il ne peut fermer que des écrans
     * d'administration.
     */
    @Test
    @DisplayName("pile RTC morte (retour en 1970) : detecte, et c'est le comportement voulu")
    void pileMorte() {
        temoinA(LocalDate.of(2026, 11, 1));
        assertThat(horloge.reculDetecte(LocalDate.of(1970, 1, 1))).isTrue();
    }

    /**
     * ⚠️ Une base indisponible ne peut pas décider du sort de la licence.
     * Fermer la gestion parce qu'une requête a échoué punirait l'école pour un
     * incident de base de données.
     */
    @Test
    @DisplayName("★ base inaccessible : on repond « pas de recul », sans lever")
    void baseInaccessible() {
        when(repository.findById(UN)).thenThrow(new RuntimeException("connexion perdue"));

        assertThat(horloge.reculDetecte(LocalDate.of(2026, 9, 1))).isFalse();
    }

    // ═════════════════════════════════════════════════════════════════
    //  LE SECOND TÉMOIN : la dernière passage enregistrée
    // ═════════════════════════════════════════════════════════════════

    /**
     * ⚠️★★ LE TROU QUE LA BORNE SEULE NE FERMAIT PAS. `DELETE FROM
     * licence_clock` puis reculer l'horloge faisait renaître la borne sur la
     * date falsifiée : licence perpétuelle, pour le prix d'un accès à la base
     * — c'est-à-dire moins cher que recompiler le backend, le seul
     * contournement assumé (ADR-006).
     *
     * Le registre, lui, contient encore les passages de novembre.
     */
    @Test
    @DisplayName("★★ ligne supprimee + horloge reculee : le REGISTRE trahit la manoeuvre")
    void ligneSupprimeeEtHorlogeReculee() {
        when(repository.findById(UN)).thenReturn(Optional.empty());   // la ligne a ete effacee
        registreFaitFoiJusquAu(LocalDate.of(2026, 11, 20));           // mais pas les passages

        boolean recul = horloge.reculDetecte(LocalDate.of(2026, 1, 5));      // horloge reculee

        assertThat(recul)
                .as("supprimer la ligne ne doit pas suffire : le registre porte la date")
                .isTrue();

        ArgumentCaptor<LicenceClock> c = ArgumentCaptor.forClass(LicenceClock.class);
        verify(repository).save(c.capture());
        assertThat(c.getValue().getDateMaxVue())
                .as("la borne renait sur la date du REGISTRE, pas sur celle de l'horloge")
                .isEqualTo(LocalDate.of(2026, 11, 20));
    }

    /**
     * ⚠️★★ L'HORLOGE FIGÉE. Régler la VM sur une date valide et couper NTP ne
     * produit AUCUN recul — `recul = 0` — donc la licence restait VALIDE
     * indéfiniment, sans une ligne dans les journaux. Le registre, lui,
     * continue d'avancer : 923 élèves passent des portiques tous les jours.
     */
    @Test
    @DisplayName("★★ horloge FIGEE : le registre continue d'avancer et la trahit")
    void horlogeFigee() {
        temoinA(LocalDate.of(2026, 11, 1));
        registreFaitFoiJusquAu(LocalDate.of(2026, 11, 25));

        boolean recul = horloge.reculDetecte(LocalDate.of(2026, 11, 1));   // l'horloge n'a pas bouge

        assertThat(recul)
                .as("24 jours de passages enregistres pendant que l'horloge n'avance pas")
                .isTrue();
    }

    @Test
    @DisplayName("le registre en avance d'UN jour reste dans la tolerance")
    void registreEnAvanceDUnJour() {
        temoinA(LocalDate.of(2026, 11, 1));
        registreFaitFoiJusquAu(LocalDate.of(2026, 11, 2));

        assertThat(horloge.reculDetecte(LocalDate.of(2026, 11, 1))).isFalse();
    }

    /**
     * ⚠️ Une base VRAIMENT neuve — aucune passage — ne doit pas fermer la
     * gestion au premier démarrage. C'est le cas du jour du déploiement.
     */
    @Test
    @DisplayName("★ base neuve sans aucune passage : aucune conclusion, rien ne se ferme")
    void baseVraimentNeuve() {
        when(repository.findById(UN)).thenReturn(Optional.empty());

        assertThat(horloge.reculDetecte(LocalDate.of(2026, 8, 31))).isFalse();
    }

    /**
     * ⚠️ Le registre illisible ne doit pas décider : on retombe sur la borne
     * seule. Punir l'école pour un incident de base de données serait
     * exactement l'inverse du principe.
     */
    @Test
    @DisplayName("★ registre illisible : on retombe sur la borne, sans lever")
    void registreIllisible() {
        temoinA(LocalDate.of(2026, 9, 1));
        when(accessLogRepository.passagesLesPlusRecentes(any()))
                .thenThrow(new RuntimeException("table verrouillee"));

        assertThat(horloge.reculDetecte(LocalDate.of(2026, 9, 1))).isFalse();
    }

    /**
     * ⚠️★★ LE CUL-DE-SAC QUE LA PREMIÈRE VERSION DU SECOND TÉMOIN CRÉAIT, et
     * que les deux relecteurs ont trouvé indépendamment (ronde 2).
     *
     * Le scénario est celui que la procédure décrit elle-même comme fréquent :
     * quelqu'un avance l'horloge de la VM pour un test, un opérateur enregistre
     * UNE passage manuelle pendant ce temps ({@code AccessController} horodate
     * à {@code LocalDateTime.now()}, donc à la date falsifiée), puis l'horloge
     * est remise à l'heure.
     *
     * Avec un {@code MAX(timestamp)}, cette ligne unique décidait à jamais : la
     * gestion restait fermée, et la réparation documentée
     * ({@code UPDATE licence_clock}) n'y pouvait plus rien — la seule issue
     * aurait été de modifier le REGISTRE, ce que la licence promet de ne jamais
     * faire. Un incident récupérable devenait irrécupérable.
     *
     * En prenant la N-ième passage, la ligne isolée ne déplace rien.
     */
    @Test
    @DisplayName("★★ une ligne ISOLEE datee du futur ne ferme PAS la gestion")
    void uneLigneIsoleeAuFuturNeDecidePas() {
        temoinA(LocalDate.of(2026, 9, 1));
        // Le registre ne compte QU'UNE passage au futur : la N-ieme la plus
        // recente reste une vraie journee d'ecole.
        registreFaitFoiJusquAu(LocalDate.of(2026, 9, 1));

        assertThat(horloge.reculDetecte(LocalDate.of(2026, 9, 1)))
                .as("la reparation du § 6 de la procedure doit rester efficace")
                .isFalse();
    }

    /**
     * ⚠️ Et le service demande bien la N-ième, pas la première : c'est le
     * paramètre `Pageable` qui porte toute la protection. Un test qui ne
     * regarderait que le résultat ne verrait pas la différence.
     */
    @Test
    @DisplayName("★★ le service demande la N-ieme passage, pas la derniere")
    void demandeLaNiemePassage() {
        temoinA(LocalDate.of(2026, 9, 1));
        horloge.reculDetecte(LocalDate.of(2026, 9, 1));

        ArgumentCaptor<org.springframework.data.domain.Pageable> page =
                ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(accessLogRepository).passagesLesPlusRecentes(page.capture());

        assertThat(page.getValue().getOffset())
                .as("sauter les %d plus recentes : sinon une ligne isolee au futur decide",
                        LicenceHorloge.PASSAGES_POUR_FAIRE_FOI - 1)
                .isEqualTo(LicenceHorloge.PASSAGES_POUR_FAIRE_FOI - 1L);
        assertThat(page.getValue().getPageSize()).isEqualTo(1);
    }

    @Test
    @DisplayName("plusAvance : le maximum des deux, null-safe")
    void plusAvanceEstUnMaximum() {
        LocalDate a = LocalDate.of(2026, 9, 1);
        LocalDate b = LocalDate.of(2026, 11, 1);
        assertThat(LicenceHorloge.plusAvance(a, b)).isEqualTo(b);
        assertThat(LicenceHorloge.plusAvance(b, a)).isEqualTo(b);
        assertThat(LicenceHorloge.plusAvance(a, null)).isEqualTo(a);
        assertThat(LicenceHorloge.plusAvance(null, b)).isEqualTo(b);
    }

    @Test
    @DisplayName("la tolerance reste de deux jours")
    void toleranceDeclaree() {
        assertThat(LicenceHorloge.TOLERANCE_JOURS).isEqualTo(2);
    }
}
