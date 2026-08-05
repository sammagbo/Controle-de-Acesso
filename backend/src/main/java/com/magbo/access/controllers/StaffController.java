package com.magbo.access.controllers;

import com.magbo.access.dto.StaffRegistrationDto;
import com.magbo.access.models.User;
import com.magbo.access.services.StaffRegistrationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Cadastro de SERVIDORES da escola (professores, Vie Scolaire, servicos gerais,
 * administracao, direcao).
 *
 * Endpoints proprios, fora de /api/users, para que o cadastro de ALUNO — 923
 * pessoas que chegam por sincronizacao Pronote — nao compartilhe validacao com
 * um fluxo que tem regras diferentes.
 *
 * As respostas SEMPRE dizem o que aconteceu. O formulario antigo mandava o
 * POST, o banco recusava e a tela dizia "sucesso": o operador so descobria que
 * nao havia cadastrado ninguem quando a face nao era reconhecida no terminal.
 */
@RestController
@RequestMapping("/api/users/staff")
@RequiredArgsConstructor
@Slf4j
public class StaffController {

    private final StaffRegistrationService staffRegistrationService;
    private final com.magbo.access.services.HikCentralImportService hikCentralImportService;
    private final com.magbo.access.services.StaffAdminService staffAdminService;

    // ── Manutenção do cadastro de servidores ─────────────────────────────
    // A importação do HikCentral cria FUNC-### para toda linha fora do
    // departamento ALUNOS. Parte dessas pessoas são alunos cujo id no HCP não é
    // a matrícula — daí a necessidade de corrigir tipo/departamento, tirar de
    // circulação o que foi criado por engano, e casar a face com o aluno certo.

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<com.magbo.access.services.StaffAdminService.StaffRow>> listStaff() {
        return ResponseEntity.ok(staffAdminService.listStaff());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> updateStaff(
            @PathVariable String id, @RequestBody Map<String, String> body) {
        try {
            com.magbo.access.models.User salvo = staffAdminService.updateStaff(
                    id, body.get("tipo"), body.get("departamento"));
            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "id", salvo.getId(),
                    "tipo", salvo.getTipo().name(),
                    "departamento", salvo.getDepartamento() == null ? "" : salvo.getDepartamento(),
                    "message", "Servidor atualizado: " + salvo.getNome()));
        } catch (com.magbo.access.services.StaffAdminService.StaffAdminException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> deactivateStaff(@PathVariable String id) {
        try {
            com.magbo.access.models.User u = staffAdminService.deactivateStaff(id);
            return ResponseEntity.ok(Map.of("status", "success",
                    "message", u.getNome() + " inativado"));
        } catch (com.magbo.access.services.StaffAdminService.StaffAdminException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reactivate")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> reactivateStaff(@PathVariable String id) {
        try {
            com.magbo.access.models.User u = staffAdminService.reactivateStaff(id);
            return ResponseEntity.ok(Map.of("status", "success",
                    "message", u.getNome() + " reativado"));
        } catch (com.magbo.access.services.StaffAdminService.StaffAdminException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    /** Remoção definitiva — recusada com explicação quando há histórico. */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> deleteStaff(@PathVariable String id) {
        try {
            staffAdminService.deleteStaff(id);
            return ResponseEntity.ok(Map.of("status", "success", "message", "Registro removido"));
        } catch (com.magbo.access.services.StaffAdminService.StaffAdminException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    // ── "Este servidor é na verdade um aluno" ────────────────────────────
    // 74 alunos estavam fora do departamento ALUNOS no HikCentral com id de 10
    // dígitos: a importação criou FUNC-### segurando a face deles, e as
    // passagens entravam nos relatórios como de servidor. A correção em massa
    // foi feita em SQL; isto aqui é a ferramenta para o próximo caso.

    @GetMapping("/{id}/reclassify/preview")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> previewReclassify(
            @PathVariable String id, @RequestParam String alunoId) {
        try {
            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "preview", staffAdminService.previewReclassify(id, alunoId)));
        } catch (com.magbo.access.services.StaffAdminService.StaffAdminException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reclassify")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> reclassify(
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        try {
            var r = staffAdminService.reclassifyStaffAsStudent(
                    id,
                    body.get("alunoId") == null ? null : String.valueOf(body.get("alunoId")),
                    Boolean.TRUE.equals(body.get("confirmarSubstituicao")));
            String face = r.servidorHikvisionId();
            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "resultado", r,
                    "message", face == null
                            ? r.servidorNome() + " inativado; " + r.alunoNome() + " não recebeu identificador (o registro não tinha)"
                            : "Identificador " + face + " transferido para " + r.alunoNome()
                                    + "; " + r.servidorNome() + " inativado"));
        } catch (com.magbo.access.services.StaffAdminService.StaffAdminException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    // ── Casamento manual: face do HCP -> aluno certo ─────────────────────

    @GetMapping("/match/preview")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> previewMatch(
            @RequestParam String alunoId, @RequestParam String hikvisionId) {
        try {
            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "preview", staffAdminService.previewReassign(alunoId, hikvisionId)));
        } catch (com.magbo.access.services.StaffAdminService.StaffAdminException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    @PostMapping("/match")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> confirmMatch(@RequestBody Map<String, String> body) {
        try {
            com.magbo.access.models.User aluno = staffAdminService.reassignHikvisionId(
                    body.get("alunoId"), body.get("hikvisionId"));
            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "alunoId", aluno.getId(),
                    "nome", aluno.getNome(),
                    "hikvisionEmployeeId", aluno.getHikvisionEmployeeId(),
                    "message", "Identificador " + aluno.getHikvisionEmployeeId()
                            + " ligado a " + aluno.getNome()));
        } catch (com.magbo.access.services.StaffAdminService.StaffAdminException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    /**
     * SIMULACAO do import do HikCentral: nao grava nada, devolve o que
     * aconteceria linha a linha.
     *
     * Existe porque o arquivo real tem 1198 linhas e mistura 996 alunos que ja
     * existem com ~100 servidores que nao existem. Aplicar as cegas um arquivo
     * desse tamanho sobre a base de producao — e depois descobrir o que ele fez
     * — nao e uma opcao.
     */
    @PostMapping("/import/preview")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<com.magbo.access.services.HikCentralImportService.ImportPlan> importPreview(
            @RequestBody List<com.magbo.access.dto.HikCentralRowDto> linhas) {
        return ResponseEntity.ok(hikCentralImportService.plan(linhas));
    }

    /**
     * Aplica o import. O plano e REFEITO aqui contra o estado atual do banco —
     * o que a tela mostrou foi uma simulacao, e entre a conferencia e a
     * confirmacao o banco pode ter mudado.
     */
    @PostMapping("/import")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<com.magbo.access.services.HikCentralImportService.ImportPlan> importApply(
            @RequestBody List<com.magbo.access.dto.HikCentralRowDto> linhas) {
        return ResponseEntity.ok(hikCentralImportService.apply(linhas));
    }

    /** Matricula que o formulario mostra antes de salvar (campo em branco). */
    @GetMapping("/next-matricula")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, String>> nextMatricula() {
        return ResponseEntity.ok(Map.of("matricula", staffRegistrationService.proximaMatricula()));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> create(@RequestBody StaffRegistrationDto dto) {
        try {
            User salvo = staffRegistrationService.register(dto);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("status", "success");
            body.put("id", salvo.getId());
            body.put("matricula", salvo.getId());
            body.put("nome", salvo.getNome());
            body.put("tipo", salvo.getTipo().name());
            body.put("departamento", salvo.getDepartamento());
            body.put("hikvisionEmployeeId", salvo.getHikvisionEmployeeId());
            body.put("message", "Servidor cadastrado: " + salvo.getNome() + " (" + salvo.getId() + ")");
            return ResponseEntity.ok(body);
        } catch (StaffRegistrationService.StaffRegistrationException e) {
            // 400 e nao 500: o dado esta errado, o servidor nao. E a mensagem
            // vai pronta para a tela — recusa muda tem que acabar aqui.
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "error",
                    "message", e.getMessage()));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            log.warn("Cadastro de servidor recusado pelo banco: {}", e.getMostSpecificCause().getMessage());
            return ResponseEntity.status(409).body(Map.of(
                    "status", "error",
                    "message", "Identificador Hikvision ou matrícula já cadastrados"));
        }
    }

    /**
     * Importacao em lote da planilha de servidores.
     *
     * Mesmo contrato de resposta do /api/users/bulk (status, totalRecebido,
     * sucesso, falhas, detalheErros) para que a tela reaproveite a exibicao de
     * erros por linha que ja existe.
     */
    @PostMapping("/bulk")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> createBulk(@RequestBody List<StaffRegistrationDto> linhas) {
        List<StaffRegistrationService.RowResult> resultados =
                staffRegistrationService.registerBulk(linhas);

        List<Map<String, String>> erros = new ArrayList<>();
        List<Map<String, String>> criados = new ArrayList<>();
        for (StaffRegistrationService.RowResult r : resultados) {
            if (r.ok()) {
                Map<String, String> ok = new LinkedHashMap<>();
                ok.put("linha", String.valueOf(r.linha()));
                ok.put("nome", r.nome());
                ok.put("matricula", r.matricula());
                criados.add(ok);
            } else {
                Map<String, String> err = new LinkedHashMap<>();
                err.put("linha", String.valueOf(r.linha()));
                err.put("nome", r.nome());
                err.put("erro", r.erro());
                erros.add(err);
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", erros.isEmpty() ? "success" : "partial");
        body.put("totalRecebido", resultados.size());
        body.put("sucesso", criados.size());
        body.put("falhas", erros.size());
        body.put("criados", criados);
        body.put("detalheErros", erros);
        return ResponseEntity.ok(body);
    }
}
