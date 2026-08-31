package com.magbo.access.services.licence;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;

/**
 * LE CONTRAT ENTRE L'OUTIL D'ÉMISSION ET LE VÉRIFICATEUR.
 *
 * ⚠️ POURQUOI CE TEST EXISTE. La forme canonique — les octets exactement signés
 * — est écrite DEUX FOIS : dans {@code tools/licence/MagboLicence.java} (qui
 * signe) et dans {@link LicenceFichier} (qui vérifie). Elle ne peut pas être
 * partagée : l'outil doit tourner sans Maven, sans le JAR, depuis n'importe
 * quel poste avec un JDK — c'est la condition pour que Sam puisse émettre une
 * clé depuis la France en deux minutes.
 *
 * ⚠️ ET LA DÉRIVE SERAIT INVISIBLE JUSQU'AU PIRE MOMENT. Un caractère
 * d'écart, et toute licence émise devient invalide sur la VM. On le
 * découvrirait le jour du renouvellement — à distance, sans pouvoir corriger,
 * avec l'école qui vient de perdre ses écrans de gestion. Ce test compare les
 * deux fichiers, mot pour mot.
 */
@DisplayName("Licence — contrat outil/backend, et absence de porte derobee")
class LicenceOutilContratTest {

    private static final Path OUTIL = Path.of("../tools/licence/MagboLicence.java");
    private static final Path VERIFICATEUR =
            Path.of("src/main/java/com/magbo/access/services/licence/LicenceFichier.java");
    private static final Path SOURCES_MAIN = Path.of("src/main/java");

    /**
     * L'en-tête d'un bloc PEM de clé privée, assemblé à l'exécution.
     *
     * ⚠️ ÉCRIT EN DEUX MORCEAUX EXPRÈS. Le marqueur littéral n'apparaît donc
     * nulle part dans ce fichier — sinon le test qui traque les clés privées
     * dans le dépôt se dénoncerait lui-même, et la seule façon de le faire
     * passer serait de l'affaiblir.
     */
    private static final String MARQUEUR_PEM = "-----BEGIN " + "PRIVATE KEY-----";

    /** Le code sans ses commentaires — « nommer » n'est pas « utiliser ». */
    private static String sansCommentaires(String source) {
        return source.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("(?m)//.*$", "");
    }

    /** La chaîne littérale affectée à FORME_CANONIQUE dans un fichier source. */
    private static String formeCanoniqueDe(Path source) throws IOException {
        String texte = Files.readString(source);
        Matcher m = Pattern.compile(
                        "FORME_CANONIQUE\\s*=\\s*\\n?\\s*\"((?:[^\"\\\\]|\\\\.)*)\"\\s*;")
                .matcher(texte);
        assertThat(m.find()).as("FORME_CANONIQUE introuvable dans %s", source).isTrue();
        return m.group(1);
    }

    @Test
    @DisplayName("★★ l'outil d'emission et le verificateur signent les MEMES octets")
    void memeFormeCanonique() throws IOException {
        assertThat(Files.exists(OUTIL))
                .as("l'outil d'emission doit exister a %s — sans lui, aucune licence ne peut "
                        + "etre emise et le mecanisme entier est mort", OUTIL.toAbsolutePath())
                .isTrue();

        String cotOutil = formeCanoniqueDe(OUTIL);
        String cotBackend = formeCanoniqueDe(VERIFICATEUR);

        assertThat(cotOutil).as("""
                La forme canonique a diverge entre l'outil et le backend.

                  outil   : %s
                  backend : %s

                Toute licence emise par l'outil serait REFUSEE sur la VM, et on ne le
                decouvrirait qu'au renouvellement — a distance, sans pouvoir corriger.""",
                cotOutil, cotBackend).isEqualTo(cotBackend);
    }

    @Test
    @DisplayName("la forme canonique porte bien un marqueur de version et les quatre champs")
    void formeCanoniqueComplete() throws IOException {
        String forme = formeCanoniqueDe(VERIFICATEUR);
        assertThat(forme).startsWith("MAGBO-LICENCE-V1");
        assertThat(forme).contains("etablissement=%s", "licence_id=%s", "emis_le=%s", "expire_le=%s");
    }

    /**
     * ⚠️ LA PORTE DÉROBÉE QUI N'EXISTE PAS, ET QUI DOIT CONTINUER À NE PAS
     * EXISTER. Si la clé publique pouvait venir d'une propriété ou d'une
     * variable d'environnement, il suffirait d'une ligne dans un {@code .env}
     * pour signer ses propres licences avec sa propre clé. Le seul
     * contournement assumé est de recompiler le backend (ADR-006) — il doit
     * rester le moins cher.
     */
    @Test
    @DisplayName("★★ aucune propriete ne peut remplacer la cle publique")
    void pasDeSurchargeDeCle() throws IOException {
        String verifier = Files.readString(
                Path.of("src/main/java/com/magbo/access/services/licence/LicenceVerifier.java"));

        assertThat(verifier)
                .as("la cle publique doit etre une constante compilee, jamais une @Value")
                .doesNotContain("@Value");

        // ⚠️ On cherche dans le CODE, jamais dans les commentaires : LicenceVerifier
        // nomme cette propriete dans son javadoc, precisement pour ecrire qu'elle
        // n'existe pas. Un test qui confondrait « nommer » et « utiliser »
        // punirait la documentation d'exister.
        List<String> coupables = new ArrayList<>();
        try (Stream<Path> fs = Files.walk(SOURCES_MAIN)) {
            for (Path p : fs.filter(x -> x.toString().endsWith(".java")).toList()) {
                String t = sansCommentaires(Files.readString(p));
                if (t.contains("licence.public-key") || t.contains("LICENCE_PUBLIC_KEY")
                        || t.contains("licence.cle-publique")) {
                    coupables.add(p.toString());
                }
            }
        }
        assertThat(coupables).as("Une surcharge de cle publique est apparue dans : %s. "
                + "C'est une porte derobee d'une seule ligne de .env.", coupables).isEmpty();
    }

    /**
     * ⚠️ LA PROPRIÉTÉ NE DOIT RIEN POUVOIR HORS DES TESTS.
     *
     * <b>La première version conditionnait sur le profil {@code prod}, et
     * c'était faux</b> : le profil est lui-même une entrée d'environnement.
     * {@code SPRING_PROFILES_ACTIVE} est une ligne de {@code
     * docker-compose.yml} comme une autre — deux lignes éditées sur la VM (un
     * profil nommé autrement, plus {@code MAGBO_LICENCE_GATE_ENABLED=false}) et
     * la grille mourait en trente secondes, sans JDK ni Maven. Signalé par le
     * panel de revue (sécurité) le 31/08/2026.
     *
     * La condition porte désormais sur la présence du <b>harnais de test</b>,
     * que {@code spring-boot-starter-test} apporte en portée {@code test} et
     * que le fat jar ne contient donc jamais.
     */
    @Test
    @DisplayName("★★ la grille ne depend d'AUCUN profil ni d'aucune variable d'environnement")
    void laGrilleNeDependPasDUnProfil() throws IOException {
        String source = sansCommentaires(Files.readString(
                Path.of("src/main/java/com/magbo/access/services/licence/LicenceService.java")));

        assertThat(source)
                .as("""
                    Le profil est une ENTREE D'ENVIRONNEMENT : SPRING_PROFILES_ACTIVE est une
                    ligne de docker-compose. Conditionner la grille dessus la rend desactivable
                    en deux lignes sur la VM, sans recompiler — c'est-a-dire moins cher que le
                    seul contournement assume (ADR-006).""")
                .doesNotContain("acceptsProfiles")
                .doesNotContain("Profiles.of")
                .doesNotContain("@Profile");

        assertThat(source)
                .as("la condition doit porter sur le harnais de test, absent du jar livre")
                .contains("org.springframework.boot.test.context.SpringBootTest");
    }

    /**
     * ⚠️ Et le harnais de test doit rester en portée {@code test} dans le pom.
     * Le jour où quelqu'un le passe en {@code compile}, la classe apparaît dans
     * le fat jar et {@code MAGBO_LICENCE_GATE_ENABLED=false} redevient une
     * porte dérobée d'un seul mot — sans qu'aucun autre test ne s'en aperçoive.
     */
    @Test
    @DisplayName("★★ spring-boot-starter-test reste en portee `test` dans le pom")
    void leHarnaisResteEnPorteeTest() throws IOException {
        String pom = Files.readString(Path.of("pom.xml")).replaceAll("\\s+", " ");

        assertThat(pom)
                .as("si ce harnais entre dans le jar livre, la propriete redevient une porte derobee")
                .contains("<artifactId>spring-boot-starter-test</artifactId> <scope>test</scope>");
    }

    /** Sous le harnais de test, la propriété agit — c'est sa seule raison d'être. */
    @Test
    @DisplayName("sous le harnais de test, la propriete agit (les ~1000 tests en dependent)")
    void laProprieteAgitSousLeHarnais() {
        assertThat(new LicenceService(mock(LicenceHorloge.class),
                "licence/absente.magbo", false).gateActif())
                .as("le harnais EST present ici : la propriete doit agir").isFalse();
        assertThat(new LicenceService(mock(LicenceHorloge.class),
                "licence/absente.magbo", true).gateActif()).isTrue();
    }

    /**
     * ⚠️ LA CLÉ PRIVÉE N'ENTRE JAMAIS DANS LE DÉPÔT. Le dépôt est PUBLIC ; une
     * clé privée poussée dessus donne à tout internet le droit d'émettre des
     * licences perpétuelles, et un {@code git push --force} ne la reprend pas.
     */
    @Test
    @DisplayName("★★ aucune cle privee dans les sources du depot")
    void pasDeClePriveeDansLeDepot() throws IOException {
        // ⚠️ LA RACINE DU DÉPÔT EST DANS LA LISTE, et elle y est pour une raison
        // précise : `generer-cles` écrit par défaut dans le RÉPERTOIRE COURANT
        // (`--sortie` vaut « . »). Quelqu'un qui lance la commande depuis le
        // dépôt y dépose donc sa clé privée. Le `.gitignore` rattrape `*.pem`,
        // mais pas un export renommé (`cle.txt`, `privee.b64`) — celui-là ne
        // serait ni ignoré ni détecté. (Panel de revue — sécurité, 31/08/2026.)
        // ⚠️ TOUT LE DÉPÔT, et pas seulement `src`. `generer-cles` écrit par
        // défaut dans le RÉPERTOIRE COURANT, mais rien n'empêche de ranger un
        // export sous un nom anodin (`cle.txt`, `privee.b64`, `notes.md`) dans
        // `docs/`, `js/` ou `build/` — il échapperait au test ET au
        // `.gitignore`, qui ne couvre que `*.pem` et `*.key`.
        // (Panel de revue — sécurité, ronde 2, 31/08/2026.)
        List<String> coupables = new ArrayList<>();
        for (Path racine : List.of(Path.of(".."))) {
            if (!Files.exists(racine)) continue;
            try (Stream<Path> fs = Files.walk(racine, 20)) {
                for (Path p : fs.filter(Files::isRegularFile).toList()) {
                    String chemin = p.toString().replace('\\', '/');
                    // Rien de ce qui est ignoré ici ne peut être committé, et
                    // les parcourir ferait ramper le test.
                    if (chemin.contains("/node_modules/") || chemin.contains("/target/")
                            || chemin.contains("/.git/") || chemin.contains("/dist/")
                            || chemin.contains("/libs/") || chemin.contains("/.m2/")
                            || chemin.contains("/video/out/")) continue;
                    String nom = p.getFileName().toString();
                    if (nom.endsWith(".pem") || nom.endsWith(".key")) {
                        coupables.add(p + " (fichier de cle)");
                        continue;
                    }
                    // ⚠️ PLUS DE FILTRE PAR EXTENSION : une clé privée exportée
                    // sous un nom anodin (`cle.txt`, `privee.b64`, `notes.md`)
                    // est exactement le cas que ce test doit attraper. On saute
                    // seulement ce qui ne peut pas être du texte lisible.
                    if (Files.size(p) > 2_000_000) continue;
                    String t;
                    try {
                        t = Files.readString(p);
                    } catch (Exception binaire) {
                        continue;   // pas du texte : pas une clé PEM
                    }
                    if (t.contains(MARQUEUR_PEM)) {
                        coupables.add(p + " (bloc PEM)");
                    }
                }
            }
        }
        assertThat(coupables).as("""
                Une cle privee semble presente dans le depot : %s

                Le depot est PUBLIC. Retirez le fichier, REGENEREZ la paire
                (java tools/licence/MagboLicence.java generer-cles), remplacez
                CLE_PUBLIQUE dans LicenceVerifier, et reemettez la licence de l'ecole.""",
                coupables).isEmpty();
    }

    @Test
    @DisplayName("la cle publique compilee est une vraie cle Ed25519")
    void clePubliqueValide() {
        assertThatCode(LicenceVerifier::new).doesNotThrowAnyException();
        assertThat(LicenceVerifier.CLE_PUBLIQUE)
                .as("la constante ne doit pas etre restee sur un gabarit")
                .isNotBlank()
                .doesNotContain("REMPLACER", "TODO", "xxx");
    }
}
