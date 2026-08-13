package com.magbo.access.controllers;

import com.magbo.access.dto.RegimeDecision;
import com.magbo.access.dto.RegimeRequest;
import com.magbo.access.models.*;
import com.magbo.access.repositories.StudentRegimeRepository;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.RegimeSortieService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * RÉGIME DE SORTIE — leitura pelo portão, escrita pela Vie Scolaire.
 *
 * ⚠️ A separação de permissões segue o que o projeto já faz em
 * ExitPermissionController: LEITURA por área ('portail' — quem opera o portão
 * precisa ver o regime de quem está saindo) e ESCRITA por permissão granular
 * REGIME_WRITE, que é da Vie Scolaire.
 *
 * Um operador de portaria PODE ver que o aluno é regime 1. Não pode transformá-lo
 * em regime 3 — isso é uma declaração dos responsáveis legais, e quem a registra
 * é a Vie Scolaire, com o papel assinado na mão.
 */
@RestController
@RequestMapping("/api/admin/regimes")
@RequiredArgsConstructor
@Slf4j
public class StudentRegimeController {

    private final RegimeSortieService regimeService;
    private final StudentRegimeRepository regimeRepository;
    private final UserRepository userRepository;

    /** O veredicto AGORA para um aluno — é o que a tela do portão consome. */
    @GetMapping("/evaluate/{userId}")
    @PreAuthorize("@areaSecurity.can('portail')")
    public ResponseEntity<RegimeDecision> avaliar(@PathVariable String userId) {
        return ResponseEntity.ok(regimeService.avaliar(userId, LocalDateTime.now()));
    }

    /** Regime vigente + histórico de um aluno. */
    @GetMapping("/user/{userId}")
    @PreAuthorize("@areaSecurity.can('portail')")
    public ResponseEntity<Map<String, Object>> doAluno(@PathVariable String userId) {
        Map<String, Object> out = new HashMap<>();
        out.put("vigente", regimeService.vigenteDe(userId).orElse(null));
        out.put("historico", regimeService.historicoDe(userId));
        out.put("eventos", regimeService.eventosDe(userId));
        return ResponseEntity.ok(out);
    }

    /**
     * Quantos alunos têm regime, e quantos não têm.
     *
     * ⚠️ O número que importa é o SEM regime: no dia 1 são 923, e é ele que diz
     * à Vie Scolaire quanto falta do trabalho de carregar os papéis. Um resumo
     * que só contasse os cadastrados esconderia justamente o que está faltando.
     */
    @GetMapping("/summary")
    @PreAuthorize("@areaSecurity.can('portail')")
    public ResponseEntity<Map<String, Object>> resumo() {
        List<StudentRegime> vigentes = regimeRepository.findTodosVigentes(LocalDate.now());

        // Só ALUNO entra na conta: regime de sortie não existe para servidor, e
        // somar os 201 servidores ao denominador faria a Vie Scolaire perseguir
        // um total que nunca fecha.
        long totalAlunos = userRepository.findAll().stream()
                .filter(u -> u.getTipo() == UserType.ALUNO && Boolean.TRUE.equals(u.getAtivo()))
                .count();

        Map<String, Long> porSortie = new HashMap<>();
        for (RegimeSortie rs : RegimeSortie.values()) {
            porSortie.put(rs.name(), vigentes.stream().filter(v -> v.getRegimeSortie() == rs).count());
        }
        Map<String, Long> porGeneral = new HashMap<>();
        for (RegimeGeneral rg : RegimeGeneral.values()) {
            porGeneral.put(rg.name(), vigentes.stream().filter(v -> v.getRegimeGeneral() == rg).count());
        }

        Map<String, Object> out = new HashMap<>();
        out.put("comRegime", (long) vigentes.size());
        out.put("totalAlunos", totalAlunos);
        out.put("semRegime", Math.max(0, totalAlunos - vigentes.size()));
        out.put("porRegimeSortie", porSortie);
        out.put("porRegimeGeneral", porGeneral);
        return ResponseEntity.ok(out);
    }

    /** Cadastra ou substitui. O anterior é encerrado, nunca apagado. */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('REGIME_WRITE')")
    public ResponseEntity<?> definir(@RequestBody RegimeRequest req, Authentication auth) {
        try {
            StudentRegime r = regimeService.definir(
                    req.getUserId(), req.getRegimeGeneral(), req.getRegimeSortie(),
                    req.getValidFrom(), req.getValidUntil(),
                    req.getAuthorizedByFamily(), req.getDocumentoRef(),
                    req.getAssinadoEm(), req.getNote(),
                    auth == null ? "system" : auth.getName(), "UI");
            return ResponseEntity.ok(r);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    /** Encerra o regime vigente sem criar outro (o aluno deixou a escola). */
    @DeleteMapping("/user/{userId}")
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('REGIME_WRITE')")
    public ResponseEntity<?> encerrar(@PathVariable String userId,
                                      @RequestParam(required = false) String note,
                                      Authentication auth) {
        try {
            regimeService.encerrar(userId, auth == null ? "system" : auth.getName(), note);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }
}
