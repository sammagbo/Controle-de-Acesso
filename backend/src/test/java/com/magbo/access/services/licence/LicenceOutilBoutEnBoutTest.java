package com.magbo.access.services.licence;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ★★ L'OUTIL D'ÉMISSION EST RÉELLEMENT LANCÉ, ET CE QU'IL PRODUIT EST RELU PAR
 * LE BACKEND.
 *
 * <h3>⚠️ Pourquoi les autres tests ne suffisaient pas</h3>
 * {@code LicenceOutilContratTest} compare une <b>chaîne littérale</b> entre deux
 * fichiers source : utile, mais étroit. Et {@code LicenceTestKeys} réimplémente
 * la signature une <b>troisième</b> fois — son javadoc affirmait même que cela
 * « prouve l'aller-retour complet sans jamais lancer l'outil ». C'était une
 * affirmation à l'œil, pas une preuve.
 *
 * Rien n'attrapait : un {@code Base64.getUrlEncoder()} au lieu du standard, un
 * {@code signature= } avec une espace parasite, un CRLF ajouté à l'écriture, un
 * en-tête de commentaire qui déborde sur la première ligne utile. Chacun de ces
 * défauts rendrait TOUTE licence émise invalide sur la VM — et se découvrirait
 * le jour du renouvellement, depuis la France, sans pouvoir corriger.
 * (Panel de revue — qualité, 31/08/2026.)
 *
 * <h3>Ce que ce test fait vraiment</h3>
 * Il lance {@code java tools/licence/MagboLicence.java} deux fois — génération
 * de la paire, puis émission — dans un répertoire temporaire, puis relit le
 * fichier produit avec {@link LicenceFichier} et {@link LicenceVerifier}, les
 * classes de production. C'est le seul test qui protège le geste du
 * renouvellement à distance.
 *
 * <h3>⚠️ Aucune clé de production n'est touchée</h3>
 * La paire est générée dans un {@code @TempDir}, jetable. La clé privée réelle
 * n'est ni lue, ni nécessaire, ni approchée.
 */
@DisplayName("Licence — l'outil d'emission, lance pour de vrai")
class LicenceOutilBoutEnBoutTest {

    private static final Path OUTIL = Path.of("../tools/licence/MagboLicence.java");

    /** Le {@code java} de la JVM qui exécute ce test — jamais celui du PATH. */
    private static String java() {
        return Path.of(System.getProperty("java.home"), "bin", "java").toString();
    }

    private record Resultat(int code, String sortie) {
    }

    private static Resultat lancer(String... args) throws Exception {
        List<String> commande = new ArrayList<>(List.of(java(), OUTIL.toString()));
        commande.addAll(List.of(args));

        Process p = new ProcessBuilder(commande)
                .redirectErrorStream(true)
                .directory(new File("."))
                .start();
        String sortie = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(p.waitFor(180, TimeUnit.SECONDS))
                .as("l'outil doit terminer ; sortie :\n%s", sortie).isTrue();
        return new Resultat(p.exitValue(), sortie);
    }

    /**
     * ⚠️ L'ALLER-RETOUR COMPLET : l'outil signe, le backend vérifie. C'est le
     * seul test qui exerce les deux implémentations de la forme canonique l'une
     * contre l'autre plutôt que de comparer leur texte.
     */
    @Test
    @DisplayName("★★ generer-cles puis emettre : le backend relit et VALIDE la signature")
    void allerRetourReel(@TempDir Path dir) throws Exception {
        assertThat(Files.exists(OUTIL))
                .as("sans l'outil, aucune licence n'est emissible et le mecanisme est mort")
                .isTrue();

        Resultat cles = lancer("generer-cles", "--sortie", dir.toString());
        assertThat(cles.code()).as("generer-cles a echoue :\n%s", cles.sortie()).isZero();

        Path privee = dir.resolve("magbo-licence-privee.pem");
        Path publique = dir.resolve("magbo-licence-publique.txt");
        assertThat(privee).exists();
        assertThat(publique).exists();

        Path licence = dir.resolve("licence.magbo");
        Resultat emission = lancer("emettre",
                "--etablissement", "Lycée Molière",
                "--jusqu-au", "2026-11-30",
                "--emis-le", "2026-08-31",
                "--id", "TEST-BOUT-EN-BOUT",
                "--cle-privee", privee.toString(),
                "--sortie", licence.toString());
        assertThat(emission.code()).as("emettre a echoue :\n%s", emission.sortie()).isZero();

        // ── Et maintenant, les classes de PRODUCTION relisent ce fichier ──
        String texte = Files.readString(licence, StandardCharsets.UTF_8);
        LicenceFichier.Lecture lecture = LicenceFichier.lire(texte);

        assertThat(lecture.ok())
                .as("le backend doit savoir relire ce que l'outil ecrit. Detail : %s\n\n%s",
                        lecture.detail(), texte)
                .isTrue();

        LicenceVerifier verifier = new LicenceVerifier(
                Files.readString(publique, StandardCharsets.UTF_8).trim());

        assertThat(verifier.signatureValide(lecture.contenu()))
                .as("""
                    La signature produite par l'outil n'est pas acceptee par le backend.

                    C'est LE defaut qui ne se decouvrirait qu'au renouvellement, a distance,
                    sans pouvoir corriger. Fichier produit :

                    %s""", texte)
                .isTrue();

        // ⚠️ L'accentuation doit survivre au trajet argument -> fichier -> lecture.
        assertThat(lecture.contenu().etablissement()).isEqualTo("Lycée Molière");
        assertThat(lecture.contenu().expireLe()).isEqualTo(java.time.LocalDate.of(2026, 11, 30));
    }

    /**
     * ⚠️ Écraser une clé privée, c'est invalider d'un coup toutes les licences
     * déjà émises — celle de l'école comprise. L'outil doit refuser, et une
     * commande qu'on lance une fois par an de mémoire est exactement celle où ce
     * refus compte.
     */
    @Test
    @DisplayName("★ generer-cles REFUSE d'ecraser une cle privee existante")
    void refuseDEcraser(@TempDir Path dir) throws Exception {
        assertThat(lancer("generer-cles", "--sortie", dir.toString()).code()).isZero();
        String empreinte = Files.readString(dir.resolve("magbo-licence-privee.pem"));

        Resultat second = lancer("generer-cles", "--sortie", dir.toString());

        assertThat(second.code()).as("la seconde generation doit ECHOUER").isNotZero();
        assertThat(Files.readString(dir.resolve("magbo-licence-privee.pem")))
                .as("la cle existante ne doit pas avoir bouge d'un octet")
                .isEqualTo(empreinte);
    }

    /**
     * ⚠️ La commande de vérification est ce que la procédure demande de faire
     * AVANT d'envoyer une licence. Si elle passait au vert sur un fichier
     * falsifié, elle serait pire qu'inexistante.
     */
    @Test
    @DisplayName("★★ verifier refuse un fichier dont on a repousse la date a la main")
    void verifierAttrapeLaFalsification(@TempDir Path dir) throws Exception {
        lancer("generer-cles", "--sortie", dir.toString());
        Path licence = dir.resolve("licence.magbo");
        lancer("emettre", "--etablissement", "Lycee Test", "--jusqu-au", "2026-11-30",
                "--cle-privee", dir.resolve("magbo-licence-privee.pem").toString(),
                "--sortie", licence.toString());

        assertThat(lancer("verifier", "--fichier", licence.toString(),
                "--cle-publique", dir.resolve("magbo-licence-publique.txt").toString()).code())
                .as("le fichier intact doit etre declare VALIDE").isZero();

        Files.writeString(licence, Files.readString(licence)
                .replace("expire_le=2026-11-30", "expire_le=2030-11-30"));

        Resultat apres = lancer("verifier", "--fichier", licence.toString(),
                "--cle-publique", dir.resolve("magbo-licence-publique.txt").toString());

        assertThat(apres.code()).as("une date repoussee a la main doit faire ECHOUER la commande")
                .isNotZero();
        assertThat(apres.sortie()).contains("INVALIDE");
    }

    /**
     * ⚠️ Un nom d'établissement abîmé par la console serait SIGNÉ tel quel : la
     * signature serait parfaitement valide, et l'école porterait un nom cassé
     * pour toujours, sans autre remède que réémettre.
     */
    @Test
    @DisplayName("★ emettre REFUSE un nom abime par la console")
    void refuseUnNomAbime(@TempDir Path dir) throws Exception {
        lancer("generer-cles", "--sortie", dir.toString());
        String privee = dir.resolve("magbo-licence-privee.pem").toString();

        for (String abime : new String[]{"Lyc?e Moli?re", "LycÃ©e MoliÃ¨re"}) {
            Resultat r = lancer("emettre", "--etablissement", abime,
                    "--jusqu-au", "2026-11-30", "--cle-privee", privee,
                    "--sortie", dir.resolve("x.magbo").toString());
            assertThat(r.code()).as("« %s » doit etre refuse a l'emission", abime).isNotZero();
        }
    }
}
