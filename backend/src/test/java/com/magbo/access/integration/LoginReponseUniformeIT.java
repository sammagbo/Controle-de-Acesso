package com.magbo.access.integration;

import ch.qos.logback.classic.Level;
import com.magbo.access.controllers.AuthController;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * LA RÉPONSE À UN ÉCHEC DE CONNEXION EST LA MÊME POUR TOUT LE MONDE.
 *
 * <p>⚠️ Ce test garde les DEUX moitiés d'une même décision, prise la nuit du 3
 * au 4 septembre 2026 après une nuit passée à ne pas savoir pourquoi un poste
 * refusait une connexion :
 *
 * <ol>
 *   <li><b>Le serveur DIT la cause</b> — dans son journal, pour l'exploitant
 *       ({@link com.magbo.access.controllers.RaisonEchecLogin}). Sans cela,
 *       un compte désactivé et un mot de passe faux sont indiscernables même
 *       pour qui a accès à la machine.</li>
 *   <li><b>Mais la RÉPONSE ne dit rien</b> — même statut, même corps, octet
 *       pour octet. Sinon, essayer des noms au hasard révélerait lesquels
 *       existent : le système livrerait sa liste de comptes à quiconque sait
 *       lire un code de retour.</li>
 * </ol>
 *
 * <p>La deuxième moitié est celle qu'on casse par accident en voulant « aider
 * l'utilisateur ». D'où ce test : il échoue à la seconde où quelqu'un
 * différencie la réponse d'un compte désactivé de celle d'un mot de passe
 * faux, même avec les meilleures intentions.
 *
 * <p>⚠️ ET LA PREMIÈRE MOITIÉ SE GARDE ICI AUSSI. Dans sa première version, ce
 * fichier annonçait garder « les DEUX moitiés » et n'en gardait qu'une : il
 * passait intégralement sur le code d'AVANT le chantier, puisqu'un corps
 * constant reste égal à lui-même même si la classification disparaît. Les deux
 * tests de journal ci-dessous ferment ce trou de bout en bout, à travers le
 * vrai Spring Security ; {@code AuthControllerDiagnosticGuardTest} le ferme
 * côté unitaire, là où l'on peut simuler une base qui ne répond pas.
 */
class LoginReponseUniformeIT extends AbstractIT {

    @Autowired SystemUserRepository systemUserRepository;
    @Autowired PasswordEncoder encoder;

    private void compte(String username, String senha, boolean ativo) {
        systemUserRepository.save(SystemUser.builder()
                .username(username)
                .passwordHash(encoder.encode(senha))
                .nomeCompleto("Compte " + username)
                .role(Role.OPERATOR)
                .setoresPermitidos("*")
                .ativo(ativo)
                .build());
    }

    private MvcResult tenter(String u, String p) throws Exception {
        return mockMvc.perform(MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(APPLICATION_JSON)
                        .content("{\"username\":\"" + u + "\",\"password\":\"" + p + "\"}"))
                .andExpect(status().isUnauthorized())
                .andReturn();
    }

    @Test
    @DisplayName("★★ compte désactivé, mot de passe faux et compte inconnu rendent la MÊME réponse")
    void memeReponsePourLesTroisCauses() throws Exception {
        compte("UNIF_ACTIF", "senha-forte-1", true);
        compte("UNIF_INACTIF", "senha-forte-1", false);

        // 1. compte actif, mot de passe faux
        MvcResult motDePasseFaux = tenter("UNIF_ACTIF", "ce-n-est-pas-le-bon");
        // 2. compte DÉSACTIVÉ, avec le BON mot de passe — aucun ne marchera jamais
        MvcResult desactive = tenter("UNIF_INACTIF", "senha-forte-1");
        // 3. compte qui n'existe pas
        MvcResult inconnu = tenter("UNIF_FANTOME", "peu-importe");

        String a = motDePasseFaux.getResponse().getContentAsString();
        String b = desactive.getResponse().getContentAsString();
        String c = inconnu.getResponse().getContentAsString();

        assertThat(a).isEqualTo(b);
        assertThat(b).isEqualTo(c);

        // ⚠️ et le corps ne doit nommer NI le compte, NI son état : une réponse
        // qui répète le nom d'utilisateur confirme déjà son existence à qui
        // l'essaie.
        assertThat(a.toLowerCase())
                .doesNotContain("unif_")
                .doesNotContain("ativo")
                .doesNotContain("desativ")
                .doesNotContain("disabled")
                .doesNotContain("not found");

        // le statut aussi : 401 pour les trois, jamais 403 (que le front lit
        // comme « session expirée ») ni 404 (qui dirait que le compte manque).
        assertThat(motDePasseFaux.getResponse().getStatus()).isEqualTo(401);
        assertThat(desactive.getResponse().getStatus()).isEqualTo(401);
        assertThat(inconnu.getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    @DisplayName("★★ un compte désactivé ne se connecte pas, même avec le bon mot de passe")
    void desactiveNePasseJamais() throws Exception {
        compte("UNIF_FERME", "senha-forte-1", true);
        // il marche tant qu'il est actif
        mockMvc.perform(MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(APPLICATION_JSON)
                        .content("{\"username\":\"UNIF_FERME\",\"password\":\"senha-forte-1\"}"))
                .andExpect(status().isOk());

        SystemUser u = systemUserRepository.findByUsername("UNIF_FERME").orElseThrow();
        u.setAtivo(false);
        systemUserRepository.save(u);

        // ⚠️ le MÊME mot de passe, désormais refusé — et c'est exactement le cas
        // qu'on ne pouvait pas nommer avant RaisonEchecLogin.
        tenter("UNIF_FERME", "senha-forte-1");
    }

    @Test
    @DisplayName("★★ le JOURNAL, lui, nomme le compte désactivé — là où la réponse se tait")
    void journalNommeLeCompteDesactive() throws Exception {
        // ⚠️ Noms neufs à chaque méthode : AbstractIT.limparTabelasMutaveis ne
        // vide PAS system_users, et username est UNIQUE. Réutiliser un nom
        // d'une autre méthode ferait dépendre le test de l'ordre du surefire.
        compte("UNIF_JRN_INACTIF", "senha-forte-1", false);

        try (LogCaptor journal = new LogCaptor(AuthController.class)) {
            // le BON mot de passe, et pourtant refusé : c'est le cas que
            // personne ne pouvait nommer, pas même en lisant les journaux.
            tenter("UNIF_JRN_INACTIF", "senha-forte-1");

            assertThat(journal.count(Level.WARN, "raison=COMPTE_DESACTIVE")).isEqualTo(1);
            assertThat(journal.count(Level.WARN, "AUCUN mot de passe")).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("★★★ jumeaux de casse tapés AVEC des espaces : le journal dit les jumeaux, pas « inconnu »")
    void journalNommeLesJumeauxMemeAvecDesEspaces() throws Exception {
        compte("UNIF_JRN_WZ", "senha-forte-1", true);
        compte("unif_jrn_wz", "senha-forte-2", true);

        try (LogCaptor journal = new LogCaptor(AuthController.class)) {
            // ⚠️ LES ESPACES SONT LE TEST, et sans eux il ne prouve rien.
            // findByUsernameFlexivel rogne en interne ; le compteur d'homonymes
            // doit rogner AUSSI. Tapé sans espaces, ce scénario passe au vert
            // même si quelqu'un retire le .trim() d'AuthController — et le
            // journal dirait alors « utilisateur inconnu » d'un nom qui existe
            // en double, renvoyant l'exploitant chercher un compte fantôme.
            tenter("  Unif_Jrn_Wz  ", "senha-forte-1");

            assertThat(journal.count(Level.WARN, "raison=HOMONYMES_AMBIGUS")).isEqualTo(1);
            assertThat(journal.count(Level.WARN, "raison=UTILISATEUR_INCONNU")).isZero();
        }
    }
}
