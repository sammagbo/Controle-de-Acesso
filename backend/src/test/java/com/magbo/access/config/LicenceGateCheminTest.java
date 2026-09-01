package com.magbo.access.config;

import com.magbo.access.services.licence.LicencePortee;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * LE CHEMIN QUE LA GRILLE COMPARE — deux pièges déjà payés.
 *
 * <h3>⚠️ Piège 1 : {@code getServletPath()} est VIDE sous MockMvc</h3>
 * La première version l'utilisait. Résultat : la grille laissait tout passer
 * dans les tests, et {@code LicenceExpireeIT} — le test censé prouver que les
 * écrans de gestion se ferment — passait au vert <b>en ne prouvant rien</b>.
 * C'est la pire espèce de défaut : un test vert qui certifie l'inverse de la
 * réalité.
 *
 * <h3>⚠️ Piège 2 : le chemin BRUT laisse un contournement à un {@code curl}</h3>
 * Spring MVC route sur le chemin <b>décodé</b>. Comparer {@code getRequestURI()}
 * brut avec {@code AntPathMatcher} donnait ceci, mesuré le 31/08/2026 par le
 * panel de revue (sécurité) :
 * <pre>
 *   /api/admin/settings/**  vs  /api/admin/s%65ttings/catalogue  ->  false
 *   /api/access/**          vs  /api/access/logs/%61ll           ->  true (regle OUVERTE)
 * </pre>
 * Autrement dit : {@code curl .../api/admin/s%65ttings/catalogue} atteignait le
 * contrôleur et recevait 200 sous licence expirée. Le tour marchait sur
 * <b>toutes</b> les règles fermées, pour le prix d'un caractère encodé — c'est-à-dire
 * infiniment moins cher que « recompiler le backend », qui est le seul
 * contournement assumé par l'ADR-006. Une licence dont le contournement coûte
 * un {@code curl} n'est pas une licence.
 *
 * <h3>Ce que ce test ne prétend pas</h3>
 * La grille n'est pas une frontière de sécurité : {@code @PreAuthorize} et
 * {@code AreaSecurity} décodent, eux, et n'ont jamais été concernés. Ce qui est
 * en jeu ici est la crédibilité du mécanisme commercial, pas la protection des
 * données.
 */
@DisplayName("Licence — le chemin compare par la grille")
class LicenceGateCheminTest {

    private static String chemin(String uri) {
        MockHttpServletRequest r = new MockHttpServletRequest("GET", uri);
        r.setRequestURI(uri);
        return LicenceGate.cheminDansLApplication(r);
    }

    /**
     * ⚠️ LE TEST QUI FERME LE CONTOURNEMENT. Chacune de ces URI atteint le même
     * contrôleur que sa forme non encodée ; la grille doit donc la refuser de
     * la même façon.
     */
    @ParameterizedTest
    @ValueSource(strings = {
            "/api/admin/settings/catalogue",
            "/api/admin/s%65ttings/catalogue",   // 'e' encode
            "/api/admin/settings/catalogu%65",
            "/api/%61dmin/settings/catalogue",   // 'a' encode
            "/api/admin/settings/catalogue;jsessionid=X"  // parametre de matrice
    })
    @DisplayName("★★ un caractere encode ne fait pas passer une route FERMEE")
    void encodageNeContournePas(String uri) {
        assertThat(LicencePortee.ferme("GET", chemin(uri)))
                .as("""
                    %s doit rester FERMEE.

                    Spring MVC route sur le chemin DECODE : cette URI atteint le meme
                    controleur que sa forme normale. Si la grille compare le chemin BRUT,
                    la regle ne matche pas, la requete retombe sur une regle ouverte, et
                    la licence se contourne avec un curl.""", uri)
                .isTrue();
    }

    /** Et les routes ouvertes le restent — la correction ne ferme rien de plus. */
    @ParameterizedTest
    @ValueSource(strings = {
            "/api/ppms/inside",
            "/api/hikvision/webhook",
            "/api/access/logs/PORT1",
            "/api/admin/regimes/gate/PORT1",
            "/api/users"
    })
    @DisplayName("★★ les routes qui doivent CONTINUER restent ouvertes")
    void lesRoutesOuvertesLeRestent(String uri) {
        assertThat(LicencePortee.ferme("GET", chemin(uri)))
                .as("%s doit continuer de fonctionner, licence expiree ou non", uri)
                .isFalse();
    }

    /**
     * ⚠️ Le contexte applicatif est retiré. Vide en Spring Boot embarqué, mais
     * pas si quelqu'un déploie un jour derrière un préfixe — et alors toutes
     * les règles cesseraient de correspondre d'un coup, en silence.
     */
    @Test
    @DisplayName("le contexte applicatif est retire du chemin")
    void contexteRetire() {
        MockHttpServletRequest r = new MockHttpServletRequest("GET", "/magbo/api/ppms/inside");
        r.setRequestURI("/magbo/api/ppms/inside");
        r.setContextPath("/magbo");

        assertThat(LicenceGate.cheminDansLApplication(r)).isEqualTo("/api/ppms/inside");
    }

    /**
     * ⚠️ La régression du premier piège, figée. Si quelqu'un revient un jour à
     * {@code getServletPath()}, ce test tombe — et pas seulement lui : c'est
     * toute la preuve de {@code LicenceExpireeIT} qui redeviendrait creuse.
     */
    @Test
    @DisplayName("★★ le chemin n'est jamais vide (la regression getServletPath)")
    void jamaisVide() {
        MockHttpServletRequest r = new MockHttpServletRequest("GET", "/api/admin/settings");
        r.setRequestURI("/api/admin/settings");
        // MockHttpServletRequest laisse servletPath a "" : c'est exactement la
        // condition dans laquelle la premiere version rendait la grille inerte.
        assertThat(r.getServletPath()).as("le piege existe bien").isEmpty();

        assertThat(LicenceGate.cheminDansLApplication(r))
                .as("la grille ne doit pas dependre de servletPath")
                .isEqualTo("/api/admin/settings");
    }
}
