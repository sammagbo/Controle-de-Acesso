package com.magbo.access.controllers;

import com.magbo.access.models.SystemUser;
import com.magbo.access.security.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ⚠️ CE FICHIER EXISTE À CAUSE D'UNE NUIT PERDUE (3 au 4 septembre 2026).
 *
 * <p>Un poste affichait « Identifiants invalides » avec un mot de passe qu'on
 * croyait juste. Une fois prouvé que le serveur rejetait vraiment ces
 * identifiants — l'application, elle, envoyait la bonne requête à la bonne
 * adresse, mesuré —, il restait la vraie question : <b>POURQUOI</b> ?
 *
 * <p>Le système ne pouvait pas y répondre. Trois causes arrivaient au même
 * point avec le même visage, la réponse HTTP était identique, le journal ne
 * disait que le nom d'utilisateur, et le temps de réponse est délibérément
 * égalisé par Spring (mesuré : 165 ms dans les trois cas, à 6 ms près).
 *
 * <p>Ces tests gardent la distinction. Ils échouent sur le code d'avant, où
 * {@code RaisonEchecLogin} n'existait pas.
 */
class RaisonEchecLoginTest {

    private static SystemUser compte(boolean actif) {
        return SystemUser.builder()
                .username("admin")
                .passwordHash("$2a$10$peu.importe")
                .nomeCompleto("Administrador")
                .role(Role.ADMIN)
                .ativo(actif)
                .build();
    }

    @Test
    @DisplayName("★ un compte ACTIF qui échoue, c'est le mot de passe — et rien d'autre")
    void compteActif() {
        assertThat(RaisonEchecLogin.classer(Optional.of(compte(true)), 1))
                .isEqualTo(RaisonEchecLogin.MOT_DE_PASSE_INCORRECT);
    }

    @Test
    @DisplayName("★★ un compte DÉSACTIVÉ se distingue — c'est le cas qu'on ne voyait pas")
    void compteDesactive() {
        // ⚠️ LE CŒUR DU DÉFAUT. `UserDetailsServiceImpl` lève la MÊME exception
        // pour « inconnu » et pour « désactivé », et Spring l'aplatit ensuite en
        // BadCredentialsException. Sans cette classification, personne — pas
        // même l'exploitant lisant les journaux — ne pouvait savoir qu'aucun mot
        // de passe ne marcherait jamais.
        assertThat(RaisonEchecLogin.classer(Optional.of(compte(false)), 1))
                .isEqualTo(RaisonEchecLogin.COMPTE_DESACTIVE);
    }

    @Test
    @DisplayName("★ ativo à null vaut désactivé — le code lit Boolean.TRUE.equals, pas un booléen")
    void ativoNul() {
        SystemUser sansAtivo = compte(true);
        sansAtivo.setAtivo(null);
        assertThat(RaisonEchecLogin.classer(Optional.of(sansAtivo), 1))
                .isEqualTo(RaisonEchecLogin.COMPTE_DESACTIVE);
    }

    @Test
    @DisplayName("★ aucun compte de ce nom")
    void inconnu() {
        assertThat(RaisonEchecLogin.classer(Optional.empty(), 0))
                .isEqualTo(RaisonEchecLogin.UTILISATEUR_INCONNU);
    }

    @Test
    @DisplayName("★★ deux comptes à la casse près : findByUsernameFlexivel refuse de choisir")
    void homonymes() {
        // ⚠️ CAS RÉEL, PAS THÉORIQUE : la production porte `VS` et `vs`
        // (relevé du 03/09/2026, docs/operacional/handoff.md). Quelqu'un qui
        // tape `Vs` ne correspond exactement à aucun des deux ; la recherche
        // tolérante refuse alors d'arbitrer et rend vide. Le compte devient
        // « inconnu » avec le BON mot de passe, et le journal doit le dire,
        // sinon on cherche du côté du mot de passe pour rien.
        // ⚠️ `TI` / `ccc` N'EST PAS un exemple de ce cas, contrairement à ce
        // qu'affirmait la première version de ce commentaire : le même relevé
        // les appelle « doublons APPARENTS » — deux noms différents, peut-être
        // de la même personne. Deux noms qui ne diffèrent pas par la CASSE ne
        // peuvent jamais atteindre cette branche.
        assertThat(RaisonEchecLogin.classer(Optional.empty(), 2))
                .isEqualTo(RaisonEchecLogin.HOMONYMES_AMBIGUS);
    }

    @Test
    @DisplayName("★★ classer() ne rend JAMAIS INDETERMINABLE — cette valeur n'appartient qu'à la garde")
    void classerNeProduitJamaisIndeterminable() {
        // INDETERMINABLE dit « le diagnostic lui-même a échoué ». Seul le
        // try/catch d'AuthController.diagnostiquer peut l'écrire. Si classer()
        // se mettait à la rendre, le journal dirait « la base n'a pas répondu »
        // alors que la base a très bien répondu — et on chercherait la panne
        // dans la mauvaise machine.
        SystemUser sansAtivo = compte(true);
        sansAtivo.setAtivo(null);
        for (Optional<SystemUser> exact : List.of(
                Optional.<SystemUser>empty(),
                Optional.of(compte(true)),
                Optional.of(compte(false)),
                Optional.of(sansAtivo))) {
            for (int homonymes = 0; homonymes <= 3; homonymes++) {
                assertThat(RaisonEchecLogin.classer(exact, homonymes))
                        .isNotEqualTo(RaisonEchecLogin.INDETERMINABLE);
            }
        }
    }

    @Test
    @DisplayName("★ chaque raison porte une explication en clair, sans jargon de framework")
    void explications() {
        for (RaisonEchecLogin r : RaisonEchecLogin.values()) {
            assertThat(r.explication()).isNotBlank();
            assertThat(r.explication().toLowerCase())
                    .doesNotContain("exception")
                    .doesNotContain("spring");
        }
        // celle qui compte doit dire ce qu'il faut faire, pas seulement ce qui s'est passé
        assertThat(RaisonEchecLogin.COMPTE_DESACTIVE.explication())
                .contains("ativo=false")
                .contains("AUCUN mot de passe");
    }
}
