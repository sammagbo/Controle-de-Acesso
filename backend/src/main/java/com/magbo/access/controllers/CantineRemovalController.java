package com.magbo.access.controllers;

import com.magbo.access.dto.CantineRemovalDto;
import com.magbo.access.services.CantineRemovalService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * RETIRAR UMA LINHA DO MONITEUR CANTINE — e devolve-la.
 *
 * ⚠️ A AUTORIZACAO TEM DUAS METADES, E FALTAR UMA NAO DA ERRO NENHUM VISIVEL.
 *
 *   1. `hasRole('ADMIN') or @areaSecurity.hasPermission('CANTINE_REMOVAL_WRITE')`
 *      — estar autenticado NAO basta. Ler o monitor continua a ser por area
 *      (qualquer operador da cantina o abre); APAGAR uma linha da vista de
 *      toda a gente e outra coisa, e segue o padrao das escritas sensiveis do
 *      projeto.
 *
 *   2. `@areaSecurity.can(#pointId)` — e esta e a metade que costuma faltar.
 *      Sem ela, qualquer pessoa com a permissao granular poderia retirar a
 *      linha de QUALQUER ponto: a permissao e global, o ponto nao. Um operador
 *      da cantina nao pode esconder uma linha do CDI ou da portaria.
 *      `SystemUser.canOperateSector` aceita o ponto exato ou a area macro dele,
 *      entao um operador com `cantine` passa em REFEI1 e falha em BIBLIO.
 *
 * ⚠️ E ha uma TERCEIRA guarda, no servico e nao aqui: o ponto tem de ser da
 * cantina. As duas de cima autorizam a PESSOA; aquela recusa um ponto que esta
 * tela nao le. Um ADMIN passa nas duas primeiras em qualquer ponto do sistema,
 * e sem a terceira poderia gravar a retirada de uma linha do CDI numa tabela
 * que o CDI nao consulta — um registo sem efeito, que engana quem o ler.
 *
 * ⚠️ Divida conhecida e herdada: sem token, `@PreAuthorize` devolve 403 e nao
 * 401 (CLAUDE.md, divida 4). Nao e desta entrega.
 */
@RestController
@RequestMapping("/api/admin/cantine/removals")
@RequiredArgsConstructor
public class CantineRemovalController {

    private final CantineRemovalService service;

    /**
     * As retiradas ATIVAS de hoje.
     *
     * Leitura por AREA, como o resto do monitor: quem ve a tela precisa de
     * saber por que e que uma linha nao esta la. Esconder a explicacao de quem
     * ve o efeito faria a retirada parecer um defeito do sistema.
     */
    @GetMapping
    @PreAuthorize("@areaSecurity.can('cantine')")
    public List<CantineRemovalDto> hoje() {
        return service.ativasDeHoje().stream().map(CantineRemovalDto::de).toList();
    }

    @PostMapping("/{pointId}/{userId}")
    @PreAuthorize("(hasRole('ADMIN') or @areaSecurity.hasPermission('CANTINE_REMOVAL_WRITE'))"
            + " and @areaSecurity.can(#pointId)")
    public ResponseEntity<?> retirar(@PathVariable String pointId,
                                     @PathVariable String userId,
                                     @RequestBody(required = false) Map<String, String> corpo) {
        try {
            String motivo = corpo == null ? null : corpo.get("motivo");
            String quem = SecurityContextHolder.getContext().getAuthentication().getName();
            return ResponseEntity.ok(CantineRemovalDto.de(service.retirar(userId, pointId, motivo, quem)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", e.getMessage()));
        }
    }

    @DeleteMapping("/{pointId}/{userId}")
    @PreAuthorize("(hasRole('ADMIN') or @areaSecurity.hasPermission('CANTINE_REMOVAL_WRITE'))"
            + " and @areaSecurity.can(#pointId)")
    public ResponseEntity<?> desfazer(@PathVariable String pointId, @PathVariable String userId) {
        try {
            String quem = SecurityContextHolder.getContext().getAuthentication().getName();
            service.desfazer(userId, pointId, quem);
            // Idempotente: desfazer o que ja estava desfeito (ou nunca existiu)
            // nao e erro. Dois operadores carregam no mesmo botao, e o segundo
            // nao pode ver uma mensagem de falha por ter chegado tarde.
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", e.getMessage()));
        }
    }
}
