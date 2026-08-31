package com.magbo.access.services.licence;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * LES QUATRE ÉTATS, aux jours exacts où ils basculent.
 *
 * ⚠️ TOUTES LES DATES SONT FIXES. Aucun {@code LocalDate.now()} ici : un test
 * qui change de résultat selon le jour où on le lance ne prouve rien. C'est la
 * leçon du régime de sortie, dont la première version passait au vert toute la
 * journée et ne cassait qu'après 17h.
 */
@DisplayName("Licence — les quatre etats")
class LicenceVerdictTest {

    private static final LocalDate EMIS = LocalDate.of(2026, 8, 31);
    private static final LocalDate EXPIRE = LocalDate.of(2026, 11, 30);

    private static LicenceVerdict le(LocalDate jour) {
        LicenceFichier.Contenu c = new LicenceFichier.Contenu(
                "Lycée Molière", "LM-20261130", EMIS, EXPIRE, "signature-deja-verifiee");
        return LicenceVerdict.signee(c, jour);
    }

    @Nested
    @DisplayName("1. VALIDE — rien ne change, aucun bandeau")
    class Valide {

        @Test
        @DisplayName("bien avant l'echeance")
        void loinAvant() {
            LicenceVerdict v = le(LocalDate.of(2026, 9, 1));
            assertThat(v.etat()).isEqualTo(LicenceEtat.VALIDE);
            assertThat(v.etat().bandeau()).as("aucun bandeau en etat VALIDE").isFalse();
            assertThat(v.gestionOuverte()).isTrue();
        }

        /** J-31 : dernier jour AVANT le preavis. Le bandeau ne doit pas encore etre la. */
        @Test
        @DisplayName("★ a 31 jours : encore VALIDE, pas de bandeau")
        void trenteEtUnJours() {
            LicenceVerdict v = le(LocalDate.of(2026, 10, 30));
            assertThat(v.joursRestants()).isEqualTo(31);
            assertThat(v.etat()).isEqualTo(LicenceEtat.VALIDE);
        }
    }

    @Nested
    @DisplayName("2. ALERTE — les 30 derniers jours, rien ne se ferme")
    class Alerte {

        @Test
        @DisplayName("★ a 30 jours pile : le preavis commence")
        void trenteJours() {
            LicenceVerdict v = le(LocalDate.of(2026, 10, 31));
            assertThat(v.joursRestants()).isEqualTo(30);
            assertThat(v.etat()).isEqualTo(LicenceEtat.ALERTE);
            assertThat(v.etat().bandeau()).isTrue();
            assertThat(v.gestionOuverte()).as("ALERTE ne ferme RIEN").isTrue();
        }

        /**
         * ⚠️ « Valable jusqu'au 30/11 » veut dire qu'on travaille normalement
         * LE 30/11. Un jour d'écart ici, et l'école perd ses écrans de gestion
         * un jour avant ce que dit le fichier.
         */
        @Test
        @DisplayName("★★ le jour de l'echeance : encore ouvert, 0 jour restant")
        void jourJ() {
            LicenceVerdict v = le(EXPIRE);
            assertThat(v.joursRestants()).isZero();
            assertThat(v.etat()).isEqualTo(LicenceEtat.ALERTE);
            assertThat(v.gestionOuverte()).isTrue();
        }
    }

    @Nested
    @DisplayName("3. COURTOISIE — 30 jours APRES, et RIEN ne se ferme")
    class Courtoisie {

        /**
         * ⚠️ CE TEST EST LA MOITIÉ DU DISPOSITIF QUI PROTÈGE L'ÉCOLE. Sam peut
         * être injoignable ; personne ne doit se retrouver bloqué pour autant.
         */
        @Test
        @DisplayName("★★ le lendemain de l'echeance : rien ne se ferme")
        void lendemain() {
            LicenceVerdict v = le(LocalDate.of(2026, 12, 1));
            assertThat(v.etat()).isEqualTo(LicenceEtat.COURTOISIE);
            assertThat(v.gestionOuverte()).as("la courtoisie ne ferme RIEN").isTrue();
            assertThat(v.joursDepuisEcheance()).isEqualTo(1);
        }

        @Test
        @DisplayName("★★ au 30e jour apres : toujours rien de ferme")
        void trentiemeJourApres() {
            LicenceVerdict v = le(LocalDate.of(2026, 12, 30));
            assertThat(v.joursRestants()).isEqualTo(-30);
            assertThat(v.etat()).isEqualTo(LicenceEtat.COURTOISIE);
            assertThat(v.gestionOuverte()).isTrue();
        }
    }

    @Nested
    @DisplayName("4. EXPIREE — les ecrans de GESTION se ferment")
    class Expiree {

        @Test
        @DisplayName("★★ au 31e jour apres : la gestion se ferme")
        void trenteEtUniemeJourApres() {
            LicenceVerdict v = le(LocalDate.of(2026, 12, 31));
            assertThat(v.joursRestants()).isEqualTo(-31);
            assertThat(v.etat()).isEqualTo(LicenceEtat.EXPIREE);
            assertThat(v.gestionOuverte()).isFalse();
            assertThat(v.motif()).isEqualTo(LicenceMotif.PERIODE_DEPASSEE);
        }

        @Test
        @DisplayName("longtemps apres : toujours EXPIREE, jamais autre chose")
        void bienApres() {
            assertThat(le(LocalDate.of(2030, 1, 1)).etat()).isEqualTo(LicenceEtat.EXPIREE);
        }
    }

    @Nested
    @DisplayName("★★ absence, illisibilite et falsification : le MEME effet")
    class SansLicence {

        /**
         * ⚠️ SI L'UN DE CES CAS ÉTAIT PLUS PERMISSIF, CE SERAIT LA PORTE À
         * EMPRUNTER. Supprimer le fichier ne doit rien rapporter de plus que le
         * laisser expirer ; le falsifier non plus.
         */
        @ParameterizedTest
        @EnumSource(value = LicenceMotif.class,
                names = {"ABSENTE", "ILLISIBLE", "SIGNATURE_INVALIDE", "HORLOGE_RECULEE"})
        @DisplayName("tous donnent EXPIREE, sans periode de grace")
        void memeEffet(LicenceMotif motif) {
            LicenceVerdict v = LicenceVerdict.sansLicence(motif, "peu importe");

            assertThat(v.etat()).isEqualTo(LicenceEtat.EXPIREE);
            assertThat(v.gestionOuverte()).isFalse();
            assertThat(v.motif()).isEqualTo(motif);
        }

        /**
         * ⚠️ La courtoisie s'applique à une licence VRAIE qui vient d'échoir,
         * pas à l'absence de licence. Si « pas de fichier » ouvrait 30 jours,
         * supprimer le fichier tous les 29 jours serait la licence perpétuelle.
         */
        @Test
        @DisplayName("★★ pas de licence ne donne JAMAIS de courtoisie")
        void pasDeCourtoisieSansLicence() {
            for (LicenceMotif m : LicenceMotif.values()) {
                if (m == LicenceMotif.OK) continue;
                assertThat(LicenceVerdict.sansLicence(m, null).etat())
                        .as("motif %s", m)
                        .isNotIn(LicenceEtat.COURTOISIE, LicenceEtat.ALERTE, LicenceEtat.VALIDE);
            }
        }
    }

    @Nested
    @DisplayName("le contrat des etats, en une ligne")
    class Contrat {

        /**
         * ⚠️ CE TEST TOMBE SI QUELQU'UN INVERSE LA RÈGLE. Un seul état ferme la
         * gestion, et c'est EXPIREE. Rendre COURTOISIE fermante — la
         * simplification qui semblera raisonnable dans six mois — casse ici.
         */
        @ParameterizedTest
        @EnumSource(LicenceEtat.class)
        @DisplayName("★★ EXPIREE est le SEUL etat qui ferme la gestion")
        void seulExpireeFerme(LicenceEtat etat) {
            assertThat(etat.gestionOuverte())
                    .as("etat %s", etat)
                    .isEqualTo(etat != LicenceEtat.EXPIREE);
        }

        @ParameterizedTest
        @EnumSource(LicenceEtat.class)
        @DisplayName("VALIDE est le seul etat silencieux")
        void seulValideEstSilencieux(LicenceEtat etat) {
            assertThat(etat.bandeau()).isEqualTo(etat != LicenceEtat.VALIDE);
        }

        @Test
        @DisplayName("les deux durees restent celles de la specification")
        void dureesDeclarees() {
            assertThat(LicenceVerdict.JOURS_PREAVIS).isEqualTo(30);
            assertThat(LicenceVerdict.JOURS_COURTOISIE).isEqualTo(30);
        }
    }
}
