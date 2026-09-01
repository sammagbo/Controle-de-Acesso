package com.magbo.access.services.licence;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * LA SIGNATURE : toute altération d'un champ invalide la licence.
 *
 * C'est le seul endroit du mécanisme qui repose sur des mathématiques et non
 * sur de la discipline. Si ces tests passent alors qu'ils ne devraient pas, la
 * licence n'est plus qu'un fichier texte qu'on édite.
 */
@DisplayName("Licence — signature Ed25519")
class LicenceSignatureTest {

    private final LicenceTestKeys cles = new LicenceTestKeys();
    private final LicenceVerifier verifier = cles.verifier();

    private static final LocalDate EMIS = LocalDate.of(2026, 8, 31);
    private static final LocalDate EXPIRE = LocalDate.of(2026, 11, 30);

    @Test
    @DisplayName("une licence emise puis relue est valide (aller-retour complet)")
    void allerRetour() {
        String texte = cles.fichier("Lycée Molière", "LM-20261130", EMIS, EXPIRE);

        LicenceFichier.Lecture lecture = LicenceFichier.lire(texte);

        assertThat(lecture.ok()).as("le fichier doit se relire").isTrue();
        assertThat(verifier.signatureValide(lecture.contenu())).isTrue();
        assertThat(lecture.contenu().etablissement()).isEqualTo("Lycée Molière");
        assertThat(lecture.contenu().expireLe()).isEqualTo(EXPIRE);
    }

    @Nested
    @DisplayName("★★ toute alteration invalide la signature")
    class Alteration {

        /**
         * ⚠️ LE TEST QUI COMPTE. Repousser la date d'expiration à la main dans
         * le fichier est le contournement que n'importe qui essaierait en
         * premier — il ne demande ni outil, ni compétence, juste un éditeur de
         * texte sur la VM.
         */
        @Test
        @DisplayName("repousser expire_le a la main ne sert a rien")
        void expirationRepoussee() {
            String texte = cles.fichier("Lycée Molière", "LM-20261130", EMIS, EXPIRE)
                    .replace("expire_le=2026-11-30", "expire_le=2030-11-30");

            LicenceFichier.Lecture lecture = LicenceFichier.lire(texte);

            assertThat(lecture.ok()).as("le fichier reste LISIBLE — c'est la signature qui tranche")
                    .isTrue();
            assertThat(verifier.signatureValide(lecture.contenu()))
                    .as("une date repoussee a la main doit invalider la signature")
                    .isFalse();
        }

        @Test
        @DisplayName("changer l'etablissement invalide")
        void etablissementChange() {
            String texte = cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE)
                    .replace("etablissement=Lycée Molière", "etablissement=Autre Lycee");
            assertThat(verifier.signatureValide(LicenceFichier.lire(texte).contenu())).isFalse();
        }

        @Test
        @DisplayName("changer l'identifiant invalide")
        void identifiantChange() {
            String texte = cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE)
                    .replace("licence_id=LM-1", "licence_id=LM-2");
            assertThat(verifier.signatureValide(LicenceFichier.lire(texte).contenu())).isFalse();
        }

        @Test
        @DisplayName("changer la date d'emission invalide")
        void emissionChangee() {
            String texte = cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE)
                    .replace("emis_le=2026-08-31", "emis_le=2026-01-01");
            assertThat(verifier.signatureValide(LicenceFichier.lire(texte).contenu())).isFalse();
        }

        /**
         * ⚠️ Le scénario « je signe ma propre licence ». Il échoue parce que la
         * clé publique du backend est compilée et qu'aucune propriété ne peut
         * la remplacer — c'est ce que vérifie {@code LicenceOutilContratTest}.
         */
        @Test
        @DisplayName("une licence signee par une AUTRE cle privee est refusee")
        void autreCle() {
            LicenceTestKeys attaquant = new LicenceTestKeys();
            String texte = attaquant.fichier("Lycée Molière", "LM-1", EMIS, LocalDate.of(2099, 1, 1));

            assertThat(verifier.signatureValide(LicenceFichier.lire(texte).contenu()))
                    .as("le verificateur de l'ecole ne doit accepter QUE la cle de MAGBO STUDIO")
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("un fichier abime produit un etat, jamais une exception")
    class NeLevePas {

        /**
         * ⚠️ Le backend doit monter et enregistrer les passages même avec une
         * licence en miettes. Une exception ici remonterait au démarrage.
         */
        @Test
        @DisplayName("signature illisible : false, pas d'exception")
        void signaturePourrie() {
            LicenceFichier.Contenu c = new LicenceFichier.Contenu(
                    "Lycée Molière", "LM-1", EMIS, EXPIRE, "ceci n'est pas du base64 !!!");
            assertThatCode(() -> assertThat(verifier.signatureValide(c)).isFalse())
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("contenu null : false, pas d'exception")
        void contenuNull() {
            assertThatCode(() -> assertThat(verifier.signatureValide(null)).isFalse())
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("signature de la bonne forme mais du mauvais contenu")
        void signatureDUnAutreContenu() {
            String canoniqueAutre = String.format(LicenceFichier.FORME_CANONIQUE,
                    "Autre", "X-1", EMIS, EXPIRE);
            LicenceFichier.Contenu c = new LicenceFichier.Contenu(
                    "Lycée Molière", "LM-1", EMIS, EXPIRE, cles.signer(canoniqueAutre));
            assertThat(verifier.signatureValide(c)).isFalse();
        }
    }

    @Nested
    @DisplayName("lecture du format")
    class Format {

        @Test
        @DisplayName("les commentaires et les lignes vides sont ignores")
        void commentaires() {
            String texte = "# en-tete\n\n# encore\n"
                    + cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE);
            assertThat(LicenceFichier.lire(texte).ok()).isTrue();
        }

        /**
         * ⚠️ CRLF. Un fichier ouvert dans le Bloc-notes sur la VM repart en
         * CRLF ; un {@code \r} resté collé à la valeur changerait les octets
         * signés et casserait la licence pour une raison invisible dans un
         * {@code cat}.
         */
        @Test
        @DisplayName("★ un fichier en CRLF reste valide")
        void crlf() {
            String texte = cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE)
                    .replace("\n", "\r\n");

            LicenceFichier.Lecture lecture = LicenceFichier.lire(texte);

            assertThat(lecture.ok()).isTrue();
            assertThat(verifier.signatureValide(lecture.contenu()))
                    .as("le \\r ne doit pas entrer dans les octets signes").isTrue();
        }

        /**
         * ⚠️ LE BOM UTF-8, ET IL ARRIVERA. Sur Windows, la redirection {@code >}
         * de PowerShell et « Enregistrer en UTF-8 avec BOM » du Bloc-notes
         * ajoutent U+FEFF en tête de fichier — et la procédure de secours dit
         * justement de recopier la licence à la main. Trois octets qu'aucun
         * éditeur n'affiche déclareraient la licence illisible, et le
         * diagnostic se ferait à distance, depuis la France.
         */
        @Test
        @DisplayName("★★ un fichier avec BOM UTF-8 (PowerShell, Bloc-notes) reste valide")
        void bomUtf8() {
            String texte = '﻿' + cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE);

            LicenceFichier.Lecture lecture = LicenceFichier.lire(texte);

            assertThat(lecture.ok()).as("le BOM ne doit pas rendre le fichier illisible").isTrue();
            assertThat(verifier.signatureValide(lecture.contenu()))
                    .as("le BOM n'entre pas dans les octets signes").isTrue();
        }

        @Test
        @DisplayName("BOM + CRLF ensemble : le cas Windows complet")
        void bomEtCrlf() {
            String texte = '﻿' + cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE)
                    .replace("\n", "\r\n");
            LicenceFichier.Lecture lecture = LicenceFichier.lire(texte);
            assertThat(lecture.ok()).isTrue();
            assertThat(verifier.signatureValide(lecture.contenu())).isTrue();
        }

        @Test
        @DisplayName("un champ en trop rend le fichier illisible")
        void champEnTrop() {
            String texte = cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE)
                    .replace("signature=", "champ_invente=oui\nsignature=");
            LicenceFichier.Lecture l = LicenceFichier.lire(texte);
            assertThat(l.ok()).isFalse();
            assertThat(l.motif()).isEqualTo(LicenceMotif.ILLISIBLE);
        }

        @Test
        @DisplayName("un marqueur de version different est refuse")
        void mauvaisMarqueur() {
            String texte = cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE)
                    .replace("MAGBO-LICENCE-V1", "MAGBO-LICENCE-V2");
            assertThat(LicenceFichier.lire(texte).ok()).isFalse();
        }

        @Test
        @DisplayName("des champs permutes sont refuses (l'ordre fait partie du contrat)")
        void ordrePermute() {
            String texte = cles.fichier("Lycée Molière", "LM-1", EMIS, EXPIRE)
                    .replace("etablissement=Lycée Molière\nlicence_id=LM-1",
                             "licence_id=LM-1\netablissement=Lycée Molière");
            assertThat(LicenceFichier.lire(texte).ok()).isFalse();
        }

        @Test
        @DisplayName("expire_le anterieur a emis_le est refuse")
        void datesIncoherentes() {
            String texte = cles.fichier("Lycée Molière", "LM-1", EXPIRE, EMIS);
            assertThat(LicenceFichier.lire(texte).ok()).isFalse();
        }

        @Test
        @DisplayName("fichier vide ou null : illisible, sans exception")
        void vide() {
            assertThat(LicenceFichier.lire(null).ok()).isFalse();
            assertThat(LicenceFichier.lire("").ok()).isFalse();
            assertThat(LicenceFichier.lire("   \n\n# rien\n").ok()).isFalse();
        }
    }
}
