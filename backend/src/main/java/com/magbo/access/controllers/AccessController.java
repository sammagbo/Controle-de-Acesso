package com.magbo.access.controllers;

import com.magbo.access.dto.AccessRequest;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.models.User;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.VisitStatsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/access")
@RequiredArgsConstructor
public class AccessController {

    private final AccessLogRepository accessLogRepository;
    private final SystemUserRepository systemUserRepository;
    private final UserRepository userRepository;
    private final com.magbo.access.services.VisitStatsService visitStatsService;

    @PostMapping
    public ResponseEntity<?> registerAccess(@Valid @RequestBody AccessRequest request) {
        // ── Sector validation ──
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        SystemUser operator = systemUserRepository.findByUsername(username)
                .orElseThrow(() -> new SecurityException("Operador não encontrado: " + username));

        if (!operator.canOperateSector(request.getPointId())) {
            log.warn("Operador {} (role={}) tentou operar setor não permitido: {}",
                     username, operator.getRole(), request.getPointId());
            return ResponseEntity.status(403).body(Map.of(
                "error", "Você não tem permissão para operar o setor " + request.getPointId()
            ));
        }

        AccessLog accessLog = AccessLog.builder()
                .userId(request.getUserId())
                .pointId(request.getPointId())
                .action(request.getAction())
                .timestamp(LocalDateTime.now())
                .createdByUser(username)
                .build();

        AccessLog saved = accessLogRepository.save(accessLog);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PreAuthorize("@areaSecurity.can('cantine')")
    @GetMapping("/logs/refectory")
    public List<AccessLog> refectoryLogs(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String action,
            @RequestParam(defaultValue = "500") Integer limit) {

        List<String> refIds = List.of("REFEI1", "REFEI2", "CANTINA1");

        LocalDateTime from = (dateFrom != null && !dateFrom.isEmpty())
                ? java.time.LocalDate.parse(dateFrom).atStartOfDay()
                : LocalDateTime.now().minusDays(30);
        LocalDateTime to = (dateTo != null && !dateTo.isEmpty())
                ? java.time.LocalDate.parse(dateTo).atTime(23, 59, 59)
                : LocalDateTime.now();

        List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(refIds, from, to);

        if (action != null && !action.isEmpty()) {
            com.magbo.access.models.AccessAction act =
                    com.magbo.access.models.AccessAction.valueOf(action);
            logs = logs.stream()
                    .filter(l -> l.getAction() == act)
                    .collect(java.util.stream.Collectors.toList());
        }
        if (logs.size() > limit) {
            logs = logs.subList(0, limit);
        }
        return logs;
    }

    @PreAuthorize("@areaSecurity.can('cantine')")
    @GetMapping("/refectory/meals")
    public java.util.List<com.magbo.access.dto.RefectoryMeal> refectoryMeals(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {

        java.util.List<String> refIds = java.util.List.of("REFEI1", "REFEI2", "CANTINA1");

        java.time.LocalDateTime from = (dateFrom != null && !dateFrom.isEmpty())
                ? java.time.LocalDate.parse(dateFrom).atStartOfDay()
                : java.time.LocalDate.now().atStartOfDay();
        java.time.LocalDateTime to = (dateTo != null && !dateTo.isEmpty())
                ? java.time.LocalDate.parse(dateTo).atTime(23, 59, 59)
                : java.time.LocalDateTime.now();

        java.util.List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(refIds, from, to);

        // agrupa por (userId + dia), ordena cronológico, pareia 1a entrada + 1a saída seguinte
        java.util.Map<String, java.util.List<AccessLog>> byUserDay = new java.util.HashMap<>();
        java.time.format.DateTimeFormatter dayFmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd");
        for (AccessLog log : logs) {
            String day = log.getTimestamp().format(dayFmt);
            String key = log.getUserId() + "|" + day;
            byUserDay.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(log);
        }

        java.time.format.DateTimeFormatter hm = java.time.format.DateTimeFormatter.ofPattern("HH:mm");
        java.util.List<com.magbo.access.dto.RefectoryMeal> meals = new java.util.ArrayList<>();

        for (java.util.Map.Entry<String, java.util.List<AccessLog>> entry : byUserDay.entrySet()) {
            java.util.List<AccessLog> dayLogs = entry.getValue();
            dayLogs.sort(java.util.Comparator.comparing(AccessLog::getTimestamp)); // cronológico

            AccessLog entrada = null, saida = null;
            for (AccessLog l : dayLogs) {
                if (entrada == null && l.getAction() == com.magbo.access.models.AccessAction.ENTRADA) {
                    entrada = l;
                } else if (entrada != null && saida == null && l.getAction() == com.magbo.access.models.AccessAction.SAIDA) {
                    saida = l;
                    break;
                }
            }
            if (entrada == null) continue; // só saída solta, ignora

            String userId = entrada.getUserId();
            User u = userRepository.findById(userId).orElse(null);
            String day = entrada.getTimestamp().format(dayFmt);

            Integer duration = null;
            String exitTime = null;
            boolean exitRegistered = false;
            if (saida != null) {
                exitTime = saida.getTimestamp().format(hm);
                exitRegistered = true;
                duration = (int) java.time.Duration.between(entrada.getTimestamp(), saida.getTimestamp()).toMinutes();
            }

            meals.add(com.magbo.access.dto.RefectoryMeal.builder()
                    .userId(userId)
                    .nome(u != null ? u.getNome() : userId)
                    .turma(u != null ? u.getTurma() : "")
                    .date(day)
                    .entryTime(entrada.getTimestamp().format(hm))
                    .exitTime(exitTime)
                    .durationMinutes(duration)
                    .onTime(entrada.getFlag() == null)   // flag null = entrou na hora certa
                    .exitRegistered(exitRegistered)
                    .build());
        }

        // ordena por data desc, depois por hora de entrada
        meals.sort(java.util.Comparator
                .comparing(com.magbo.access.dto.RefectoryMeal::getDate).reversed()
                .thenComparing(com.magbo.access.dto.RefectoryMeal::getEntryTime));

        return meals;
    }

    @PreAuthorize("@areaSecurity.can('overview')")
    @GetMapping("/logs/user/{userId}")
    public ResponseEntity<List<AccessLog>> getLogsByUser(
            @PathVariable String userId,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        java.time.LocalDateTime from = (dateFrom != null && !dateFrom.isEmpty())
                ? java.time.LocalDate.parse(dateFrom).atStartOfDay()
                : java.time.LocalDate.now().minusDays(30).atStartOfDay();
        java.time.LocalDateTime to = (dateTo != null && !dateTo.isEmpty())
                ? java.time.LocalDate.parse(dateTo).atTime(23, 59, 59)
                : java.time.LocalDateTime.now();
        return ResponseEntity.ok(
            accessLogRepository.findTop500ByUserIdAndTimestampBetweenOrderByTimestampDesc(userId, from, to));
    }

    /**
     * Logs das últimas 24h de um ponto — alimenta TODAS as telas de setor
     * (portaria, enfermaria, cantina) e o CDI.
     *
     * @param tipo opcional. Quando informado (o CDI manda ALUNO), devolve só as
     *             passagens de pessoas daquele tipo. É PARÂMETRO e não regra
     *             fixa exatamente porque o endpoint é compartilhado: filtrar
     *             aqui sem opção mudaria portaria e enfermaria junto.
     * @param incluirRepeticoes o que o botão da tela liga. Por padrão FALSE: a
     *             repetição do dia de quem está POSTADO no ponto (porteiro, Vie
     *             Scolaire de plantão no portão) sai da lista, porque era ela
     *             que enchia a tela do Portail de linhas iguais. Nada é apagado
     *             — com TRUE elas voltam, e o Journal sempre mostrou todas.
     *             Mesmo padrão do `tipo`: uma lente que o operador escolhe.
     */
    @GetMapping("/logs/{pointId}")
    public ResponseEntity<List<AccessLog>> getLogsByPoint(
            @PathVariable String pointId,
            @RequestParam(required = false) String tipo,
            @RequestParam(required = false, defaultValue = "false") boolean incluirRepeticoes,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Integer limit) {
        // ── Janela EXPLÍCITA de datas (o caminho do Rapport do CDI) ──
        //
        // Descoberto em 12/08/2026: o Dashboard do CDI filtrava "Cette
        // Semaine" e "Ce Mois" sobre ESTA resposta — que era sempre as últimas
        // 24 horas. Os botões de período funcionavam, os dados não: semana e
        // mês mostravam o mesmo dia, e nada acusava, porque números de escala
        // diária são plausíveis. Com dateFrom/dateTo o chamador pede a janela
        // que o relatório realmente cobre; o teto sobe porque um mês do CDI
        // (~100 eventos/dia) não cabe em 500 — e teto estourado em silêncio é
        // exatamente o defeito que motivou este parâmetro.
        if ((dateFrom != null && !dateFrom.isBlank()) || (dateTo != null && !dateTo.isBlank())) {
            int teto = Math.max(1, Math.min(limit == null ? 5000 : limit, 5000));
            // incluirRepeticoes=false → FALSE (sem as marcadas), true → null
            // (tudo): mesma semântica do caminho de 24h logo abaixo.
            List<AccessLog> logs = accessLogRepository.findFilteredLogs(
                    parseDia(dateFrom), parseFimDoDia(dateTo), pointId, null, null,
                    incluirRepeticoes ? null : Boolean.FALSE, PageRequest.of(0, teto));
            return ResponseEntity.ok(filtrarPorTipo(logs, tipo));
        }

        // ── Caminho original, INALTERADO: últimas 24h, teto 500 ──
        // É o que as telas de setor (portaria, enfermaria, cantina) e a
        // presença do CDI continuam consumindo.
        LocalDateTime start = LocalDateTime.now().minusHours(24);
        List<AccessLog> logs = accessLogRepository.findRecentesDoPonto(
                pointId, start, incluirRepeticoes, PageRequest.of(0, 500));
        return ResponseEntity.ok(filtrarPorTipo(logs, tipo));
    }

    /**
     * Traduz o filtro de POSTO FIXO da tela para a lente da consulta.
     *
     * null (o padrão, e o que qualquer valor desconhecido produz) = mostra
     * TUDO. É a única resposta possível para a aba de auditoria: um filtro que
     * o operador não reconhece não pode esconder linha nenhuma em silêncio.
     */
    private Boolean lenteRepeticoes(String repeticoes) {
        if (repeticoes == null || repeticoes.isBlank()) return null;
        String v = repeticoes.trim().toUpperCase();
        if (v.equals("SEULEMENT")) return Boolean.TRUE;
        if (v.equals("SANS")) return Boolean.FALSE;
        return null;
    }

    /**
     * Mantém só as passagens de pessoas do tipo pedido. Id sem cadastro em
     * app_users é DESCARTADO quando há filtro: não dá para afirmar o tipo de
     * quem não está cadastrado, e deixar passar contrabandearia servidor para
     * dentro de um número que se pediu para ser de aluno.
     */
    private List<AccessLog> filtrarPorTipo(List<AccessLog> logs, String tipo) {
        if (tipo == null || tipo.isBlank() || logs.isEmpty()) return logs;
        final com.magbo.access.models.UserType alvo;
        try {
            alvo = com.magbo.access.models.UserType.valueOf(tipo.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return logs; // tipo desconhecido não estreita nada
        }
        java.util.Set<String> ids = new java.util.HashSet<>();
        logs.forEach(l -> { if (l.getUserId() != null) ids.add(l.getUserId()); });
        java.util.Set<String> doTipo = new java.util.HashSet<>();
        userRepository.findAllById(ids).forEach(u -> {
            if (u.getTipo() == alvo) doTipo.add(u.getId());
        });
        return logs.stream().filter(l -> l.getUserId() != null && doTipo.contains(l.getUserId())).toList();
    }

    /**
     * Fonte da aba "Journal" do Rapport General.
     *
     * @param eleve nome (parcial) OU matricula do aluno. Filtra no banco, sobre
     *              o periodo inteiro — filtrar no cliente so alcancaria as
     *              linhas ja carregadas (teto de 500).
     * @param repeticoes lente sobre a repeticao de quem esta POSTADO num ponto:
     *              vazio = TUDO (padrao — o Journal e a auditoria e nunca
     *              esconde linha), "SEULEMENT" = so as marcadas, "SANS" = tudo
     *              menos elas. Valor desconhecido nao estreita nada, mesma
     *              tolerancia do filtro de acao.
     */
    @GetMapping("/logs/all")
    public ResponseEntity<List<AccessLog>> getAllRecentLogs(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String pointId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String eleve,
            @RequestParam(required = false) String tipo,
            @RequestParam(required = false) String repeticoes,
            @RequestParam(defaultValue = "50") Integer limit) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        Pageable pageable = PageRequest.of(0, safeLimit);

        List<AccessLog> logs = accessLogRepository.findFilteredLogs(
                parseDia(dateFrom), parseFimDoDia(dateTo), pointId, parseAction(action),
                termoEleve(eleve), lenteRepeticoes(repeticoes), pageable);
        // O Journal é a visão de AUDITORIA: sem filtro ele mostra tudo, e é
        // assim que continua por padrão. O tipo é uma lente que o operador
        // escolhe, nunca um recorte silencioso.
        return ResponseEntity.ok(filtrarPorTipo(logs, tipo));
    }

    /**
     * O TOTAL que corresponde a /logs/all — para contadores de tela.
     *
     * Medido em 12/08/2026: 612 movimentos no banco desde a meia-noite, "500"
     * na tela — o card contava as linhas de uma lista que o servidor tinha
     * truncado no teto. Um contador NUNCA pode medir o comprimento de uma
     * lista paginada; ele pergunta ao banco, e este endpoint é a pergunta.
     *
     * MESMOS parâmetros e MESMO parsing de /logs/all (métodos privados
     * compartilhados — uma leitura, uma implementação): os dois respondem
     * sobre o mesmo universo ou o total não corresponde à lista. `limit` não
     * existe aqui de propósito: o total é do banco, não da página.
     *
     * isAuthenticated, e não admin: o card "Movimentações Hoje" fica na tela
     * inicial do OPERADOR. Um número agregado de movimentos, sem nome e sem
     * matrícula — nada aqui é dado pessoal.
     */
    @GetMapping("/logs/count")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> countAllLogs(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String pointId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String eleve,
            @RequestParam(required = false) String tipo,
            @RequestParam(required = false) String repeticoes) {
        com.magbo.access.models.UserType tipoEnum = null;
        if (tipo != null && !tipo.isBlank()) {
            try {
                tipoEnum = com.magbo.access.models.UserType.valueOf(tipo.trim().toUpperCase());
            } catch (IllegalArgumentException ignored) {
                // tipo desconhecido não estreita nada — mesma tolerância de
                // filtrarPorTipo, senão lista e total divergem.
            }
        }
        long total = accessLogRepository.countFilteredLogs(
                parseDia(dateFrom), parseFimDoDia(dateTo), pointId, parseAction(action),
                termoEleve(eleve), lenteRepeticoes(repeticoes), tipoEnum);
        return ResponseEntity.ok(Map.of("total", total));
    }

    /** Começo do dia, ou null quando o filtro está vazio. */
    private LocalDateTime parseDia(String dateFrom) {
        if (dateFrom == null || dateFrom.isBlank()) return null;
        return java.time.LocalDate.parse(dateFrom).atStartOfDay();
    }

    /**
     * Fim do DIA, nao o comeco do ultimo segundo: com atTime(23,59,59) uma
     * passagem as 23:59:59.7 existia no banco, era contada pela "Vue
     * d'ensemble" (BETWEEN nativo) e sumia do Journal.
     */
    private LocalDateTime parseFimDoDia(String dateTo) {
        if (dateTo == null || dateTo.isBlank()) return null;
        return java.time.LocalDate.parse(dateTo).atTime(java.time.LocalTime.MAX);
    }

    private com.magbo.access.models.AccessAction parseAction(String action) {
        if (action == null || action.isBlank()) return null;
        try {
            return com.magbo.access.models.AccessAction.valueOf(action.toUpperCase());
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Termo pronto para o LIKE: minusculas + '%' nas pontas. Em branco vira
     * null, que a consulta le como "sem filtro" — filtro vazio nunca pode
     * virar uma busca por string vazia.
     */
    private String termoEleve(String eleve) {
        if (eleve == null || eleve.isBlank()) return null;
        return "%" + eleve.trim().toLowerCase() + "%";
    }

    /**
     * Parâmetros de RELATÓRIO que o frontend precisa conhecer.
     *
     * Existe para acabar com uma fonte dupla: o piso de visita curta é uma
     * property do backend (magbo.report.min-visit-seconds), mas o Rapport CDI é
     * calculado no cliente. Enquanto o número vivia repetido como constante no
     * JS, mudar a property sem mudar o JS fazia a MESMA tela mostrar dois
     * números para o mesmo dia — e nada acusava a divergência.
     *
     * Autenticado, não admin: quem opera o CDI precisa do valor e não é admin.
     */
    @GetMapping("/report-config")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> reportConfig() {
        return ResponseEntity.ok(Map.of(
                "minVisitSeconds", visitStatsService.minVisitSeconds()));
    }

    private static final int INFIRMARY_LONG_STAY_MIN = 30;

    @PreAuthorize("@areaSecurity.can('infirmerie')")
    @GetMapping("/infirmary/visits")
    public java.util.List<com.magbo.access.dto.InfirmaryVisit> infirmaryVisits(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {

        java.util.List<String> infIds = java.util.List.of("ENFERM");

        java.time.LocalDateTime from = (dateFrom != null && !dateFrom.isEmpty())
                ? java.time.LocalDate.parse(dateFrom).atStartOfDay()
                : java.time.LocalDate.now().atStartOfDay();
        java.time.LocalDateTime to = (dateTo != null && !dateTo.isEmpty())
                ? java.time.LocalDate.parse(dateTo).atTime(23, 59, 59)
                : java.time.LocalDateTime.now();

        java.util.List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(infIds, from, to);

        java.util.Map<String, java.util.List<AccessLog>> byUserDay = new java.util.HashMap<>();
        java.time.format.DateTimeFormatter dayFmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd");
        for (AccessLog log : logs) {
            String day = log.getTimestamp().format(dayFmt);
            String key = log.getUserId() + "|" + day;
            byUserDay.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(log);
        }

        java.time.format.DateTimeFormatter hm = java.time.format.DateTimeFormatter.ofPattern("HH:mm");
        java.util.List<com.magbo.access.dto.InfirmaryVisit> visits = new java.util.ArrayList<>();

        for (java.util.Map.Entry<String, java.util.List<AccessLog>> entry : byUserDay.entrySet()) {
            java.util.List<AccessLog> dayLogs = entry.getValue();
            dayLogs.sort(java.util.Comparator.comparing(AccessLog::getTimestamp));

            AccessLog entrada = null, saida = null;
            for (AccessLog l : dayLogs) {
                if (entrada == null && l.getAction() == com.magbo.access.models.AccessAction.ENTRADA) {
                    entrada = l;
                } else if (entrada != null && saida == null && l.getAction() == com.magbo.access.models.AccessAction.SAIDA) {
                    saida = l;
                    break;
                }
            }
            if (entrada == null) continue;

            String userId = entrada.getUserId();
            User u = userRepository.findById(userId).orElse(null);
            String day = entrada.getTimestamp().format(dayFmt);

            Integer duration = null;
            String exitTime = null;
            boolean exitRegistered = false;
            boolean longStay = false;
            if (saida != null) {
                exitTime = saida.getTimestamp().format(hm);
                exitRegistered = true;
                duration = (int) java.time.Duration.between(entrada.getTimestamp(), saida.getTimestamp()).toMinutes();
                longStay = duration > INFIRMARY_LONG_STAY_MIN;
            }

            visits.add(com.magbo.access.dto.InfirmaryVisit.builder()
                    .userId(userId)
                    .nome(u != null ? u.getNome() : userId)
                    .turma(u != null ? u.getTurma() : "")
                    .date(day)
                    .entryTime(entrada.getTimestamp().format(hm))
                    .exitTime(exitTime)
                    .durationMinutes(duration)
                    .longStay(longStay)
                    .exitRegistered(exitRegistered)
                    .build());
        }

        visits.sort(java.util.Comparator
                .comparing(com.magbo.access.dto.InfirmaryVisit::getDate).reversed()
                .thenComparing(com.magbo.access.dto.InfirmaryVisit::getEntryTime));

        return visits;
    }

    @GetMapping("/overview")
    @PreAuthorize("hasRole('ADMIN')")
    public com.magbo.access.dto.OverviewStats overview(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(defaultValue = "false") boolean incluirFuncionarios) {

        java.time.LocalDateTime from = (dateFrom != null && !dateFrom.isEmpty())
                ? java.time.LocalDate.parse(dateFrom).atStartOfDay()
                : java.time.LocalDate.now().minusDays(6).atStartOfDay();
        java.time.LocalDateTime to = (dateTo != null && !dateTo.isEmpty())
                ? java.time.LocalDate.parse(dateTo).atTime(23, 59, 59)
                : java.time.LocalDateTime.now();

        // período anterior (mesmo tamanho) para tendência
        long days = java.time.temporal.ChronoUnit.DAYS.between(from.toLocalDate(), to.toLocalDate()) + 1;
        java.time.LocalDateTime prevTo = from.minusSeconds(1);
        java.time.LocalDateTime prevFrom = from.minusDays(days);

        long total = accessLogRepository.countMovementsInternal(from, to);
        long uniques = accessLogRepository.countUniqueStudents(from, to);
        long prevTotal = accessLogRepository.countMovementsInternal(prevFrom, prevTo);
        long offSchedule = accessLogRepository.countOffScheduleMeals(from, to);

        // por hora
        java.util.List<com.magbo.access.dto.OverviewStats.HourStat> byHour = new java.util.ArrayList<>();
        for (Object[] row : accessLogRepository.countByHour(from, to)) {
            byHour.add(com.magbo.access.dto.OverviewStats.HourStat.builder()
                    .hour(((Number) row[0]).intValue())
                    .count(((Number) row[1]).longValue())
                    .build());
        }

        // mapa pointId -> área (fonte única: AreaMapping)
        java.util.Map<String, String> areaOf = com.magbo.access.config.AreaMapping.pointToArea();

        // agrega por área a partir do por-ponto
        java.util.Map<String, long[]> areaAgg = new java.util.LinkedHashMap<>(); // area -> [mov, entries]

        for (String a : java.util.List.of("cantine", "infirmerie", "cdi")) {
            areaAgg.put(a, new long[]{0, 0});
        }
        for (Object[] row : accessLogRepository.statsByPoint(from, to)) {
            String pid = (String) row[0];
            String area = areaOf.getOrDefault(pid, null);
            if (area == null || area.equals("portail")) continue;
            long mov = ((Number) row[1]).longValue();
            long entries = ((Number) row[3]).longValue();
            long[] agg = areaAgg.get(area);
            agg[0] += mov; agg[1] += entries;
        }

        java.time.LocalDateTime dayStart = java.time.LocalDate.now().atStartOfDay();
        long presentToday = accessLogRepository.countPresentToday(dayStart);
        long longStays = accessLogRepository.countLongInfirmaryStays(from, to);
        long noExit = accessLogRepository.countUnregisteredExits(from, to);

        // ocupação atual por setor -> por área
        java.util.Map<String, Long> occByArea = new java.util.HashMap<>();
        long totalInSectors = 0;
        for (Object[] row : accessLogRepository.currentOccupancyByPoint(dayStart)) {
            String pid = (String) row[0];
            long cnt = ((Number) row[1]).longValue();
            String area = areaOf.get(pid);
            if (area != null && !area.equals("portail")) {
                occByArea.merge(area, cnt, Long::sum);
                totalInSectors += cnt;
            }
        }

        // pontos de cada área, derivado de areaOf (sem nova cópia do mapeamento)
        java.util.Map<String, java.util.List<String>> pointsOfArea = new java.util.HashMap<>();
        areaOf.forEach((pid, ar) -> pointsOfArea.computeIfAbsent(ar, k -> new java.util.ArrayList<>()).add(pid));

        java.util.List<com.magbo.access.dto.OverviewStats.AreaStat> areas = new java.util.ArrayList<>();
        for (var e : areaAgg.entrySet()) {
            java.util.List<String> pts = pointsOfArea.getOrDefault(e.getKey(), java.util.List.of());

            // ── CDI: números de VISITA, não de linha bruta ──
            // Só o CDI muda aqui, e de propósito. O pedido é sobre as telas do
            // CDI; cantina e enfermaria seguem exatamente com as agregações SQL
            // que já foram validadas em produção. Misturar as duas coisas na
            // mesma entrega seria trocar o número de três áreas para consertar
            // o de uma.
            if ("cdi".equals(e.getKey()) && !pts.isEmpty()) {
                VisitStatsService.VisitStats cdi =
                        visitStatsService.stats(pts, from, to, incluirFuncionarios);
                areas.add(com.magbo.access.dto.OverviewStats.AreaStat.builder()
                        .area(e.getKey())
                        .movements(e.getValue()[0])
                        .entries(cdi.visits())
                        .uniqueStudents(cdi.uniquePeople())
                        .currentOccupancy(occByArea.getOrDefault(e.getKey(), 0L))
                        .avgDurationMin(cdi.avgDurationMin())
                        .build());
                continue;
            }

            long areaUniques = pts.isEmpty() ? 0 : accessLogRepository.countUniqueStudentsByPoints(from, to, pts);
            Double avgStay = pts.isEmpty() ? null : accessLogRepository.avgStayMinutesByPoints(
                    from, to, pts, visitStatsService.minVisitSeconds());
            areas.add(com.magbo.access.dto.OverviewStats.AreaStat.builder()
                    .area(e.getKey())
                    .movements(e.getValue()[0])
                    .entries(e.getValue()[1])
                    .uniqueStudents(areaUniques)
                    .currentOccupancy(occByArea.getOrDefault(e.getKey(), 0L))
                    .avgDurationMin(avgStay == null ? null : (int) Math.round(avgStay))
                    .build());
        }

        return com.magbo.access.dto.OverviewStats.builder()
                .totalMovements(total)
                .uniqueStudents(uniques)
                .areas(areas)
                .byHour(byHour)
                .longInfirmaryStays(longStays)
                .offScheduleMeals(offSchedule)
                .unregisteredExits(noExit)
                .previousTotal(prevTotal)
                .presentToday(presentToday)
                .currentlyInSectors(totalInSectors)
                .build();
    }
}
