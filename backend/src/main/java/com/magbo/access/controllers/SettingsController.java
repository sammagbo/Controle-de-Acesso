package com.magbo.access.controllers;

import com.magbo.access.models.SystemSetting;
import com.magbo.access.services.SettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * OS REGLAGES MODIFICAVEIS A ECRA (system_settings, V024).
 *
 * ⚠️ LEITURA E ESCRITA pela MESMA permissao (CONFIG_WRITE) — ao contrario das
 * outras telas, onde a leitura e por area. A lista dos reglages diz como o
 * sistema esta afinado (tetos, capacidades, turmas dispensadas): nao ha dado
 * de pessoa aqui, mas ha o mapa completo do comportamento do sistema, e esse
 * mapa e assunto de administracao, nao de operacao.
 *
 * ⚠️ NUNCA um segredo por aqui — o SettingsService nao os aceita e o V024
 * documenta porque. Tokens e senhas ficam no ambiente.
 */
@RestController
@RequestMapping("/api/admin/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;
    private final com.magbo.access.services.SettingsCatalog catalog;

    private static final String GATE =
            "hasRole('ADMIN') or @areaSecurity.hasPermission('CONFIG_WRITE')";

    private String quem() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    /**
     * O CATALOGO COMPLETO — o que o ecra de configuracao desenha: cada reglage
     * com o valor de agora, o valor de fabrica, e quem o mudou pela ultima vez.
     *
     * ⚠️ Um reglage no default nao tem linha em `system_settings`; e por isso
     * que este endpoint existe e o `GET /` cru nao chega. Um ecra construido
     * so com as linhas gravadas mostraria uma lista VAZIA numa base nova, e
     * quem a abrisse concluiria que nao ha nada para configurar.
     */
    @GetMapping("/catalogue")
    @PreAuthorize(GATE)
    public List<Map<String, Object>> catalogo() {
        return catalog.comValores();
    }

    /** As linhas GRAVADAS (as chaves no default nao tem linha — e o contrato). */
    @GetMapping
    @PreAuthorize(GATE)
    public List<Map<String, Object>> gravados() {
        return settingsService.gravados().stream().map(this::dto).toList();
    }

    /**
     * Grava um reglage. Corpo {"valor": "..."} — valor vazio ou ausente VOLTA
     * AO DEFAULT (apaga a linha): e uma acao de primeira classe do ecra.
     */
    @PutMapping("/{chave}")
    @PreAuthorize(GATE)
    public ResponseEntity<?> gravar(@PathVariable String chave,
                                    @RequestBody(required = false) Map<String, String> corpo) {
        try {
            settingsService.gravar(chave, corpo == null ? null : corpo.get("valor"), quem());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }

    private Map<String, Object> dto(SystemSetting s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("chave", s.getChave());
        m.put("valor", s.getValor());
        m.put("updatedBy", s.getUpdatedBy());
        m.put("updatedAt", String.valueOf(s.getUpdatedAt()));
        return m;
    }
}
