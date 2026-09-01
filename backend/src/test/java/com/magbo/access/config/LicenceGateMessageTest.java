package com.magbo.access.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * LE MESSAGE À L'ÉCRAN — ce qu'il dit, et ce qu'il ne dit pas.
 *
 * ⚠️ POURQUOI CE TEST EXISTE. Le corps du refus est un JSON écrit à la main
 * (trois champs ne justifient pas d'injecter un ObjectMapper dans un
 * intercepteur). C'est acceptable tant que le message ne contient ni guillemet
 * ni antislash — sinon il produirait un JSON cassé, que le front n'arriverait
 * pas à lire, et le message français n'arriverait jamais à l'écran : on aurait
 * le refus sans l'explication, qui est le pire des deux mondes.
 *
 * ⚠️ Et le TON. Le cahier des charges est explicite : neutre et professionnel,
 * ni menace, ni excuse. Un test ne juge pas un ton, mais il peut vérifier que
 * les quatre choses à dire sont dites — et que les mots qu'on ne veut pas voir
 * n'y sont pas.
 */
@DisplayName("Licence — le message a l'ecran")
class LicenceGateMessageTest {

    @Test
    @DisplayName("★★ le message est sur d'etre insere dans du JSON ecrit a la main")
    void surPourLeJson() {
        assertThat(LicenceGate.MESSAGE)
                .as("un guillemet ou un antislash casserait le corps de la reponse, et le "
                        + "front n'afficherait plus la raison du refus")
                .doesNotContain("\"")
                .doesNotContain("\\")
                .doesNotContain("\n");
    }

    /**
     * ⚠️ Les quatre choses que le message DOIT dire. La troisième est la plus
     * importante : quelqu'un qui lit ce message pendant un incident doit
     * comprendre tout de suite que le registre et le PPMS fonctionnent encore.
     */
    @Test
    @DisplayName("★★ il dit les quatre choses qui comptent")
    void ditLesQuatreChoses() {
        String m = LicenceGate.MESSAGE;

        assertThat(m).as("1. la periode est arrivee a son terme").contains("terme");
        assertThat(m).as("2. ce sont les fonctions de GESTION qui sont suspendues")
                .contains("gestion").contains("suspendues");
        assertThat(m).as("3. les passages et le PPMS CONTINUENT")
                .contains("passages").contains("PPMS").contains("continuent");
        assertThat(m).as("4. a qui ecrire pour renouveler").contains("sammagbo@gmail.com");
    }

    /**
     * ⚠️ NI MENACE, NI EXCUSE. Le vocabulaire du blocage et celui de la
     * contrition sont tous deux hors sujet : l'école n'a rien fait de mal, et
     * rien n'est « bloqué » — des écrans d'administration sont suspendus
     * pendant que le reste travaille.
     */
    @Test
    @DisplayName("le ton reste neutre : ni menace, ni excuse")
    void tonNeutre() {
        String m = LicenceGate.MESSAGE.toLowerCase();
        for (String mot : new String[]{"bloqu", "interdit", "illegal", "violation",
                "desole", "navre", "excus", "malheureusement", "immediatement"}) {
            assertThat(m).as("mot hors ton : « %s »", mot).doesNotContain(mot);
        }
    }
}
