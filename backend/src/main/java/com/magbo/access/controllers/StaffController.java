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
