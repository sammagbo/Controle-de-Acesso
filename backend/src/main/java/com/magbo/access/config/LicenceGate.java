package com.magbo.access.config;

import com.magbo.access.services.licence.LicencePortee;
import com.magbo.access.services.licence.LicenceService;
import com.magbo.access.services.licence.LicenceVerdict;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.util.UrlPathHelper;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.nio.charset.StandardCharsets;

/**
 * LA GRILLE : refuse les routes de GESTION quand la licence est expirée.
 *
 * <h3>⚠️ Un intercepteur, et pas des annotations sur chaque méthode</h3>
 * Poser {@code @PreAuthorize("@licence.ouverte()")} sur une centaine de
 * méthodes aurait donné cent endroits où l'oublier, et aucun moyen mécanique
 * de savoir lequel manque. Ici la décision vit dans un inventaire unique
 * ({@link LicencePortee}) que {@code LicencePorteeGuardTest} confronte à la
 * liste réelle des endpoints : un endpoint nouveau rend le test rouge tant que
 * personne n'a écrit dans quelle case il tombe.
 *
 * <h3>⚠️ 402 et pas 403 — le statut a une histoire dans ce projet</h3>
 * Le front traite {@code 403} comme « session expirée » et déconnecte. Un
 * refus de licence rendu en 403 dirait donc « Session expirée. Reconnectez-vous »
 * à quelqu'un dont la session est parfaitement valide — exactement la classe de
 * défaut la plus chère déjà payée ici (l'importation de repas qui accusait la
 * session pour une erreur de format de date). {@code 402 Payment Required} ne
 * peut être confondu avec aucun code d'authentification, et le corps
 * {@code {"error": "..."}} est le dialecte que {@code razaoDoServidor()} du
 * front affiche tel quel : le message français arrive intact à l'écran.
 *
 * <h3>⚠️ Ce qui n'est PAS ici</h3>
 * Aucune règle de sécurité. {@code @PreAuthorize} et {@code AreaSecurity}
 * continuent de gouverner qui voit quoi, dans les quatre états de la licence.
 * Cette grille est une couche commerciale posée par-dessus, et elle ne peut
 * qu'ajouter un refus — jamais en retirer un.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class LicenceGate implements HandlerInterceptor {

    private final LicenceService licenceService;

    /**
     * ⚠️ Le message est en français, et il dit les trois choses qui comptent :
     * que la période est arrivée à son terme, que ce sont les fonctions de
     * GESTION qui sont suspendues, et que l'enregistrement des passages et la
     * liste PPMS continuent. Ton neutre : ni menace, ni excuse.
     *
     * ⚠️ Il est écrit ici en dur, et pas pris dans les dictionnaires du front :
     * une requête refusée peut arriver d'un outil, d'un script, d'un curl de
     * diagnostic. Le message doit être lisible sans l'application.
     *
     * ⚠️ ET IL EST ACCENTUÉ. La première version ne l'était pas, au motif qu'il
     * doit se lire depuis un {@code curl} — mauvais raisonnement : la réponse
     * déclare déjà {@code charset=UTF-8}. Du français sans accents au milieu
     * d'une interface entièrement accentuée se lit comme un <b>bug
     * d'affichage</b>, ce qui pousse le lecteur vers « le système est cassé » —
     * exactement la conclusion que tout ce dispositif existe pour empêcher.
     * (Panel de revue — Vie Scolaire, 31/08/2026.)
     *
     * ⚠️ « Aucune donnée n'a été supprimée » est là parce que c'est la première
     * question de quelqu'un d'inquiet, et que le message ne parlait que du
     * futur. Et le contact porte un NOM : dans six mois, personne dans l'école
     * ne saura à qui appartient une adresse seule.
     */
    static final String MESSAGE =
            "La période d'utilisation de MAGBO Access Control est arrivée à son terme. "
                    + "Les fonctions de gestion sont suspendues. "
                    + "Aucune donnée n'a été supprimée : l'enregistrement des passages et la "
                    + "liste PPMS continuent de fonctionner normalement. "
                    + "Pour renouveler, contacter MAGBO STUDIO — sammagbo@gmail.com";

    /**
     * Le chemin sur lequel les patrons Ant sont confrontés : le chemin
     * applicatif <b>DÉCODÉ</b>, contexte et paramètres de matrice retirés.
     *
     * <h4>⚠️ Deux pièges ont été payés ici, et aucun des deux n'est du style</h4>
     *
     * <b>1. Pas {@code getServletPath()}.</b> Sous MockMvc il renvoie la chaîne
     * VIDE : la grille laissait tout passer dans les tests, et
     * {@code LicenceExpireeIT} — le test censé prouver que les écrans de
     * gestion se ferment — passait au vert en ne prouvant rien. Mesuré :
     * {@code /api/admin/settings/catalogue} répondait 200 sous licence
     * expirée, intercepteur bien enregistré et verdict bien à EXPIREE.
     *
     * <b>2. Pas {@code getRequestURI()} brut non plus.</b> Spring MVC route sur
     * le chemin <b>décodé</b> ; comparer le chemin brut laisse un contournement
     * à un {@code curl} : {@code /api/admin/s%65ttings/catalogue} atteint le
     * contrôleur, mais {@code AntPathMatcher} ne le reconnaît pas comme
     * {@code /api/admin/settings/**} et il retombe sur une règle ouverte. Le
     * même tour marche sur n'importe quelle règle FERMÉE, et il est
     * infiniment moins cher que « recompiler le backend », qui est le seul
     * contournement assumé (ADR-006). {@code UrlPathHelper} décode et retire
     * les {@code ;params} exactement comme le fait Spring Security, ce qui
     * aligne la grille sur ce que le routage voit réellement.
     *
     * (Signalé par le panel de revue — sécurité — le 31/08/2026, avec la
     * mesure. Verrouillé par {@code LicenceGateCheminTest}.)
     */
    static String cheminDansLApplication(HttpServletRequest request) {
        String chemin = UrlPathHelper.defaultInstance.getPathWithinApplication(request);
        return chemin == null || chemin.isEmpty() ? "/" : chemin;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!licenceService.gateActif()) return true;

        String verbe = request.getMethod();

        // ⚠️ OPTIONS toujours laissé passer : c'est le prevol CORS du
        // navigateur. Le refuser ferait echouer la requete AVANT qu'elle
        // n'existe, et le front afficherait une erreur reseau au lieu du
        // message de licence.
        if ("OPTIONS".equalsIgnoreCase(verbe)) return true;

        String chemin = cheminDansLApplication(request);

        // ═══════════════════════════════════════════════════════════════
        // ⚠️⚠️ LA PORTÉE D'ABORD, LE VERDICT ENSUITE — ET L'ORDRE EST TOUT
        // ═══════════════════════════════════════════════════════════════
        // La première version demandait le verdict AVANT de regarder si la
        // route était seulement fermable. Conséquence : le webhook, le PPMS et
        // /api/health — les trois routes que l'ADR-006 déclare intouchables —
        // traversaient `LicenceService.etat()`, qui peut ouvrir une transaction
        // (l'anti-recul) et qui est `synchronized`.
        //
        // Le scénario, signalé par le panel de revue (qualité, 31/08/2026) :
        // la base devient injoignable à 23h55 ; à 00h01 le jour a changé, donc
        // `etat()` réévalue ; l'intercepteur transactionnel lève avant même
        // d'entrer dans le corps de `reculDetecte` (pool épuisé, Postgres qui
        // redémarre) ; l'exception remonte jusqu'ici et le WEBHOOK répond 500 —
        // c'est-à-dire une passage d'enfant perdue, à cause de la licence.
        // Pire : `evaluer()` étant `synchronized`, la première requête retient
        // le moniteur pendant tout le délai d'attente et TOUT /api/** s'empile
        // derrière.
        //
        // Avec la portée testée en premier, une route ouverte ne touche JAMAIS
        // au verdict. La licence ne peut plus rien casser de ce qu'elle promet
        // de préserver.
        if (!LicencePortee.ferme(verbe, chemin)) return true;

        LicenceVerdict v = licenceService.etat();
        if (v == null || v.gestionOuverte()) return true;

        LicencePortee.Regle regle = LicencePortee.regleDe(verbe, chemin);
        log.info("Licence expiree ({}) — refus de {} {} [regle : {}]",
                v.motif(), verbe, chemin, regle == null ? "?" : regle.motif());

        response.setStatus(402); // Payment Required
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        try {
            // Corps minimal et ecrit a la main : pas d'ObjectMapper a injecter
            // pour trois champs, et le message ne contient ni guillemet ni
            // antislash (verifie par LicenceGateMessageTest).
            response.getWriter().write("{\"error\":\"" + MESSAGE + "\","
                    + "\"licence\":\"EXPIREE\","
                    + "\"motif\":\"" + v.motif() + "\"}");
        } catch (Exception e) {
            log.warn("Licence — impossible d'ecrire le corps du refus : {}", e.getMessage());
        }
        return false;
    }
}
