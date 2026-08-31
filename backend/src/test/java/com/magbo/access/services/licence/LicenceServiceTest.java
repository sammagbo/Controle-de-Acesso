package com.magbo.access.services.licence;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * LE SERVICE — ce qui n'était prouvé nulle part ailleurs.
 *
 * Les quatre états sont couverts par {@code LicenceVerdictTest}, le format et la
 * signature par {@code LicenceSignatureTest}, la portée par
 * {@code LicencePorteeGuardTest}, le refus HTTP par {@code LicenceExpireeIT} et
 * l'anti-recul par {@code LicenceHorlogeTest}. Restait le service lui-même :
 * le cache, la relecture, et le comportement face à un disque hostile.
 * (Couverture signalée manquante par le panel de revue — qualité, 31/08/2026.)
 *
 * <h3>⚠️ Aucun état VALIDE ici, et c'est structurel</h3>
 * Le service construit son propre {@link LicenceVerifier} avec la clé publique
 * COMPILÉE. Fabriquer une licence que ce service accepterait exigerait la clé
 * privée dans le dépôt — précisément ce que le mécanisme interdit et que
 * {@code LicenceOutilContratTest} vérifie. On teste donc ce qui est testable :
 * les motifs de refus, le cache, et la relecture. Le reste est prouvé ailleurs.
 */
@DisplayName("Licence — le service : cache, relecture, disque hostile")
class LicenceServiceTest {

    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");

    /** Un service branché sur un chemin donné, avec l'anti-recul neutralisé. */
    private static LicenceService service(Path chemin) {
        LicenceHorloge horloge = mock(LicenceHorloge.class);
        when(horloge.reculDetecte(any())).thenReturn(false);
        return new LicenceService(horloge, chemin.toString(), true);
    }

    private static void horlogeA(LicenceService s, LocalDate jour) {
        ReflectionTestUtils.setField(s, "clock",
                Clock.fixed(jour.atStartOfDay(ZONE).toInstant(), ZONE));
    }

    // ═════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("fichier absent : ABSENTE, et le message oriente vers le deploiement")
    void fichierAbsent(@TempDir Path dir) {
        LicenceService s = service(dir.resolve("nexiste-pas.magbo"));

        assertThat(s.etat().motif()).isEqualTo(LicenceMotif.ABSENTE);
        assertThat(s.etat().etat()).isEqualTo(LicenceEtat.EXPIREE);
        assertThat(s.etat().detail()).contains("aucun fichier");
    }

    /**
     * ⚠️ LA BRANCHE {@code catch (IOException)} N'ÉTAIT EXERCÉE PAR RIEN. Un
     * répertoire au lieu d'un fichier est le cas le plus simple à provoquer et
     * il arrive vraiment : un {@code scp} vers un chemin qui n'existe pas encore
     * crée parfois un répertoire du nom du fichier attendu.
     */
    @Test
    @DisplayName("★ un REPERTOIRE au lieu du fichier : ABSENTE, pas d'exception")
    void repertoireAuLieuDuFichier(@TempDir Path dir) throws Exception {
        Path piege = dir.resolve("licence.magbo");
        Files.createDirectory(piege);

        LicenceService s = service(piege);

        assertThatCode(s::etat).doesNotThrowAnyException();
        assertThat(s.etat().etat()).isEqualTo(LicenceEtat.EXPIREE);
    }

    @Test
    @DisplayName("fichier illisible (format casse) : ILLISIBLE")
    void fichierCasse(@TempDir Path dir) throws Exception {
        Path f = dir.resolve("licence.magbo");
        Files.writeString(f, "ceci n'est pas une licence\n", StandardCharsets.UTF_8);

        assertThat(service(f).etat().motif()).isEqualTo(LicenceMotif.ILLISIBLE);
    }

    /**
     * ⚠️ Une licence PARFAITEMENT formée, signée par une autre clé privée :
     * c'est le scénario « je signe mes propres licences ». Le service doit dire
     * SIGNATURE_INVALIDE, pas ILLISIBLE — les deux ferment la même chose, mais
     * n'envoient pas l'exploitant au même endroit.
     */
    @Test
    @DisplayName("★★ licence bien formee mais signee ailleurs : SIGNATURE_INVALIDE")
    void signeeParUneAutreCle(@TempDir Path dir) throws Exception {
        Path f = dir.resolve("licence.magbo");
        Files.writeString(f, new LicenceTestKeys().fichier(
                        "Lycée Molière", "FAUX-1",
                        LocalDate.of(2026, 8, 31), LocalDate.of(2099, 1, 1)),
                StandardCharsets.UTF_8);

        assertThat(service(f).etat().motif()).isEqualTo(LicenceMotif.SIGNATURE_INVALIDE);
        assertThat(service(f).etat().etat()).isEqualTo(LicenceEtat.EXPIREE);
    }

    // ── le cache ─────────────────────────────────────────────────────

    /**
     * ⚠️ LE CACHE NE DOIT PAS RELIRE LE DISQUE À CHAQUE REQUÊTE. `etat()` est
     * appelé par la grille sur le chemin de toutes les requêtes de gestion.
     */
    @Test
    @DisplayName("dans la meme journee, le fichier n'est PAS relu")
    void cacheDansLaJournee(@TempDir Path dir) throws Exception {
        Path f = dir.resolve("licence.magbo");
        Files.writeString(f, "casse", StandardCharsets.UTF_8);
        LicenceService s = service(f);
        horlogeA(s, LocalDate.of(2026, 9, 1));

        assertThat(s.etat().motif()).isEqualTo(LicenceMotif.ILLISIBLE);
        Files.delete(f);   // le disque change...

        assertThat(s.etat().motif())
                .as("le meme jour, le verdict vient du cache")
                .isEqualTo(LicenceMotif.ILLISIBLE);
    }

    /**
     * ⚠️ C'EST L'ARGUMENT QUI AUTORISE À DIRE QUE LE {@code @Scheduled} EST
     * REDONDANT. Si le cache ne se refaisait pas au changement de jour, une
     * licence continuerait d'être VALIDE après son échéance dès que
     * l'ordonnanceur serait désactivé — et personne ne le remarquerait avant un
     * an. Le javadoc du service le promet ; ce test le prouve.
     */
    @Test
    @DisplayName("★★ au changement de JOUR, le fichier est relu")
    void recalculAuChangementDeJour(@TempDir Path dir) throws Exception {
        Path f = dir.resolve("licence.magbo");
        Files.writeString(f, "casse", StandardCharsets.UTF_8);
        LicenceService s = service(f);
        horlogeA(s, LocalDate.of(2026, 9, 1));
        assertThat(s.etat().motif()).isEqualTo(LicenceMotif.ILLISIBLE);

        Files.delete(f);
        horlogeA(s, LocalDate.of(2026, 9, 2));   // le jour change

        assertThat(s.etat().motif())
                .as("le cache porte la date de son calcul et doit se refaire tout seul")
                .isEqualTo(LicenceMotif.ABSENTE);
    }

    // ── la relecture, c'est-à-dire le renouvellement à distance ───────

    /**
     * ⚠️★★ LE GESTE CENTRAL DU RENOUVELLEMENT À DISTANCE. Quelqu'un dépose le
     * nouveau fichier sur la VM, un ADMIN appelle {@code recharger}, et l'école
     * repart — sans redémarrage de conteneur, sans accès SSH pour Sam.
     *
     * {@code LicenceExpireeIT} vérifie seulement que la route n'est pas refusée.
     * Ici on vérifie qu'elle FAIT quelque chose : si le cache du jour la
     * court-circuitait, Sam recevrait « toujours expirée » après avoir déposé
     * une clé neuve, sans aucun moyen de comprendre pourquoi.
     */
    @Test
    @DisplayName("★★ recharger() relit VRAIMENT le disque, meme dans la meme journee")
    void rechargerRelitLeDisque(@TempDir Path dir) throws Exception {
        Path f = dir.resolve("licence.magbo");
        LicenceService s = service(f);
        horlogeA(s, LocalDate.of(2026, 9, 1));

        assertThat(s.etat().motif()).isEqualTo(LicenceMotif.ABSENTE);

        // On « dépose » un fichier — mal signé, mais c'est le disque qui change.
        Files.writeString(f, new LicenceTestKeys().fichier(
                        "Lycée Molière", "NOUVELLE",
                        LocalDate.of(2026, 9, 1), LocalDate.of(2027, 6, 30)),
                StandardCharsets.UTF_8);

        assertThat(s.etat().motif())
                .as("sans recharger, le cache du jour tient encore")
                .isEqualTo(LicenceMotif.ABSENTE);

        LicenceVerdict apres = s.recharger();

        assertThat(apres.motif())
                .as("recharger DOIT relire le disque, sinon le renouvellement a distance "
                        + "est impossible sans redemarrage")
                .isEqualTo(LicenceMotif.SIGNATURE_INVALIDE);
    }

    /**
     * ⚠️ La relecture n'est PAS un contournement : elle repasse par la
     * signature. Un fichier falsifié reste falsifié, autant de fois qu'on
     * appelle.
     */
    @Test
    @DisplayName("★★ recharger() n'est pas une porte : un fichier falsifie le reste")
    void rechargerNestPasUneporte(@TempDir Path dir) throws Exception {
        Path f = dir.resolve("licence.magbo");
        Files.writeString(f, new LicenceTestKeys().fichier(
                        "Lycée Molière", "FAUX", LocalDate.of(2026, 1, 1),
                        LocalDate.of(2099, 1, 1)),
                StandardCharsets.UTF_8);
        LicenceService s = service(f);

        for (int i = 0; i < 3; i++) {
            assertThat(s.recharger().gestionOuverte())
                    .as("appel n°%d", i + 1).isFalse();
        }
    }

    // ── robustesse ───────────────────────────────────────────────────

    /**
     * ⚠️ UNE PANNE DE BASE NE DOIT PAS FERMER LES ÉCRANS D'UNE ÉCOLE, ni faire
     * tomber le service. {@code LicenceHorloge} est {@code @Transactional} : son
     * try/catch interne ne voit pas les exceptions levées par le proxy. Le
     * service doit donc l'entourer lui-même.
     */
    @Test
    @DisplayName("★★ l'anti-recul qui LEVE ne fait pas tomber le service")
    void horlogeQuiLeve(@TempDir Path dir) {
        LicenceHorloge horloge = mock(LicenceHorloge.class);
        when(horloge.reculDetecte(any()))
                .thenThrow(new IllegalStateException("CannotCreateTransactionException simulee"));
        LicenceService s = new LicenceService(horloge, dir.resolve("x.magbo").toString(), true);

        assertThatCode(s::etat)
                .as("une base injoignable ne peut pas faire tomber la licence")
                .doesNotThrowAnyException();
        assertThat(s.etat().etat()).isEqualTo(LicenceEtat.EXPIREE);
        assertThat(s.etat().motif())
                .as("l'echec de l'anti-recul ne doit pas se faire passer pour un RECUL detecte")
                .isEqualTo(LicenceMotif.ABSENTE);
    }

    @Test
    @DisplayName("un recul detecte donne HORLOGE_RECULEE, sans lire le fichier")
    void reculDetecte(@TempDir Path dir) throws Exception {
        Path f = dir.resolve("licence.magbo");
        Files.writeString(f, "peu importe", StandardCharsets.UTF_8);
        LicenceHorloge horloge = mock(LicenceHorloge.class);
        when(horloge.reculDetecte(any())).thenReturn(true);

        LicenceService s = new LicenceService(horloge, f.toString(), true);

        assertThat(s.etat().motif()).isEqualTo(LicenceMotif.HORLOGE_RECULEE);
        assertThat(s.etat().etat()).isEqualTo(LicenceEtat.EXPIREE);
    }

    /**
     * ⚠️★★ CE TEST A TROUVÉ UN VRAI DÉFAUT. {@code Path.of} lève
     * {@code InvalidPathException} sur un caractère interdit — une espace en
     * tête, un guillemet resté collé dans un {@code .env}. C'était dans le
     * CONSTRUCTEUR : le contexte Spring ne montait pas, donc plus de webhook,
     * plus de PPMS, plus d'écrans de poste — à cause d'une faute de frappe dans
     * une variable qui ne gouverne qu'une couche commerciale.
     *
     * Exactement ce que le javadoc de la classe promet de ne jamais faire.
     */
    @Test
    @DisplayName("★★ un chemin ILLEGAL n'empeche pas le backend de monter")
    void cheminIllegalNeBloquePasLeDemarrage() {
        LicenceHorloge horloge = mock(LicenceHorloge.class);
        when(horloge.reculDetecte(any())).thenReturn(false);
        String cheminIllegal = " che\"min|<>";

        assertThatCode(() -> new LicenceService(horloge, cheminIllegal, true))
                .as("un chemin invalide dans .env ne peut pas empecher le contexte de monter")
                .doesNotThrowAnyException();

        LicenceService s = new LicenceService(horloge, cheminIllegal, true);
        assertThat(s.etat().etat())
                .as("la licence est simplement ABSENTE, et c'est tout ce qui se passe")
                .isEqualTo(LicenceEtat.EXPIREE);
    }

    @Test
    @DisplayName("le demarrage ne leve jamais, meme si l'anti-recul est casse")
    void demarrageNeLevePas(@TempDir Path dir) {
        LicenceHorloge horloge = mock(LicenceHorloge.class);
        when(horloge.reculDetecte(any())).thenThrow(new IllegalStateException("base absente"));
        LicenceService s = new LicenceService(horloge, dir.resolve("x.magbo").toString(), true);

        assertThatCode(s::auDemarrage)
                .as("un backend qui refuse de monter a cause de la licence, c'est l'ecole "
                        + "sans enregistrement des passages")
                .doesNotThrowAnyException();
    }
}
