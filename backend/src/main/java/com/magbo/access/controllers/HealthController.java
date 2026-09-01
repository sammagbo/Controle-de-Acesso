package com.magbo.access.controllers;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.magbo.access.services.licence.LicenceService;
import com.magbo.access.services.licence.LicenceVerdict;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@Slf4j
public class HealthController {

    private final DataSource dataSource;
    private final LicenceService licenceService;

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> result = new LinkedHashMap<>();

        boolean dbUp = checkDatabase();

        result.put("status", dbUp ? "UP" : "DEGRADED");
        result.put("database", dbUp ? "CONNECTED" : "DOWN");
        result.put("service", "MAGBO Access Control Backend");
        result.put("timestamp", Instant.now().toString());
        result.put("version", "1.0.0");

        // ⚠️ L'ÉTAT DE LA LICENCE EST ICI POUR UNE RAISON PRÉCISE : vérifier un
        // déploiement sans ouvrir l'application, ni se connecter. Le scénario
        // redouté n'est pas la fraude — c'est un montage de volume oublié qui
        // ferme les écrans de gestion pendant que l'auteur est dans un avion.
        // Une seule commande curl doit pouvoir dire « la licence est lue, elle
        // est valide, elle expire à telle date ».
        //
        // ⚠️ Aucune donnée personnelle, et rien qui ne figure déjà sur le
        // bandeau affiché à l'écran : un état, une date, un motif. La route est
        // publique (permitAll) et ce contenu doit le rester.
        //
        // ⚠️⚠️ ET TOUT CECI EST SOUS try/catch, PARCE QUE CETTE SONDE DOIT
        // RÉPONDRE EXACTEMENT QUAND LA BASE EST TOMBÉE. `etat()` peut ouvrir une
        // transaction (l'anti-recul) : sans cette garde, la seule commande que
        // `CLAUDE.md` et les trois README de déploiement donnent pour
        // diagnostiquer une panne devenait elle-même un 500 pendant la panne.
        // `checkDatabase()` juste au-dessus est déjà écrit comme ça — il aurait
        // été absurde de lui adjoindre un appel non gardé.
        // (Panel de revue — qualité, 31/08/2026.)
        Map<String, Object> l = new LinkedHashMap<>();
        try {
            LicenceVerdict licence = licenceService.etat();
            l.put("etat", licence == null ? "INDISPONIBLE" : licence.etat().name());
            l.put("motif", licence == null ? "INDISPONIBLE" : licence.motif().name());
            l.put("expireLe", licence == null || licence.expireLe() == null
                    ? null : licence.expireLe().toString());
            l.put("gestionOuverte", licence == null || licence.gestionOuverte());
        } catch (Exception e) {
            log.warn("Licence — etat indisponible pour la sonde de sante : {}", e.toString());
            l.put("etat", "INDISPONIBLE");
            l.put("motif", e.getClass().getSimpleName());
            l.put("expireLe", null);
            // ⚠️ `true` : ne pas laisser une panne de sonde ressembler a une
            // fermeture. Ce champ est informatif ; l'autorite est LicenceGate.
            l.put("gestionOuverte", true);
        }
        result.put("licence", l);

        return ResponseEntity.ok(result);
    }

    private boolean checkDatabase() {
        try (Connection conn = dataSource.getConnection()) {
            return conn.isValid(3); // 3-second timeout
        } catch (Exception e) {
            log.warn("Database health check failed: {}", e.getMessage());
            return false;
        }
    }
}
