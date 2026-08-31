package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.services.EventTimeResolver;
import com.magbo.access.services.licence.LicenceEtat;
import com.magbo.access.services.licence.LicenceFichier;
import com.magbo.access.services.licence.LicenceMotif;
import com.magbo.access.services.licence.LicenceService;
import com.magbo.access.services.licence.LicenceVerdict;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ★★ LA PREUVE, DANS LES DEUX SENS.
 *
 * <h3>Ce que ce test verrouille</h3>
 * <ol>
 *   <li>Licence expirée : <b>le webhook enregistre toujours les passages</b> et
 *       <b>le PPMS rend toujours la liste NOMINATIVE</b>. Les écrans de poste et
 *       la connexion aussi.</li>
 *   <li>Licence expirée : <b>chaque écran de gestion se ferme</b>, en 402, un
 *       par un et nommément.</li>
 *   <li>Licence valide : <b>les mêmes écrans de gestion rouvrent</b>. Sans ce
 *       troisième volet, un gate cassé en position « toujours fermé » passerait
 *       les deux premiers.</li>
 * </ol>
 *
 * <h3>⚠️ Les deux sens doivent tomber si quelqu'un inverse la règle</h3>
 * C'est la demande explicite du cahier des charges, et elle est prise au pied
 * de la lettre : un jour, quelqu'un trouvera « plus simple » de fermer tout
 * {@code /api/**}. Ce jour-là, {@link CeQuiContinue} devient rouge — le webhook,
 * le PPMS et le portail sont testés un par un, pas par échantillon.
 *
 * <h3>⚠️ Pourquoi ce contexte Spring est distinct des autres ITs</h3>
 * {@code AbstractIT} explique que les ITs partagent UN contexte, et qu'une
 * {@code @SpringBootTest(properties=...)} en fourche un. Celui-ci en fourche un
 * exprès : il est le seul à monter avec la grille ACTIVE. Le coût — un boot de
 * plus — est le prix de la seule suite qui exerce le mécanisme entier.
 *
 * <h3>⚠️ Comment l'état est forcé, et pourquoi c'est honnête</h3>
 * Le verdict est écrit directement dans {@link LicenceService} par réflexion.
 * On ne peut pas fabriquer une licence VALIDE signée dans un test : cela
 * exigerait la clé privée dans le dépôt, ce que le mécanisme interdit — et
 * {@code LicenceOutilContratTest} le vérifie. L'arithmétique qui mène une vraie
 * licence échue à {@link LicenceEtat#EXPIREE} est prouvée séparément, sur dates
 * fixes, par {@code LicenceVerdictTest}. Ce test-ci prouve l'autre moitié : ce
 * que le serveur FAIT d'un verdict donné.
 */
@SpringBootTest(properties = {
        "magbo.webhook.token=" + TestFixtures.WEBHOOK_TOKEN,
        // ⚠️ LA LIGNE QUI FAIT TOUT : la grille est active ici, et nulle part
        // ailleurs dans la suite.
        "magbo.licence.gate.enabled=true"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("Licence expiree — ce qui continue, et ce qui se ferme")
class LicenceExpireeIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LicenceService licenceService;

    @Autowired
    private com.magbo.access.repositories.UserRepository userRepository;

    @Autowired
    private com.magbo.access.repositories.AccessLogRepository accessLogRepository;

    @Autowired
    private com.magbo.access.repositories.AccessAttemptRepository accessAttemptRepository;

    @Autowired
    private com.magbo.access.repositories.MealEntitlementRepository mealEntitlementRepository;

    @Autowired
    private com.magbo.access.repositories.DoorMappingRepository doorMappingRepository;

    @Autowired
    private com.magbo.access.services.WebhookIngestionDedupService ingestionDedupService;

    private String jetonAdmin;

    @BeforeEach
    void setUp() throws Exception {
        ingestionDedupService.clear();
        accessLogRepository.deleteAll();
        accessAttemptRepository.deleteAll();
        mealEntitlementRepository.deleteAll();
        userRepository.deleteAll();
        doorMappingRepository.deleteAll(doorMappingRepository.findAll().stream()
                .filter(m -> m.getTerminalIp() != null && m.getTerminalIp().startsWith("10.10.0."))
                .toList());

        // La connexion doit marcher AVANT qu'on force l'expiration : c'est
        // aussi une des choses qui continuent, et on en a besoin pour la suite.
        jetonAdmin = "Bearer " + TestAuthHelper.login(mockMvc, "admin", "admin1234");
    }

    // ── forçage du verdict ───────────────────────────────────────────

    private void licenceExpiree() {
        forcer(LicenceVerdict.sansLicence(LicenceMotif.ABSENTE, "forcee par le test"));
    }

    private void licenceValide() {
        forcer(LicenceVerdict.signee(new LicenceFichier.Contenu(
                        "Lycée Molière", "TEST-1",
                        LocalDate.now().minusDays(1), LocalDate.now().plusYears(5),
                        "signature-hors-sujet-ici"),
                LocalDate.now()));
    }

    private void forcer(LicenceVerdict v) {
        ReflectionTestUtils.setField(licenceService, "verdict", v);
        // ⚠️ etat() se recalcule dès que le jour change : sans caler la date de
        // calcul sur AUJOURD'HUI (dans le fuseau de l'école, celui qu'utilise
        // le service), le verdict forcé serait écrasé à la première lecture et
        // le test prouverait le contraire de ce qu'il annonce.
        ReflectionTestUtils.setField(licenceService, "calculeLe",
                LocalDate.now(EventTimeResolver.ZONA_ESCOLA));
        // ⚠️ Et on FIGE l'horloge du service : sans cela, une exécution qui
        // franchit minuit à São Paulo verrait `etat()` recalculer et écraser le
        // verdict forcé — la classe entière basculerait au milieu du parcours,
        // pour une raison qui n'a rien à voir avec ce qu'elle teste.
        ReflectionTestUtils.setField(licenceService, "clock",
                java.time.Clock.fixed(
                        java.time.ZonedDateTime.now(EventTimeResolver.ZONA_ESCOLA).toInstant(),
                        EventTimeResolver.ZONA_ESCOLA));
    }

    /**
     * ⚠️ LES SEULES ROUTES AUTORISÉES À RENDRE 500 SOUS H2, ET POURQUOI.
     *
     * Elles traversent des requêtes natives PostgreSQL-only — celles-là mêmes
     * qui sont {@code @Disabled} dans la suite. Sous H2 elles lèvent au lieu de
     * répondre, et c'est sans rapport avec la licence.
     *
     * ⚠️ LA LISTE EST NOMMÉE, pas devinée. Une version antérieure tolérait 500
     * PARTOUT : le volet « licence valide, tout rouvre » — celui dont le
     * javadoc dit qu'il est ce qui empêche un gate cassé en position « toujours
     * fermé » de passer — serait resté VERT même si les vingt écrans de gestion
     * levaient tous une exception. Un test qui accepte 500 partout n'affirme
     * que « la grille ne l'a pas refusée », jamais « l'écran fonctionne ».
     * (Panel de revue — qualité, 31/08/2026.)
     */
    private static final List<String> PG_ONLY_SOUS_H2 = List.of(
            "rapports — vue consolidee",     // countLongInfirmaryStays : DISTINCT ON
            "rapports — infirmerie");        // idem

    /** Le statut d'une requête authentifiée en ADMIN ; une exception vaut 500. */
    private int statut(MockHttpServletRequestBuilder requete) throws Exception {
        try {
            MvcResult r = mockMvc.perform(requete.header(HttpHeaders.AUTHORIZATION, jetonAdmin))
                    .andReturn();
            return r.getResponse().getStatus();
        } catch (Exception e) {
            return 500;
        }
    }

    // ═════════════════════════════════════════════════════════════════
    @Nested
    @DisplayName("★★ CE QUI CONTINUE, licence expiree")
    class CeQuiContinue {

        /**
         * ⚠️ LE TEST LE PLUS IMPORTANT DU LOT. Un désaccord commercial ne peut
         * pas créer un trou dans le registre des passages d'enfants. Le
         * terminal réessaie un temps puis abandonne : une passage refusée ici
         * est une passage perdue pour toujours.
         */
        @Test
        @DisplayName("★★ le webhook enregistre TOUJOURS la passage")
        void leWebhookEnregistreToujours() throws Exception {
            userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
            mealEntitlementRepository.save(TestFixtures.entitlement(
                    TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
            doorMappingRepository.save(TestFixtures.ipOnly(
                    TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA));

            licenceExpiree();

            mockMvc.perform(TestFixtures.multipartWebhook(
                            TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                    .andExpect(status().isOk());

            assertThat(accessLogRepository.count())
                    .as("une licence expiree ne doit JAMAIS faire perdre une passage")
                    .isEqualTo(1);
            assertThat(accessLogRepository.findAll().get(0).getUserId())
                    .isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
        }

        /**
         * ⚠️ Dans une évacuation, c'est le NOM qui permet de retrouver un
         * enfant. Ce test vérifie le statut ET la présence de noms : une route
         * qui répondrait 200 avec un comptage anonyme aurait tout perdu.
         */
        @Test
        @DisplayName("★★ le PPMS rend toujours la liste NOMINATIVE")
        void lePpmsResteNominatif() throws Exception {
            userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, "6A"));
            doorMappingRepository.save(TestFixtures.ipOnly(
                    TestFixtures.IP_BIBLIO, "BIBLIO", AccessAction.ENTRADA));
            mockMvc.perform(TestFixtures.multipartWebhook(
                    TestFixtures.payload("face-75.txt"), TestFixtures.IP_BIBLIO));

            licenceExpiree();

            MvcResult r = mockMvc.perform(get("/api/ppms/inside")
                            .header(HttpHeaders.AUTHORIZATION, jetonAdmin))
                    .andExpect(status().isOk())
                    .andReturn();

            String corps = r.getResponse().getContentAsString();
            assertThat(corps)
                    .as("la liste doit rester NOMINATIVE : un comptage anonyme ne sert "
                            + "a chercher personne")
                    .contains(TestFixtures.EMPLOYEE_PILOTO);
        }

        @Test
        @DisplayName("★★ la connexion des operateurs fonctionne")
        void laConnexionFonctionne() throws Exception {
            licenceExpiree();

            mockMvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"admin\",\"password\":\"admin1234\"}"))
                    .andExpect(status().isOk());
        }

        /**
         * Les écrans de poste, un par un. Le critère est « pas 402 » et non
         * « 200 » : certaines de ces routes répondent 404 ou 400 sur des
         * données de test vides, et ce n'est pas ce qu'on mesure ici.
         */
        @Test
        @DisplayName("★★ les ecrans de POSTE continuent (portail, CDI, cantine)")
        void lesEcransDePosteContinuent() throws Exception {
            licenceExpiree();

            record Route(String nom, MockHttpServletRequestBuilder r) {
            }
            List<Route> postes = List.of(
                    new Route("passages d'un point (SectorView, CDI)", get("/api/access/logs/PORT1")),
                    // ⚠️ CE QUE LE MONITEUR CANTINE LIT VRAIMENT (CantineMonitor.js:418).
                    // Classe FERME au depart : la salle apparaissait VIDE a 11h50, et la
                    // couche HTTP rend [] sur un refus — l'ecran mentait sans rien dire.
                    new Route("Moniteur Cantine — les passages du service",
                            get("/api/access/logs/refectory")),
                    new Route("parametres de rapport", get("/api/access/report-config")),
                    new Route("fil des refus — cantine", get("/api/access/attempts/refectory")),
                    new Route("fil des refus — portail", get("/api/access/attempts/gate")),
                    new Route("verdict de regime au portail", get("/api/admin/regimes/gate/PORT1")),
                    new Route("etat du CDI", get("/api/admin/cdi/etat")),
                    new Route("retraits du Moniteur Cantine", get("/api/admin/cantine/removals")),
                    new Route("encore a l'interieur", get("/api/presence/auto-close/preview")),
                    new Route("userCache de toutes les vitres", get("/api/users")),
                    new Route("recherche de personnes", get("/api/users/search?q=test")),
                    new Route("parcours du jour", get("/api/admin/parcours/search?q=test")),
                    new Route("etat de la licence", get("/api/licence")),
                    new Route("sonde de sante", get("/api/health")));

            for (Route route : postes) {
                assertThat(statut(route.r()))
                        .as("ECRAN DE POSTE FERME PAR LA LICENCE : %s. Une licence expiree "
                                + "avertit, elle n'eteint pas un poste de travail.", route.nom())
                        .isNotEqualTo(402);
            }
        }

        /**
         * ⚠️ Le déblocage d'un mot de passe reste ouvert : c'est la seule
         * action de gestion dont le but est de rendre son accès à quelqu'un.
         */
        @Test
        @DisplayName("le deblocage d'un mot de passe reste possible")
        void leDeblocageResteOuvert() throws Exception {
            licenceExpiree();
            assertThat(statut(get("/api/admin/password-reset-requests"))).isNotEqualTo(402);
            assertThat(statut(post("/api/auth/password-reset-request")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"quelquun\"}"))).isNotEqualTo(402);
        }

        /**
         * ⚠️ Le système ne doit pas se verrouiller hors de sa propre
         * réparation : c'est par cette route que Sam renouvelle à distance.
         */
        @Test
        @DisplayName("★ la relecture de licence reste possible (renouvellement a distance)")
        void laRelectureResteOuverte() throws Exception {
            licenceExpiree();
            assertThat(statut(post("/api/admin/licence/recharger"))).isNotEqualTo(402);
        }
    }

    // ═════════════════════════════════════════════════════════════════
    @Nested
    @DisplayName("★★ CE QUI SE FERME, licence expiree")
    class CeQuiSeFerme {

        /** Un écran de gestion, nommé, avec la route qui le sert. */
        private List<Object[]> ecransDeGestion() {
            return List.of(
                    new Object[]{"configuration du systeme", get("/api/admin/settings/catalogue")},
                    new Object[]{"planning cantine", get("/api/admin/meal-slots")},
                    new Object[]{"gestion des operateurs", get("/api/system-users")},
                    new Object[]{"droits repas", get("/api/admin/meal-entitlements/summary")},
                    new Object[]{"importation — droits repas",
                            post("/api/admin/meal-entitlements/bulk")
                                    .contentType(MediaType.APPLICATION_JSON).content("[]")},
                    new Object[]{"importation — personnel", get("/api/users/staff")},
                    new Object[]{"importation — photos", get("/api/admin/photos/summary")},
                    new Object[]{"importation — Pronote", post("/api/pronote/sync")},
                    new Object[]{"export CSV HikCentral",
                            get("/api/admin/hikvision-mapping/export-csv")},
                    new Object[]{"rapports — statistiques globales", get("/api/stats/global")},
                    new Object[]{"rapports — vue consolidee", get("/api/access/overview")},
                    new Object[]{"rapports — journal", get("/api/access/logs/all")},
                    new Object[]{"rapports — cantine", get("/api/access/refectory/meals")},
                    new Object[]{"rapports — infirmerie", get("/api/access/infirmary/visits")},
                    new Object[]{"rapports — tentatives refusees", get("/api/access/attempts")},
                    new Object[]{"regimes de sortie", get("/api/admin/regimes/summary")},
                    new Object[]{"autorisations de sortie", get("/api/admin/exit-permissions/active")},
                    new Object[]{"exclusions CDI", get("/api/admin/cdi/exclusions")},
                    new Object[]{"grille des classes", get("/api/admin/class-schedules")},
                    new Object[]{"correspondance des terminaux", get("/api/admin/door-mappings")});
        }

        @Test
        @DisplayName("★★ chaque ecran de GESTION repond 402")
        void chaqueEcranDeGestionSeFerme() throws Exception {
            licenceExpiree();

            for (Object[] e : ecransDeGestion()) {
                assertThat(statut((MockHttpServletRequestBuilder) e[1]))
                        .as("ECRAN DE GESTION ENCORE OUVERT sous licence expiree : %s", e[0])
                        .isEqualTo(402);
            }
        }

        // ─────────────────────────────────────────────────────────────
        // ⚠️ LE CONTOURNEMENT PAR URI PERCENT-ENCODÉE N'EST PAS TESTÉ ICI,
        //    ET C'EST DÉLIBÉRÉ.
        // ─────────────────────────────────────────────────────────────
        // Spring MVC route sur le chemin DÉCODÉ ; tant que la grille comparait
        // le chemin brut, `/api/admin/s%65ttings/catalogue` atteignait le
        // contrôleur et recevait 200 sous licence expirée — pour le prix d'un
        // caractère encodé (panel de revue, sécurité, 31/08/2026).
        //
        // ⚠️ MockMvc NE PEUT PAS reproduire ce scénario : son constructeur de
        // requête traite l'URL comme un gabarit d'URI et rejette le `%` avant
        // que la requête n'existe — mesuré, il rend 400, ni 402 ni 200. Un test
        // écrit ici affirmerait donc quelque chose qu'il ne vérifie pas, ce qui
        // est pire que pas de test du tout.
        //
        // La preuve vit à deux endroits, tous deux réels :
        //   · `LicenceGateCheminTest` — confronte le chemin extrait aux règles,
        //     sur cinq formes encodées, sans passer par MockMvc ;
        //   · la vérification manuelle contre un backend qui tourne, consignée
        //     dans le rapport de la branche (curl sur l'URI encodée -> 402).

        /**
         * ⚠️ SANS CE TEST, UN GATE CASSÉ EN POSITION « TOUJOURS FERMÉ »
         * passerait tout le reste de cette classe. C'est le volet qui rend la
         * preuve symétrique.
         */
        @Test
        @DisplayName("★★ licence VALIDE : les memes ecrans rouvrent")
        void licenceValideRouvreTout() throws Exception {
            licenceValide();

            for (Object[] e : ecransDeGestion()) {
                String nom = (String) e[0];
                int statut = statut((MockHttpServletRequestBuilder) e[1]);

                assertThat(statut)
                        .as("ECRAN DE GESTION FERME alors que la licence est VALIDE : %s", nom)
                        .isNotEqualTo(402);

                // ⚠️ Et il doit RÉPONDRE, pas seulement échapper à la grille.
                if (!PG_ONLY_SOUS_H2.contains(nom)) {
                    assertThat(statut)
                            .as("« %s » rouvre bien (pas de 402) mais RÉPOND %d : le test ne "
                                    + "prouverait rien s'il se contentait du premier point.",
                                    nom, statut)
                            .isLessThan(500);
                }
            }
        }

        /**
         * ⚠️ 402 ET PAS 403. Le front traite 403 comme « session expirée » et
         * déconnecte : un refus de licence en 403 dirait « Reconnectez-vous » à
         * quelqu'un dont la session est parfaitement valide. C'est la classe de
         * défaut la plus chère déjà payée dans ce projet.
         */
        @Test
        @DisplayName("★★ le refus dit POURQUOI, en francais, et n'est pas un 403")
        void leRefusExpliqueEnFrancais() throws Exception {
            licenceExpiree();

            MvcResult r = mockMvc.perform(get("/api/admin/settings/catalogue")
                            .header(HttpHeaders.AUTHORIZATION, jetonAdmin))
                    .andReturn();

            assertThat(r.getResponse().getStatus())
                    .as("403 ferait croire au front que la session a expire")
                    .isEqualTo(402);

            String corps = r.getResponse().getContentAsString();
            assertThat(corps)
                    .as("le corps doit parler le dialecte {error:...} que le front affiche tel quel")
                    .contains("\"error\"")
                    .contains("période d'utilisation")
                    .contains("gestion sont suspendues")
                    .contains("sammagbo@gmail.com");
            assertThat(corps)
                    .as("le message doit etre ACCENTUE : du francais sans accents dans une "
                            + "interface accentuee se lit comme un bug d'affichage")
                    .contains("période", "arrivée", "supprimée");
            assertThat(corps)
                    .as("le message doit dire ce qui CONTINUE, pas seulement ce qui s'arrete")
                    .contains("passages")
                    .contains("PPMS");
        }

        @Test
        @DisplayName("l'etat de la licence est lisible meme expiree")
        void etatLisible() throws Exception {
            licenceExpiree();

            mockMvc.perform(get("/api/licence").header(HttpHeaders.AUTHORIZATION, jetonAdmin))
                    .andExpect(status().isOk())
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                            .jsonPath("$.etat").value("EXPIREE"))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                            .jsonPath("$.gestionOuverte").value(false))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                            .jsonPath("$.contact").value("sammagbo@gmail.com"));
        }
    }
}
