package com.magbo.access.controllers;

import com.magbo.access.models.CdiExclusion;
import com.magbo.access.models.User;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.EventTimeResolver;
import com.magbo.access.services.CdiExclusionService;
import com.magbo.access.services.SettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

/**
 * LE CDI — capacite, etat d'occupation, et exclusions.
 *
 * ⚠️ DEUX NIVEAUX DE GARDE, ET LA DIFFERENCE EST LE POINT :
 *
 *   `/etat`       — la CAPACITE et l'etat (ferme/reserve). Lecture par AIRE
 *                   (`cdi`) : ce sont des NOMBRES sur une salle, et le
 *                   bibliothecaire en a besoin a chaque badge.
 *
 *   `/exclusions` — lecture ET ecriture par PERMISSION (`CDI_EXCLUSION_WRITE`),
 *                   jamais par aire. Une exclusion nomme un ENFANT et raconte
 *                   une SANCTION. Un operateur du CDI voit l'alerte quand la
 *                   personne badge (l'ecran la recoit avec l'etat), mais la
 *                   LISTE de qui est exclu, avec les motifs, est une autre
 *                   chose — et elle ne s'ouvre pas «parce qu'on est connecte».
 *
 * ⚠️ AUCUNE de ces routes ne ferme une porte. Le terminal ouvre de toute
 * facon (ADR-003) : on informe l'adulte present, fort et clair.
 */
@RestController
@RequestMapping("/api/admin/cdi")
@RequiredArgsConstructor
public class CdiController {

    private final CdiExclusionService exclusionService;
    private final SettingsService settingsService;
    private final UserRepository userRepository;

    /** Ecriture ET lecture des exclusions — donnee sensible sur mineur. */
    private static final String GATE_EXCLUSOES =
            "hasRole('ADMIN') or @areaSecurity.hasPermission('CDI_EXCLUSION_WRITE')";

    public static final String CHAVE_CAPACIDADE = "magbo.cdi.capacidade";
    public static final String CHAVE_ESTADO     = "magbo.cdi.estado";
    public static final String CHAVE_ESTADO_DE  = "magbo.cdi.estado-inicio";
    public static final String CHAVE_ESTADO_ATE = "magbo.cdi.estado-fim";
    public static final String CHAVE_ESTADO_NOTA = "magbo.cdi.estado-nota";

    /** Le defaut historique du CDI, qui vivait en dur dans js/cdi/cdiData.js. */
    public static final int CAPACIDADE_PADRAO = 50;

    private String quem() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    /**
     * L'etat du CDI : capacite, occupation declaree, et les exclusions ACTIVES.
     *
     * ⚠️ Les exclusions actives voyagent AVEC l'etat, sans motif ni auteur —
     * juste de quoi reconnaitre la personne au badge. L'ecran du CDI doit
     * pouvoir alerter sans avoir le droit de LIRE la liste complete.
     */
    @GetMapping("/etat")
    @PreAuthorize("@areaSecurity.can('cdi')")
    public Map<String, Object> etat() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("capacidade", settingsService.efetivoInt(CHAVE_CAPACIDADE, CAPACIDADE_PADRAO));
        out.put("estado", settingsService.efetivo(CHAVE_ESTADO, "OUVERT"));
        out.put("estadoInicio", settingsService.efetivo(CHAVE_ESTADO_DE, ""));
        out.put("estadoFim", settingsService.efetivo(CHAVE_ESTADO_ATE, ""));
        out.put("estadoNota", settingsService.efetivo(CHAVE_ESTADO_NOTA, ""));

        List<Map<String, Object>> alvos = new ArrayList<>();
        for (CdiExclusion e : exclusionService.ativas()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", e.getUserId());
            m.put("turma", e.getTurma());
            // ⚠️ NI motif NI auteur ici : l'ecran a besoin de RECONNAITRE, pas
            // de raconter. Le motif est dans /exclusions, derriere la permission.
            // ⚠️ La DATE DE FIN passe, le motif jamais. « Exclu jusqu'au 5 »
            // donne au bibliothecaire une phrase a dire a l'enfant ; « exclu
            // pour insultes » raconte la sanction a toute la file. Les deux
            // repondent a des questions differentes et seule la premiere lui
            // appartient.
            m.put("ate", e.getAte() == null ? null : e.getAte().toString());
            alvos.add(m);
        }
        out.put("exclusoesAtivas", alvos);
        return out;
    }

    /** La liste COMPLETE, avec motifs et auteurs — derriere la permission. */
    @GetMapping("/exclusions")
    @PreAuthorize(GATE_EXCLUSOES)
    public List<Map<String, Object>> exclusoes() {
        return exclusionService.todas().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("userId", e.getUserId());
            m.put("nome", e.getUserId() == null ? null
                    : userRepository.findById(e.getUserId()).map(User::getNome).orElse(null));
            m.put("turma", e.getTurma());
            m.put("motivo", e.getMotivo());
            m.put("ate", e.getAte() == null ? null : e.getAte().toString());
            m.put("criadoPor", e.getCriadoPor());
            m.put("criadoEm", String.valueOf(e.getCriadoEm()));
            m.put("revogadoPor", e.getRevogadoPor());
            m.put("revogadoEm", e.getRevogadoEm() == null ? null : String.valueOf(e.getRevogadoEm()));
            // ⚠️ Horloge de l'ECOLE, pas celle de la JVM. Le conteneur ne
            // porte `TZ` que depuis `deploy/docker-compose.yml` ; le jour ou
            // quelqu'un surcharge TZ dans le .env, la pastille « active »
            // basculerait a 21h. Le service, lui, l'a toujours fait.
            m.put("ativa", e.ativaEm(LocalDate.now(EventTimeResolver.ZONA_ESCOLA)));
            return m;
        }).toList();
    }

    @PostMapping("/exclusions")
    @PreAuthorize(GATE_EXCLUSOES)
    public ResponseEntity<?> criar(@RequestBody Map<String, String> b) {
        try {
            LocalDate ate = (b.get("ate") == null || b.get("ate").isBlank())
                    ? null : LocalDate.parse(b.get("ate"));
            return ResponseEntity.ok(exclusionService.criar(
                    b.get("userId"), b.get("turma"), b.get("motivo"), ate, quem()));
        } catch (IllegalArgumentException | java.time.format.DateTimeParseException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }

    /** Levee SOFT : la ligne reste, l'historique reste. */
    @DeleteMapping("/exclusions/{id}")
    @PreAuthorize(GATE_EXCLUSOES)
    public ResponseEntity<?> levantar(@PathVariable Long id) {
        try {
            exclusionService.levantar(id, quem());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }

    /**
     * Capacite et etat d'occupation — des REGLAGES, donc CONFIG_WRITE.
     *
     * ⚠️ Pas `CDI_EXCLUSION_WRITE` : changer la capacite d'une salle et
     * inscrire une sanction sur un enfant ne demandent pas la meme confiance.
     */
    @PutMapping("/etat")
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('CONFIG_WRITE')")
    public ResponseEntity<?> gravarEstado(@RequestBody Map<String, String> b) {
        try {
            if (b.containsKey("capacidade")) {
                String v = b.get("capacidade");
                if (v != null && !v.isBlank()) {
                    int n = Integer.parseInt(v.trim());
                    if (n < 1) throw new IllegalArgumentException("capacidade deve ser >= 1");
                }
                settingsService.gravar(CHAVE_CAPACIDADE, v, quem());
            }
            for (String k : List.of("estado", "estadoInicio", "estadoFim", "estadoNota")) {
                if (!b.containsKey(k)) continue;
                String chave = switch (k) {
                    case "estado" -> CHAVE_ESTADO;
                    case "estadoInicio" -> CHAVE_ESTADO_DE;
                    case "estadoFim" -> CHAVE_ESTADO_ATE;
                    default -> CHAVE_ESTADO_NOTA;
                };
                settingsService.gravar(chave, b.get(k), quem());
            }
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }
}
