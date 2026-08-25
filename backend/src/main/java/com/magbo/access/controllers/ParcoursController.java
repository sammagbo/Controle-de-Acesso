package com.magbo.access.controllers;

import com.magbo.access.config.AreaMapping;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.StudentSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * LE PARCOURS DU JOUR D'UNE PERSONNE — chaque passage, et ou elle est.
 *
 * ⚠️ GARDE PAR PERMISSION, ET C'EST LE POINT. Les recherches existantes
 * (`/api/users/search`, `/api/users/students/search`) sont en
 * `isAuthenticated()` — la dette de securite n.1 du projet. Ce controleur NE LA
 * REUTILISE PAS et n'y touche pas : il refait le chemin derriere
 * `PARCOURS_READ`, en appelant le meme `StudentSearchService` en INTERNE. La
 * dette reste ou elle est, exactement de la meme taille.
 *
 * ⚠️ POURQUOI UNE PERMISSION ET PAS UNE AIRE. Un parcours est la journee
 * entiere d'une personne, tous points confondus — ou elle est entree, a quelle
 * heure, ou elle est allee ensuite. C'est plus que ce que n'importe quelle
 * AIRE donne : l'operateur de la cantine voit la cantine, pas le passage a
 * l'infirmerie. Meme raisonnement que `PPMS_READ` en 14/08 : restreindre, pas
 * fermer.
 *
 * ⚠️ ET L'ECRAN N'AFFIRME JAMAIS UNE PRESENCE QUE LE SYSTEME N'A PAS VUE. Le
 * dernier evenement decide, et il n'y a que trois reponses possibles — voir
 * {@link #ondeEsta}.
 */
@RestController
@RequestMapping("/api/admin/parcours")
@RequiredArgsConstructor
public class ParcoursController {

    private final StudentSearchService studentSearchService;
    private final UserRepository userRepository;
    private final AccessLogRepository accessLogRepository;

    private static final String GATE =
            "hasRole('ADMIN') or @areaSecurity.hasPermission('PARCOURS_READ')";

    /** Recherche par nom ou par turma. Meme service, garde differente. */
    @GetMapping("/search")
    @PreAuthorize(GATE)
    public List<Map<String, Object>> buscar(@RequestParam String q,
                                            @RequestParam(required = false) Integer limit) {
        return studentSearchService.buscar(q, limit).stream().map(u -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("nome", u.getNome());
            m.put("turma", u.getTurma());
            m.put("tipo", u.getTipo() == null ? null : u.getTipo().name());
            return m;
        }).toList();
    }

    /**
     * Le parcours d'aujourd'hui.
     *
     * ⚠️ La journee commence a MINUIT LOCALE, comme le Moniteur Cantine. Une
     * fenetre glissante de 24 h ferait apparaitre hier soir dans le parcours
     * d'aujourd'hui, et personne ne lit un parcours comme ca.
     */
    @GetMapping("/{userId}")
    @PreAuthorize(GATE)
    public ResponseEntity<?> parcours(@PathVariable String userId) {
        Optional<User> alvo = userRepository.findById(userId);
        if (alvo.isEmpty()) return ResponseEntity.notFound().build();

        LocalDateTime inicio = LocalDate.now().atStartOfDay();
        // ⚠️ Consulta indexada (indice (user_id) da V019). Um findAll()
        // filtrado em Java varreria ~440 mil linhas a cada tecla.
        List<AccessLog> logs = accessLogRepository
                .findByUserIdAndTimestampGreaterThanEqualOrderByTimestampAsc(userId, inicio);

        List<Map<String, Object>> passagens = logs.stream().map(l -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("hora", l.getTimestamp().toLocalTime().withNano(0).toString());
            m.put("pointId", l.getPointId());
            m.put("area", AreaMapping.areaForPoint(l.getPointId()));
            m.put("action", l.getAction() == null ? null : l.getAction().name());
            // La marque de repetition voyage avec la ligne : une entree marquee
            // POSTO_FIXO n'ouvre pas de visite, et un parcours qui la presente
            // comme une arrivee raconterait une journee qui n'a pas eu lieu.
            m.put("flag", l.getFlag());
            return m;
        }).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("userId", alvo.get().getId());
        out.put("nome", alvo.get().getNome());
        out.put("turma", alvo.get().getTurma());
        out.put("tipo", alvo.get().getTipo() == null ? null : alvo.get().getTipo().name());
        out.put("passagens", passagens);
        out.putAll(ondeEsta(logs));
        return ResponseEntity.ok(out);
    }

    /**
     * OU EST CETTE PERSONNE — et les trois seules reponses honnetes.
     *
     * ⚠️ UN DERNIER EVENEMENT `SAIDA` VEUT DIRE «SORTIE», PAS UNE ZONE. C'est
     * la faute que cet ecran ne doit pas commettre : afficher le point de la
     * derniere ligne comme si la personne y etait encore, alors que la ligne
     * dit precisement le contraire. Quelqu'un qui cherche un enfant irait au
     * mauvais endroit.
     *
     * ⚠️ ET AUCUNE PASSAGE NE VEUT PAS DIRE «ABSENT». Le systeme ne voit que ce
     * que les lecteurs lui montrent : un enfant entre par une porte non
     * equipee, ou dont la lecture a echoue, n'a pas de ligne — et il est a
     * l'ecole. `INCONNU` est la reponse vraie ; «absent» serait une affirmation
     * que rien ne soutient, sur un ecran ou quelqu'un pourrait la croire.
     */
    private Map<String, Object> ondeEsta(List<AccessLog> logs) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (logs.isEmpty()) {
            m.put("estado", "INCONNU");
            m.put("ponto", null);
            m.put("desde", null);
            return m;
        }
        AccessLog ultimo = logs.get(logs.size() - 1);
        boolean saiu = ultimo.getAction() == AccessAction.SAIDA;
        m.put("estado", saiu ? "SORTI" : "DANS");
        // ⚠️ Sur SORTI le point est celui d'OU la personne est sortie, et
        // l'etiquette de l'ecran doit le dire ainsi. Le champ existe pour
        // raconter d'ou, jamais pour repondre «ou».
        m.put("ponto", ultimo.getPointId());
        m.put("desde", ultimo.getTimestamp().toLocalTime().withNano(0).toString());
        return m;
    }
}
