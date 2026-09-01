package com.magbo.access.controllers;

import com.magbo.access.models.LicenceClock;
import com.magbo.access.services.licence.LicenceHorloge;
import com.magbo.access.services.licence.LicenceService;
import com.magbo.access.services.licence.LicenceVerdict;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * L'ÉTAT DE LA LICENCE — ce que le bandeau lit.
 *
 * ⚠️ CE QUE CETTE ROUTE NE FAIT PAS : décider. Le front affiche l'état qu'il
 * reçoit ; c'est {@code LicenceGate}, côté serveur, qui refuse effectivement
 * les routes de gestion. Un poste dont on remplacerait le {@code .exe} par une
 * version antérieure n'obtiendrait rien de plus qu'un bandeau manquant.
 *
 * ⚠️ AUCUNE DONNÉE PERSONNELLE ici : un nom d'établissement, deux dates, un
 * identifiant de licence. C'est pourquoi la lecture est {@code isAuthenticated()}
 * et pas une permission : chaque écran doit pouvoir demander s'il y a un
 * bandeau à afficher, et c'est le FRONT qui décide à qui le montrer (ADMIN et
 * direction en état ALERTE ; plus largement une fois la période dépassée, parce
 * qu'alors quelqu'un peut se heurter à un écran fermé et mérite de savoir
 * pourquoi).
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class LicenceController {

    private final LicenceService licenceService;
    private final LicenceHorloge horloge;

    /** Contact de renouvellement, affiché tel quel par le bandeau. */
    static final String CONTACT = "sammagbo@gmail.com";

    @GetMapping("/api/licence")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> etat() {
        return ResponseEntity.ok(dto(licenceService.etat()));
    }

    /**
     * Relit le fichier depuis le disque, tout de suite.
     *
     * ⚠️ C'EST LE GESTE DU RENOUVELLEMENT À DISTANCE : quelqu'un dépose le
     * nouveau fichier sur la VM, un compte ADMIN appelle ceci, et l'école
     * repart — sans redémarrage de conteneur, sans accès SSH pour Sam.
     *
     * ⚠️ Ce n'est PAS un contournement : la relecture repasse par la signature.
     * Un fichier absent reste absent, un fichier falsifié reste falsifié. Le
     * seul pouvoir de cet endpoint est de raccourcir l'attente d'un jour.
     *
     * ⚠️ ADMIN strictement, et pas CONFIG_WRITE : c'est le geste qui rouvre le
     * système entier.
     */
    @PostMapping("/api/admin/licence/recharger")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> recharger() {
        String quem = SecurityContextHolder.getContext().getAuthentication().getName();
        log.info("Licence — relecture du fichier demandee par {}", quem);
        return ResponseEntity.ok(dto(licenceService.recharger()));
    }

    private Map<String, Object> dto(LicenceVerdict v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("etat", v.etat().name());
        m.put("motif", v.motif().name());
        m.put("gestionOuverte", v.gestionOuverte());
        m.put("bandeau", v.etat().bandeau());
        m.put("etablissement", v.etablissement());
        m.put("licenceId", v.licenceId());
        m.put("emisLe", v.emisLe() == null ? null : v.emisLe().toString());
        m.put("expireLe", v.expireLe() == null ? null : v.expireLe().toString());
        // ⚠️ null plutôt que Long.MIN_VALUE quand il n'y a pas de licence : un
        // nombre sentinelle qui arrive au front finit toujours par s'afficher.
        m.put("joursRestants", v.joursRestants() == Long.MIN_VALUE ? null : v.joursRestants());
        m.put("contact", CONTACT);
        m.put("grilleActive", licenceService.gateActif());

        // Le témoin d'horloge : lisible ici pour que le diagnostic d'un recul
        // ne demande pas un accès à la base.
        //
        // ⚠️ `dateMaxVue` SEUL NE SUFFIT PAS, et c'est ce qui a été corrigé :
        // la décision peut venir du REGISTRE des passages, pas de la table.
        // Quelqu'un qui appliquait la réparation documentée lisait « borne =
        // aujourd'hui, aucun recul apparent » à côté d'un motif
        // HORLOGE_RECULEE — le cadran ne montrait pas l'aiguille qui décide.
        // `referenceDate` + `referenceTemoin` disent laquelle a parlé.
        // (Panel de revue, ronde 2, 31/08/2026.)
        try {
            LicenceClock t = horloge.temoin();
            m.put("dateMaxVue", t == null || t.getDateMaxVue() == null
                    ? null : t.getDateMaxVue().toString());
            m.put("reculDetecteLe", t == null || t.getReculDetecteLe() == null
                    ? null : t.getReculDetecteLe().toString());

            LicenceHorloge.Reference ref = horloge.reference();
            m.put("referenceDate", ref.date() == null ? null : ref.date().toString());
            m.put("referenceTemoin", ref.temoin());
        } catch (Exception e) {
            // Même doctrine que la sonde de santé : une base indisponible ne
            // doit pas empêcher de lire l'état de la licence.
            log.warn("Licence — temoin d'horloge illisible pour l'ecran d'etat : {}", e.toString());
            m.put("dateMaxVue", null);
            m.put("reculDetecteLe", null);
            m.put("referenceDate", null);
            m.put("referenceTemoin", "indisponible");
        }
        return m;
    }
}
