package com.magbo.access.controllers;

import com.magbo.access.dto.GlobalStats;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@RestController
@RequestMapping("/api/stats")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class StatsController {

    private final AccessLogRepository accessLogRepository;
    private final UserRepository userRepository;

    private final com.magbo.access.repositories.AccessAttemptRepository accessAttemptRepository;

    @GetMapping("/global")
    public ResponseEntity<GlobalStats> getGlobalStats() {
        LocalDateTime startOfDay = LocalDateTime.of(LocalDate.now(), LocalTime.MIDNIGHT);

        long totalToday    = accessLogRepository.countByTimestampGreaterThanEqual(startOfDay);
        long alertas       = accessLogRepository.countBlockedSince(startOfDay);
        long activeUsers   = accessLogRepository.countActiveUsersSince(startOfDay);
        long totalUsers    = userRepository.count();

        long negadas       = accessAttemptRepository.countByTimestampGreaterThanEqual(startOfDay);
        long divergencia   = accessAttemptRepository.countDivergenceSince(startOfDay);

        GlobalStats stats = GlobalStats.builder()
            .totalToday(totalToday)
            .blockedToday(alertas)
            .authorizedToday(totalToday - alertas)
            .activeUsers(activeUsers)
            .totalUsers(totalUsers)
            .alertasHoje(alertas)
            .negadasHoje(negadas)
            .divergenciaHoje(divergencia)
            .build();

        return ResponseEntity.ok(stats);
    }
}
