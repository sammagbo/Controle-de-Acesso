package com.magbo.access.controllers;

import com.magbo.access.models.MealSlot;
import com.magbo.access.models.MealSlotClass;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.MealSlotService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * O PLANNING DA CANTINA, POR CLIQUES.
 *
 * ⚠️ A afixacao muda todo ano. Enquanto ela vivia em `class_schedules` sem
 * tela, mudar de ano exigia SQL a mao — e o que aconteceu foi o previsivel:
 * ninguem mudou, a base ficou em 2025, e em 25/08/2026 a cantina produziu 63
 * OUTSIDE_MEAL_TIME sobre 22 turmas que estavam a comer na hora certa.
 *
 * ⚠️ LEITURA por area (`cantine`), ESCRITA por permissao granular
 * (`MEAL_SLOT_WRITE`). Mesmo padrao do CantineRemovalController: quem opera a
 * cantina precisa de VER o planning para perceber um alerta; mudar a grade da
 * escola inteira e outra coisa. Sem a permissao a tela mostra tudo e desativa
 * os botoes — nunca os esconde (regra do projeto).
 *
 * ⚠️ E NENHUMA ROTA NOVA SEM GUARDA. As duas leituras respondem a
 * `@areaSecurity.can('cantine')` e as seis escritas ao gate acima; nenhuma fica
 * em `isAuthenticated()`. `/api/users` e `/api/access/logs` continuam como
 * estavam — a divida de seguranca n.1 do projeto nao foi alargada aqui.
 */
@RestController
@RequestMapping("/api/admin/meal-slots")
@RequiredArgsConstructor
public class MealSlotController {

    private final MealSlotService service;
    private final UserRepository userRepository;

    private static final String ESCRITA =
            "hasRole('ADMIN') or @areaSecurity.hasPermission('MEAL_SLOT_WRITE')";

    private String quem() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    /** As turmas que existem DE VERDADE (aluno ativo com turma preenchida). */
    private Set<String> turmasComAlunos() {
        return userRepository.findAll().stream()
                .filter(u -> u.getTipo() == UserType.ALUNO)
                .filter(u -> Boolean.TRUE.equals(u.getAtivo()))
                .map(User::getTurma)
                .filter(t -> t != null && !t.isBlank())
                .collect(Collectors.toCollection(TreeSet::new));
    }

    /** A grade inteira: creneaux, turmas por creneau, e os desacordos. */
    @GetMapping
    @PreAuthorize("@areaSecurity.can('cantine')")
    public Map<String, Object> grade() {
        List<MealSlot> slots = service.todos();
        Map<Long, List<MealSlotClass>> porSlot = service.turmasPorSlot();

        Set<String> comAlunos = turmasComAlunos();
        Set<String> noPlanning = porSlot.values().stream()
                .flatMap(List::stream).map(MealSlotClass::getTurma)
                .collect(Collectors.toCollection(TreeSet::new));

        List<Map<String, Object>> linhas = slots.stream().map(s -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("diaSemana", s.getDiaSemana());
            m.put("hora", s.getHora().toString());
            m.put("rotulo", s.getRotulo());
            m.put("ordem", s.getOrdem());
            m.put("ativo", s.getAtivo());
            m.put("toleranciaAntesMinutos", s.getToleranciaAntesMinutos());
            m.put("toleranciaDepoisMinutos", s.getToleranciaDepoisMinutos());
            m.put("turmas", porSlot.getOrDefault(s.getId(), List.of()).stream()
                    .sorted(Comparator.comparing(MealSlotClass::getTurma))
                    .map(c -> {
                        Map<String, Object> t = new LinkedHashMap<>();
                        t.put("turma", c.getTurma());
                        t.put("aConfirmar", c.getAConfirmar());
                        t.put("semAlunos", !comAlunos.contains(c.getTurma()));
                        return t;
                    })
                    .toList());
            return m;
        }).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("creneaux", linhas);
        out.put("turmasConhecidas", comAlunos);
        // ⚠️ OS DOIS DESACORDOS SAO MOSTRADOS, NAO ARBITRADOS. A tela nao pode
        // decidir por ninguem: 5E3 e 3E3 estao na afixacao e nao tem aluno
        // nenhum; uma turma sem creneau come sem horario conhecido. Quem
        // resolve e a Vie Scolaire, e para isso tem de VER.
        out.put("turmasSemAlunos", noPlanning.stream().filter(t -> !comAlunos.contains(t)).toList());
        out.put("turmasSemCreneau", comAlunos.stream().filter(t -> !noPlanning.contains(t)).toList());
        return out;
    }

    /** O creneau efetivo de UMA pessoa — o que a busca da tela mostra. */
    @GetMapping("/eleve/{userId}")
    @PreAuthorize("@areaSecurity.can('cantine')")
    public ResponseEntity<?> doAluno(@PathVariable String userId) {
        Optional<User> u = userRepository.findById(userId);
        if (u.isEmpty()) return ResponseEntity.notFound().build();

        MealSlotService.Resultado agora = service.resolver(u.get(), LocalDateTime.now());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("userId", u.get().getId());
        out.put("nome", u.get().getNome());
        out.put("turma", u.get().getTurma());
        out.put("veredicto", agora.veredicto().name());
        out.put("porExcecao", agora.porExcecao());
        out.put("excecoes", service.excecoesDe(userId).stream()
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("slotId", e.getSlotId());
                    m.put("motivo", e.getMotivo() == null ? "" : e.getMotivo());
                    return m;
                }).toList());
        return ResponseEntity.ok(out);
    }

    @PutMapping("/{slotId}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<?> atualizar(@PathVariable Long slotId, @RequestBody Map<String, Object> b) {
        try {
            Short antes = numero(b.get("toleranciaAntesMinutos"));
            Short depois = numero(b.get("toleranciaDepoisMinutos"));
            String rotulo = b.get("rotulo") == null ? null : String.valueOf(b.get("rotulo"));
            Boolean ativo = b.get("ativo") == null ? null : Boolean.valueOf(String.valueOf(b.get("ativo")));
            return ResponseEntity.ok(service.atualizarCreneau(slotId, antes, depois, rotulo, ativo, quem()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }

    private static Short numero(Object o) {
        if (o == null) return null;
        try {
            return Short.valueOf(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("valor nao numerico: " + o);
        }
    }

    @PostMapping("/{slotId}/turmas/{turma}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<?> ligar(@PathVariable Long slotId, @PathVariable String turma) {
        try {
            service.ligarTurma(slotId, turma, quem());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }

    @DeleteMapping("/{slotId}/turmas/{turma}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<?> desligar(@PathVariable Long slotId, @PathVariable String turma) {
        try {
            service.desligarTurma(slotId, turma, quem());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }

    /**
     * ACAO DE MASSA: "toda a 6eme para este creneau".
     *
     * ⚠️ Casa por INICIO do codigo (6E -> 6E1, 6E2, 6E3) e SO entre turmas que
     * TEM alunos. Sem esse filtro, um prefixo mal digitado criaria afetacoes
     * para turmas inexistentes e a tela passaria a mostrar um planning que nao
     * corresponde a escola nenhuma — que e exatamente o defeito que esta
     * entrega veio corrigir.
     *
     * Devolve a lista do que ligou: uma acao de massa que nao diz o que fez
     * obriga quem a usou a conferir turma a turma.
     */
    @PostMapping("/{slotId}/turmas-por-prefixo/{prefixo}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<?> ligarPorPrefixo(@PathVariable Long slotId, @PathVariable String prefixo) {
        String p = prefixo == null ? "" : prefixo.trim().toUpperCase();
        if (p.isEmpty()) return ResponseEntity.badRequest().body(Map.of("erro", "prefixo obrigatorio"));

        List<String> alvo = turmasComAlunos().stream()
                .filter(t -> t.toUpperCase().startsWith(p)).toList();
        try {
            for (String t : alvo) service.ligarTurma(slotId, t, quem());
            return ResponseEntity.ok(Map.of("ligadas", alvo));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }

    @PostMapping("/{slotId}/eleve/{userId}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<?> excecao(@PathVariable Long slotId, @PathVariable String userId,
                                     @RequestBody(required = false) Map<String, String> b) {
        try {
            service.excecaoAluno(userId, slotId, b == null ? null : b.get("motivo"), quem());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", String.valueOf(e.getMessage())));
        }
    }

    @DeleteMapping("/{slotId}/eleve/{userId}")
    @PreAuthorize(ESCRITA)
    public ResponseEntity<?> removerExcecao(@PathVariable Long slotId, @PathVariable String userId) {
        service.removerExcecao(userId, slotId, quem());
        return ResponseEntity.noContent().build();
    }
}
