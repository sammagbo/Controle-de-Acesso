package com.magbo.access.controllers;

import com.magbo.access.dto.GlobalStats;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@RestController
@RequestMapping("/api/stats")
@RequiredArgsConstructor
public class StatsController {

    private final AccessLogRepository accessLogRepository;
    private final UserRepository userRepository;

    @GetMapping("/global")
    public ResponseEntity<GlobalStats> getGlobalStats() {
        LocalDateTime startOfDay = LocalDateTime.of(LocalDate.now(), LocalTime.MIDNIGHT);

        long totalToday   = accessLogRepository.countByTimestampGreaterThanEqual(startOfDay);
        long activeUsers  = accessLogRepository.countActiveUsersSince(startOfDay);
        long totalUsers   = userRepository.count();

        GlobalStats stats = GlobalStats.builder()
            .totalToday(totalToday)
            .activeUsers(activeUsers)
            .totalUsers(totalUsers)
            .build();

        return ResponseEntity.ok(stats);
    }
}
