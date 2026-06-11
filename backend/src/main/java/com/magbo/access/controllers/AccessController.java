package com.magbo.access.controllers;

import com.magbo.access.dto.AccessRequest;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.models.User;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.repositories.UserRepository;
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

    @GetMapping("/logs/{pointId}")
    public ResponseEntity<List<AccessLog>> getLogsByPoint(@PathVariable String pointId) {
        LocalDateTime start = LocalDateTime.now().minusHours(24);
        List<AccessLog> logs = accessLogRepository.findTop500ByPointIdAndTimestampGreaterThanEqualOrderByTimestampDesc(pointId, start);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/logs/all")
    public ResponseEntity<List<AccessLog>> getAllRecentLogs(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String pointId,
            @RequestParam(required = false) String action,
            @RequestParam(defaultValue = "50") Integer limit) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        Pageable pageable = PageRequest.of(0, safeLimit);

        LocalDateTime start = null;
        LocalDateTime end = null;
        if (dateFrom != null && !dateFrom.isBlank()) {
            start = java.time.LocalDate.parse(dateFrom).atStartOfDay();
        }
        if (dateTo != null && !dateTo.isBlank()) {
            end = java.time.LocalDate.parse(dateTo).atTime(23, 59, 59);
        }

        com.magbo.access.models.AccessAction actionEnum = null;
        if (action != null && !action.isBlank()) {
            try {
                actionEnum = com.magbo.access.models.AccessAction.valueOf(action.toUpperCase());
            } catch (Exception ignored) {}
        }

        List<AccessLog> logs = accessLogRepository.findFilteredLogs(start, end, pointId, actionEnum, pageable);
        return ResponseEntity.ok(logs);
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
            @RequestParam(required = false) String dateTo) {

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

        // mapa pointId -> área
        java.util.Map<String, String> areaOf = new java.util.HashMap<>();
        areaOf.put("REFEI1", "cantine"); areaOf.put("REFEI2", "cantine");
        areaOf.put("ENFERM", "infirmerie");
        areaOf.put("BIBLIO", "cdi");
        areaOf.put("PORT1", "portail"); areaOf.put("PORT2", "portail"); areaOf.put("PORT3", "portail");

        // agrega por área a partir do por-ponto
        java.util.Map<String, long[]> areaAgg = new java.util.LinkedHashMap<>(); // area -> [mov, entries]
        java.util.Map<String, java.util.Set<String>> areaUniq = new java.util.HashMap<>();
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

        java.util.List<com.magbo.access.dto.OverviewStats.AreaStat> areas = new java.util.ArrayList<>();
        for (var e : areaAgg.entrySet()) {
            areas.add(com.magbo.access.dto.OverviewStats.AreaStat.builder()
                    .area(e.getKey())
                    .movements(e.getValue()[0])
                    .entries(e.getValue()[1])
                    .uniqueStudents(0) // únicos por área omitido (custo); 0 por enquanto
                    .currentOccupancy(occByArea.getOrDefault(e.getKey(), 0L))
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
