package com.magbo.access.services.licence;

import com.magbo.access.services.licence.LicencePortee.Effet;
import com.magbo.access.services.licence.LicencePortee.Regle;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TOUT ENDPOINT DOIT AVOIR UNE DÉCISION DE LICENCE — ÉCRITE, PAS DEVINÉE.
 *
 * ⚠️ POURQUOI CE TEST EXISTE. {@link LicencePortee} laisse par défaut une route
 * inconnue OUVERTE, et c'est le bon défaut : le principe non négociable veut
 * que dans le doute ça continue de fonctionner, plutôt qu'un écran de poste
 * s'éteigne. Mais un défaut, ça se subit en silence — un écran de gestion
 * ajouté en mars échapperait à la licence sans que personne ne le sache.
 *
 * Ce test transforme le défaut en décision : l'inventaire ci-dessous est écrit
 * à la main, la liste des endpoints est extraite des contrôleurs, et les deux
 * doivent se recouvrir exactement. Un endpoint nouveau rend ce test rouge tant
 * que quelqu'un n'a pas écrit dans quelle case il tombe.
 *
 * ⚠️ ET C'EST UNE DOUBLE ÉCRITURE VOLONTAIRE. {@code ATTENDU} et les règles de
 * {@link LicencePortee} disent la même chose de deux façons indépendantes : la
 * table nomme un endpoint, les règles décrivent des chemins. Une erreur
 * d'ordonnancement dans les règles — l'exception opérationnelle glissée APRÈS
 * la règle large qui la contient, c'est-à-dire du code mort — ne se voit pas en
 * lisant la liste, mais se voit ici tout de suite.
 */
@DisplayName("Licence — inventaire : chaque endpoint a une decision ecrite")
class LicencePorteeGuardTest {

    private static final Path DIR = Path.of("src/main/java/com/magbo/access/controllers");
    private static final Path SOURCES = Path.of("src/main/java");

    // ─────────────────────────────────────────────────────────────────
    // L'INVENTAIRE, écrit à la main. Clé : « Controleur.methode ».
    // ─────────────────────────────────────────────────────────────────
    // ⚠️ AJOUTER UN ENDPOINT SANS L'AJOUTER ICI FAIT ÉCHOUER CE TEST, ET C'EST
    // le seul but de la table. La question à se poser est simple : « si la
    // licence expirait ce soir, est-ce que cet écran doit continuer à
    // fonctionner ? » Un écran de POSTE, le PPMS, le webhook, la connexion :
    // OUVERT. Un écran d'administration, un rapport, un export, une
    // importation : FERME.
    private static final Map<String, Effet> ATTENDU = new LinkedHashMap<>();

    static {
        // ── Ce qui ne se ferme jamais ────────────────────────────────
        ATTENDU.put("HikvisionWebhookController.receiveWebhook", Effet.OUVERT);
        ATTENDU.put("HikvisionWebhookController.receiveWebhookPathToken", Effet.OUVERT);
        ATTENDU.put("HikvisionWebhookController.captureWebhook", Effet.OUVERT);
        ATTENDU.put("PpmsController.quemEstaDentro", Effet.OUVERT);
        ATTENDU.put("AuthController.login", Effet.OUVERT);
        ATTENDU.put("AuthController.me", Effet.OUVERT);
        ATTENDU.put("HealthController.health", Effet.OUVERT);
        ATTENDU.put("LicenceController.etat", Effet.OUVERT);
        ATTENDU.put("LicenceController.recharger", Effet.OUVERT);
        ATTENDU.put("PasswordResetRequestController.criar", Effet.OUVERT);
        ATTENDU.put("PasswordResetRequestController.listar", Effet.OUVERT);
        ATTENDU.put("PasswordResetRequestController.tratar", Effet.OUVERT);

        // ── Écrans de poste ──────────────────────────────────────────
        ATTENDU.put("AccessController.registerAccess", Effet.OUVERT);
        ATTENDU.put("AccessController.getLogsByPoint", Effet.OUVERT);
        ATTENDU.put("AccessController.countAllLogs", Effet.OUVERT);
        ATTENDU.put("AccessController.reportConfig", Effet.OUVERT);
        // ⚠️ L'ECRAN du Moniteur Cantine (CantineMonitor.js:418), pas un rapport.
        // Classe FERME au depart, avec un commentaire qui affirmait le contraire :
        // la salle apparaissait VIDE a 11h50. Panel de revue, 31/08/2026.
        ATTENDU.put("AccessController.refectoryLogs", Effet.OUVERT);
        ATTENDU.put("AccessAttemptController.getRefectoryFeed", Effet.OUVERT);
        ATTENDU.put("AccessAttemptController.getGateFeed", Effet.OUVERT);
        ATTENDU.put("StudentRegimeController.noPortao", Effet.OUVERT);
        ATTENDU.put("CantineRemovalController.hoje", Effet.OUVERT);
        ATTENDU.put("CantineRemovalController.retirar", Effet.OUVERT);
        ATTENDU.put("CantineRemovalController.desfazer", Effet.OUVERT);
        ATTENDU.put("CdiController.etat", Effet.OUVERT);
        ATTENDU.put("CdiController.registrarAlerta", Effet.OUVERT);
        ATTENDU.put("FinDeJourneeController.previsao", Effet.OUVERT);
        ATTENDU.put("ParcoursController.buscar", Effet.OUVERT);
        ATTENDU.put("ParcoursController.parcours", Effet.OUVERT);
        ATTENDU.put("TotvsLinkController.config", Effet.OUVERT);
        ATTENDU.put("TotvsLinkController.link", Effet.OUVERT);
        ATTENDU.put("AdminController.verify", Effet.OUVERT);

        // ── Lecture des personnes : le userCache de toutes les vitres ─
        ATTENDU.put("UserController.listActiveUsers", Effet.OUVERT);
        ATTENDU.put("UserController.listAllUsers", Effet.OUVERT);
        ATTENDU.put("UserController.getUserById", Effet.OUVERT);
        ATTENDU.put("UserController.searchUsers", Effet.OUVERT);
        ATTENDU.put("UserController.searchStudents", Effet.OUVERT);
        ATTENDU.put("UserPhotoController.photo", Effet.OUVERT);

        // ── Rapports et exports ──────────────────────────────────────
        ATTENDU.put("AccessController.overview", Effet.FERME);
        ATTENDU.put("AccessController.getAllRecentLogs", Effet.FERME);
        ATTENDU.put("AccessController.getLogsByUser", Effet.FERME);
        ATTENDU.put("AccessController.refectoryMeals", Effet.FERME);
        ATTENDU.put("AccessController.infirmaryVisits", Effet.FERME);
        ATTENDU.put("AccessController.incompleteMovements", Effet.FERME);
        ATTENDU.put("AccessAttemptController.getFiltered", Effet.FERME);
        ATTENDU.put("AccessAttemptController.getStats", Effet.FERME);
        ATTENDU.put("StatsController.getGlobalStats", Effet.FERME);
        ATTENDU.put("CdiController.alertas", Effet.FERME);

        // ── Configuration du système ─────────────────────────────────
        ATTENDU.put("SettingsController.catalogo", Effet.FERME);
        ATTENDU.put("SettingsController.gravados", Effet.FERME);
        ATTENDU.put("SettingsController.gravar", Effet.FERME);
        ATTENDU.put("ClassScheduleController.list", Effet.FERME);
        ATTENDU.put("ClassScheduleController.get", Effet.FERME);
        ATTENDU.put("ClassScheduleController.upsert", Effet.FERME);
        ATTENDU.put("ClassScheduleController.delete", Effet.FERME);
        ATTENDU.put("DoorMappingController.list", Effet.FERME);
        ATTENDU.put("DoorMappingController.get", Effet.FERME);
        ATTENDU.put("DoorMappingController.create", Effet.FERME);
        ATTENDU.put("DoorMappingController.update", Effet.FERME);
        ATTENDU.put("DoorMappingController.delete", Effet.FERME);
        ATTENDU.put("CdiController.gravarEstado", Effet.FERME);

        // ── Planning cantine ─────────────────────────────────────────
        ATTENDU.put("MealSlotController.grade", Effet.FERME);
        ATTENDU.put("MealSlotController.doAluno", Effet.FERME);
        ATTENDU.put("MealSlotController.criar", Effet.FERME);
        ATTENDU.put("MealSlotController.dispensees", Effet.FERME);
        ATTENDU.put("MealSlotController.atualizar", Effet.FERME);
        ATTENDU.put("MealSlotController.ligar", Effet.FERME);
        ATTENDU.put("MealSlotController.desligar", Effet.FERME);
        ATTENDU.put("MealSlotController.ligarPorPrefixo", Effet.FERME);
        ATTENDU.put("MealSlotController.excecao", Effet.FERME);
        ATTENDU.put("MealSlotController.removerExcecao", Effet.FERME);

        // ── Gestion des opérateurs ───────────────────────────────────
        ATTENDU.put("SystemUserController.list", Effet.FERME);
        ATTENDU.put("SystemUserController.create", Effet.FERME);
        ATTENDU.put("SystemUserController.update", Effet.FERME);
        ATTENDU.put("SystemUserController.deactivate", Effet.FERME);

        // ── Droits repas ─────────────────────────────────────────────
        ATTENDU.put("MealEntitlementController.list", Effet.FERME);
        ATTENDU.put("MealEntitlementController.summary", Effet.FERME);
        ATTENDU.put("MealEntitlementController.get", Effet.FERME);
        ATTENDU.put("MealEntitlementController.history", Effet.FERME);
        ATTENDU.put("MealEntitlementController.upsert", Effet.FERME);
        ATTENDU.put("MealEntitlementController.importBulk", Effet.FERME);
        ATTENDU.put("MealEntitlementController.previewImport", Effet.FERME);
        ATTENDU.put("MealEntitlementController.applyImport", Effet.FERME);

        // ── Autorisations de sortie ──────────────────────────────────
        ATTENDU.put("ExitPermissionController.getFiltered", Effet.FERME);
        ATTENDU.put("ExitPermissionController.getActive", Effet.FERME);
        ATTENDU.put("ExitPermissionController.getByUser", Effet.FERME);
        ATTENDU.put("ExitPermissionController.create", Effet.FERME);
        ATTENDU.put("ExitPermissionController.revoke", Effet.FERME);

        // ── Régimes de sortie (sauf le verdict au portail) ────────────
        ATTENDU.put("StudentRegimeController.avaliar", Effet.FERME);
        ATTENDU.put("StudentRegimeController.doAluno", Effet.FERME);
        ATTENDU.put("StudentRegimeController.resumo", Effet.FERME);
        ATTENDU.put("StudentRegimeController.simular", Effet.FERME);
        ATTENDU.put("StudentRegimeController.aplicar", Effet.FERME);
        ATTENDU.put("StudentRegimeController.definir", Effet.FERME);
        ATTENDU.put("StudentRegimeController.encerrar", Effet.FERME);

        // ── Exclusions CDI ───────────────────────────────────────────
        ATTENDU.put("CdiController.exclusoes", Effet.FERME);
        ATTENDU.put("CdiController.criar", Effet.FERME);
        ATTENDU.put("CdiController.levantar", Effet.FERME);

        // ── Importations ─────────────────────────────────────────────
        ATTENDU.put("PronoteController.triggerSync", Effet.FERME);
        ATTENDU.put("HikvisionMappingController.exportCsv", Effet.FERME);
        ATTENDU.put("HikvisionMappingController.list", Effet.FERME);
        ATTENDU.put("HikvisionMappingController.listUnmapped", Effet.FERME);
        ATTENDU.put("HikvisionMappingController.setMapping", Effet.FERME);
        ATTENDU.put("HikvisionMappingController.clearMapping", Effet.FERME);
        ATTENDU.put("HikvisionMappingController.importAndMatch", Effet.FERME);
        ATTENDU.put("UserPhotoController.summary", Effet.FERME);
        ATTENDU.put("UserPhotoController.previewArquivos", Effet.FERME);
        ATTENDU.put("UserPhotoController.aplicarArquivos", Effet.FERME);
        ATTENDU.put("UserPhotoController.previewZip", Effet.FERME);
        ATTENDU.put("UserPhotoController.aplicarZip", Effet.FERME);
        ATTENDU.put("UserPhotoController.apagar", Effet.FERME);

        // ── Gestion des personnes (écriture) et du personnel ──────────
        ATTENDU.put("UserController.createUser", Effet.FERME);
        ATTENDU.put("UserController.updateUser", Effet.FERME);
        ATTENDU.put("UserController.deleteUser", Effet.FERME);
        ATTENDU.put("UserController.createUsersBulk", Effet.FERME);
        for (String m : List.of("listStaff", "updateStaff", "deactivateStaff", "reactivateStaff",
                "deleteStaff", "previewReclassify", "reclassify", "previewMatch", "confirmMatch",
                "importPreview", "importApply", "nextMatricula", "create", "createBulk")) {
            ATTENDU.put("StaffController." + m, Effet.FERME);
        }
    }

    /**
     * Règles qui ne correspondent à aucun endpoint de contrôleur, et pourquoi
     * c'est normal.
     */
    private static final Map<String, String> REGLES_SANS_ENDPOINT = Map.of(
            "/error", "renvoi interne de Spring, pas un @RequestMapping de ce projet");

    // ─────────────────────────────────────────────────────────────────

    private record Endpoint(String classe, String methode, String verbe, String chemin) {
        String cle() {
            return classe + "." + methode;
        }
    }

    /**
     * ⚠️ {@code Files.list} n'est PAS récursif et ne regarde qu'un paquet. Un
     * contrôleur rangé dans {@code controllers/admin/} serait invisible au
     * garde, donc OUVERT par défaut sous licence expirée, avec la suite au
     * vert. Ce test ferme cette porte-là.
     */
    @Test
    @DisplayName("★★ aucun controleur ne vit hors du paquet que le garde inspecte")
    void aucunControleurHorsDuPaquet() throws IOException {
        List<String> egares = new ArrayList<>();
        try (Stream<Path> fs = Files.walk(SOURCES)) {
            for (Path p : fs.filter(x -> x.toString().endsWith(".java")).toList()) {
                if (p.getParent().equals(DIR)) continue;
                String t = Files.readString(p)
                        .replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("(?m)//.*$", "");
                if (t.contains("@RestController") || t.contains("@Controller")) {
                    egares.add(p.toString());
                }
            }
        }
        assertThat(egares).as("""
                Ces controleurs vivent hors de %s, que le garde inspecte SANS recursion : %s

                Leurs endpoints echappent donc a l'inventaire, et sont OUVERTS par defaut
                sous licence expiree — sans qu'aucun test ne devienne rouge.""",
                DIR, egares).isEmpty();
    }

    @Test
    @DisplayName("★★ tout endpoint est nomme dans l'inventaire — sinon, decidez")
    void toutEndpointEstNomme() throws IOException {
        List<String> inconnus = inventaire().stream()
                .map(Endpoint::cle)
                .distinct()
                .filter(k -> !ATTENDU.containsKey(k))
                .toList();

        assertThat(inconnus).as("""
                Ces endpoints existent et ne figurent pas dans ATTENDU : %s

                La question a trancher, par ecrit : si la licence expirait ce soir,
                cet ecran doit-il continuer a fonctionner ?
                  · ecran de POSTE, PPMS, webhook, connexion  -> Effet.OUVERT
                  · administration, rapport, export, import   -> Effet.FERME
                Puis verifiez qu'une regle de LicencePortee le couvre dans ce sens.""", inconnus)
                .isEmpty();
    }

    @Test
    @DisplayName("★★ l'inventaire ne cite pas d'endpoint disparu")
    void pasDEndpointFantome() throws IOException {
        Set<String> reels = new HashSet<>(inventaire().stream().map(Endpoint::cle).toList());
        List<String> fantomes = ATTENDU.keySet().stream().filter(k -> !reels.contains(k)).sorted().toList();

        assertThat(fantomes).as(
                        "Ces entrees d'ATTENDU ne correspondent a aucun endpoint : %s. "
                                + "Un inventaire qui cite des fantomes finit par ne plus etre relu.",
                        fantomes)
                .isEmpty();
    }

    /**
     * ⚠️ LE TEST CENTRAL. Il confronte la décision écrite à ce que les règles
     * font vraiment, chemin par chemin — y compris pour l'ordre, qui n'est
     * visible nulle part ailleurs.
     */
    @Test
    @DisplayName("★★ les regles font ce que l'inventaire declare")
    void lesReglesRespectentLInventaire() throws IOException {
        List<String> ecarts = new ArrayList<>();
        for (Endpoint e : inventaire()) {
            Effet attendu = ATTENDU.get(e.cle());
            if (attendu == null) continue; // déjà signalé par toutEndpointEstNomme
            Regle regle = LicencePortee.regleDe(e.verbe(), chemminConcret(e.chemin()));
            Effet reel = regle == null ? Effet.OUVERT : regle.effet();
            if (reel != attendu) {
                ecarts.add("%s [%s %s] : declare %s, les regles disent %s (regle : %s)".formatted(
                        e.cle(), e.verbe(), e.chemin(), attendu, reel,
                        regle == null ? "AUCUNE (defaut ouvert)" : regle.motif()));
            }
        }
        assertThat(ecarts).as("Ecarts entre la decision ecrite et les regles :\n  %s",
                String.join("\n  ", ecarts)).isEmpty();
    }

    /**
     * ⚠️ UNE RÈGLE QUE RIEN N'ATTEINT EST DU CODE MORT, et c'est le piège
     * annoncé dans le javadoc de {@link LicencePortee} : une exception
     * opérationnelle glissée APRÈS la règle large qui la contient n'a plus
     * aucun effet, et l'écran qu'elle protégeait s'éteint en silence.
     */
    @Test
    @DisplayName("★★ aucune regle n'est masquee par une regle anterieure")
    void aucuneRegleMorte() throws IOException {
        Set<String> atteintes = new HashSet<>();
        for (Endpoint e : inventaire()) {
            Regle r = LicencePortee.regleDe(e.verbe(), chemminConcret(e.chemin()));
            if (r != null) atteintes.add(r.motif());
        }
        List<String> mortes = LicencePortee.REGLES.stream()
                .map(Regle::motif)
                .filter(m -> !atteintes.contains(m))
                .filter(m -> !REGLES_SANS_ENDPOINT.containsKey(m))
                .toList();

        assertThat(mortes).as("""
                Ces regles ne sont la premiere correspondance d'AUCUN endpoint : %s

                Soit une regle anterieure les masque (l'exception operationnelle a ete
                glissee APRES la regle large qui la contient : l'ecran qu'elle protegeait
                s'eteint en silence), soit elles visent une route qui n'existe plus.""", mortes)
                .isEmpty();
    }

    @Test
    @DisplayName("★★ chaque regle porte une RAISON, pas seulement un patron")
    void chaqueRegleEstMotivee() {
        List<String> muettes = LicencePortee.REGLES.stream()
                .filter(r -> r.raison() == null || r.raison().strip().length() < 40)
                .map(Regle::motif)
                .toList();
        assertThat(muettes).as("Regles sans raison lisible : %s. Le prochain lecteur n'aura "
                + "personne a qui demander.", muettes).isEmpty();
    }

    // ── le parseur ───────────────────────────────────────────────────

    /** Un chemin gabarit ({@code {id}}) devient un chemin plausible. */
    private static String chemminConcret(String gabarit) {
        return gabarit.replaceAll("\\{[^}]*\\}", "X");
    }

    private static final Pattern MAPPING = Pattern.compile(
            "@(Get|Post|Put|Delete|Patch)Mapping\\s*(?:\\(\\s*(?:value\\s*=\\s*)?(?:\"([^\"]*)\")?[^)]*\\))?"
                    + "[\\s\\S]{0,900}?(?:public|protected)\\s+[\\w<>,\\[\\].?\\s]+?\\s(\\w+)\\s*\\(");

    private static final Pattern TOUTE_ANNOTATION =
            Pattern.compile("@(Get|Post|Put|Delete|Patch)Mapping");

    private static List<Endpoint> inventaire() throws IOException {
        List<Endpoint> out = new ArrayList<>();
        int annotations = 0;
        try (Stream<Path> fs = Files.list(DIR)) {
            for (Path p : fs.filter(x -> x.toString().endsWith(".java")).sorted().toList()) {
                String texte = Files.readString(p)
                        .replaceAll("(?s)/\\*.*?\\*/", "")
                        .replaceAll("(?m)//.*$", "");
                String classe = p.getFileName().toString().replace(".java", "");
                Matcher base = Pattern.compile("@RequestMapping\\(\"([^\"]*)\"\\)").matcher(texte);
                String prefixe = base.find() ? base.group(1) : "";

                Matcher compteur = TOUTE_ANNOTATION.matcher(texte);
                while (compteur.find()) annotations++;

                Matcher m = MAPPING.matcher(texte);
                while (m.find()) {
                    String suffixe = m.group(2) == null ? "" : m.group(2);
                    out.add(new Endpoint(classe, m.group(3), m.group(1).toUpperCase(),
                            prefixe + suffixe));
                }
            }
        }
        // ⚠️ LE PARSEUR DOIT PROUVER QU'IL N'A RIEN PERDU, et un plancher ne le
        // prouve pas. Un endpoint invisible au parseur est un endpoint OUVERT
        // par défaut sous licence expirée, avec la suite au vert — exactement la
        // classe de silence que ce fichier existe pour supprimer. Trois façons
        // de perdre un endpoint, toutes plausibles : une annotation séparée de
        // sa signature par plus de 900 caractères (un long @PreAuthorize plus un
        // javadoc y suffisent), un `@PostMapping(consumes=…, value=…)` dans
        // l'ordre inverse, ou un contrôleur rangé dans un sous-paquet.
        // On compte donc les annotations INDÉPENDAMMENT et on exige l'égalité.
        // (Panel de revue — qualité, 31/08/2026.)
        assertThat(out.size()).as("""
                Le parseur a trouve %d endpoints pour %d annotations @...Mapping.
                Un endpoint que le parseur ne voit pas est OUVERT par defaut sous
                licence expiree, et la suite reste verte.""", out.size(), annotations)
                .isEqualTo(annotations);
        assertThat(out).as("le parseur doit trouver les endpoints — sinon ce test ne prouve rien")
                .hasSizeGreaterThan(80);
        return out;
    }
}
