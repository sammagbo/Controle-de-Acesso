package com.magbo.access.controllers;

import com.magbo.access.models.SystemUser;

import java.util.Optional;

/**
 * POURQUOI UNE CONNEXION A ÉCHOUÉ — la question à laquelle le système ne
 * savait pas répondre.
 *
 * <p>⚠️ CETTE CLASSE EXISTE À CAUSE DE LA NUIT DU 3 AU 4 SEPTEMBRE 2026.
 * L'écran d'un poste affichait « Identifiants invalides » avec un mot de passe
 * qu'on croyait juste. Il a fallu une nuit pour établir que le serveur
 * rejetait vraiment ces identifiants — et, une fois cela établi, <b>il était
 * impossible de savoir pourquoi</b> :
 *
 * <ul>
 *   <li>{@code UserDetailsServiceImpl} lève {@code UsernameNotFoundException}
 *       aussi bien pour un compte <b>inconnu</b> que pour un compte
 *       <b>désactivé</b> ;</li>
 *   <li>{@code DaoAuthenticationProvider} convertit ensuite cela en
 *       {@code BadCredentialsException} ({@code hideUserNotFoundExceptions}
 *       vaut {@code true} par défaut) — donc l'information est détruite
 *       <b>avant</b> d'arriver au contrôleur ;</li>
 *   <li>{@code AuthController} attrapait {@code Exception} et journalisait
 *       seulement {@code username=} : ni la cause, ni le type ;</li>
 *   <li>et le canal du <b>temps de réponse</b> est délibérément égalisé par
 *       Spring (encodage factice quand l'utilisateur est introuvable) —
 *       mesuré cette nuit-là : 165 ms dans les trois cas, à 6 ms près.</li>
 * </ul>
 *
 * <p>Trois causes, un seul message, aucune trace : de l'extérieur comme de
 * l'intérieur, le système était muet. C'est ce silence qui a coûté la nuit,
 * pas le refus lui-même.
 *
 * <p><b>⚠️ LA RÉPONSE HTTP NE CHANGE PAS, ET C'EST VOULU.</b> Dire à
 * l'appelant « ce compte existe mais il est désactivé » livrerait la liste des
 * comptes à qui essaie des noms au hasard. La distinction vit dans le
 * <b>journal du serveur</b>, que seul l'exploitant lit. Le test
 * {@code LoginReponseUniformeIT} vérifie que les trois cas rendent un corps
 * identique — octet pour octet.
 *
 * <p>On classe en interrogeant la base plutôt qu'en inspectant l'exception :
 * l'exception a déjà été aplatie par Spring, et dépendre de son type
 * enchaînerait ce diagnostic à un détail interne du framework.
 */
public enum RaisonEchecLogin {

    /** Aucun compte ne porte ce nom. */
    UTILISATEUR_INCONNU("utilisateur inconnu"),

    /**
     * Le compte existe mais {@code ativo} n'est pas vrai.
     * ⚠️ C'est le cas qu'on ne pouvait pas voir, et le seul des trois qui se
     * répare sans connaître aucun mot de passe.
     */
    COMPTE_DESACTIVE("compte desactive (ativo=false) — AUCUN mot de passe ne marchera"),

    /** Le compte existe, il est actif : c'est le mot de passe qui ne correspond pas. */
    MOT_DE_PASSE_INCORRECT("mot de passe incorrect"),

    /**
     * Plusieurs comptes portent ce nom à la casse près, et aucun ne correspond
     * exactement. ⚠️ Cas réel, et un seul : la production porte à la fois
     * {@code VS} et {@code vs} (relevé du 03/09/2026,
     * {@code docs/operacional/handoff.md}). ⚠️ NE PAS y ajouter {@code TI} /
     * {@code ccc}, que le même relevé appelle « doublons <b>apparents</b> » :
     * ce sont deux noms différents, peut-être de la même personne — ils ne
     * peuvent jamais atteindre cette branche, qui ne parle que de casse.
     * {@code findByUsernameFlexivel} refuse alors de choisir, et le compte
     * devient inconnu — même en tapant le bon mot de passe.
     */
    HOMONYMES_AMBIGUS("plusieurs comptes a la casse pres, aucun exact — findByUsernameFlexivel refuse de choisir"),

    /**
     * ⚠️ LE DIAGNOSTIC LUI-MÊME N'A PAS PU ABOUTIR — et il n'a pas le droit
     * d'entraîner la requête avec lui.
     *
     * <p>Classer, c'est interroger la base. Si la panne EST la base, cette
     * interrogation échoue à son tour — et elle échoue depuis l'intérieur du
     * bloc {@code catch}, là où plus rien ne la rattrape ({@code grep -rl
     * ControllerAdvice} sur les sources : zéro). Sans garde, la réponse
     * passerait de {@code 401} à un {@code 500} qui nomme le chemin, et la
     * ligne de journal — le seul produit de ce chantier — ne serait jamais
     * écrite : le diagnostic disparaîtrait exactement dans la panne où il
     * sert le plus.
     *
     * <p>⚠️ {@link #classer} ne rend JAMAIS cette valeur. Elle est produite
     * par la garde d'{@code AuthController}, et par elle seule.
     */
    INDETERMINABLE("impossible de determiner : la base n'a pas repondu au diagnostic");

    private final String explication;

    RaisonEchecLogin(String explication) {
        this.explication = explication;
    }

    /** La phrase écrite dans le journal, en clair, sans jargon de framework. */
    public String explication() {
        return explication;
    }

    /**
     * Classe l'échec à partir de l'état réel de la base.
     *
     * @param exact      le compte trouvé par la recherche tolérante, s'il y en a un
     * @param homonymes  le nombre de comptes portant ce nom à la casse près
     */
    public static RaisonEchecLogin classer(Optional<SystemUser> exact, int homonymes) {
        if (exact.isPresent()) {
            return Boolean.TRUE.equals(exact.get().getAtivo())
                    ? MOT_DE_PASSE_INCORRECT
                    : COMPTE_DESACTIVE;
        }
        return homonymes > 1 ? HOMONYMES_AMBIGUS : UTILISATEUR_INCONNU;
    }
}
