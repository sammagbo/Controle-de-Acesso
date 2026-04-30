package com.magbo.access.controllers;

import com.magbo.access.dto.SyncReport;
import com.magbo.access.services.PronoteSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pronote")
@RequiredArgsConstructor
@Slf4j
public class PronoteController {

    private final PronoteSyncService pronoteSyncService;

    /**
     * Trigger manual da sincronização Pronote.
     * Chamado pelo botão "Sincronizar Agora" do AdminDashboard.
     */
    @PostMapping("/sync")
    public ResponseEntity<SyncReport> triggerSync() {
        log.info("Trigger manual de sincronização Pronote recebido");
        SyncReport report = pronoteSyncService.syncPronoteData();

        // Se houve erros, retornar 207 Multi-Status para indicar sucesso parcial
        // (mas mantemos 200 OK por simplicidade — o frontend lê os contadores)
        return ResponseEntity.ok(report);
    }
}
