package com.magbo.access.controllers;

import com.magbo.access.dto.AccessAttemptDto;
import com.magbo.access.dto.AttemptStatsDto;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.DenialReason;
import com.magbo.access.services.AccessAttemptQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@RestController
@RequestMapping("/api/access/attempts")
@RequiredArgsConstructor
public class AccessAttemptController {

    private final AccessAttemptQueryService queryService;

    // FASE F: adicionar or @areaSecurity.hasPermission('ATTEMPTS_READ')
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<AccessAttemptDto>> getFiltered(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) String pointId,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) DenialReason reason,
            @RequestParam(required = false) AuthMethod method,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        
        return ResponseEntity.ok(queryService.getFiltered(from, to, pointId, userId, reason, method, page, size));
    }

    // FASE F: adicionar or @areaSecurity.hasPermission('ATTEMPTS_READ')
    @GetMapping("/stats")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<AttemptStatsDto> getStats(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        
        LocalDateTime start = from != null ? from : LocalDateTime.of(LocalDate.now(), LocalTime.MIDNIGHT);
        return ResponseEntity.ok(queryService.getStatsSince(start));
    }

    @GetMapping("/refectory")
    @PreAuthorize("@areaSecurity.can('cantine')")
    public ResponseEntity<List<AccessAttemptDto>> getRefectoryFeed() {
        return ResponseEntity.ok(queryService.getByPoints(List.of("REFEI1", "REFEI2", "CANTINA1")));
    }

    @GetMapping("/gate")
    @PreAuthorize("@areaSecurity.can('portail')")
    public ResponseEntity<List<AccessAttemptDto>> getGateFeed() {
        return ResponseEntity.ok(queryService.getByPoints(List.of("PORT1", "PORT2", "PORT3")));
    }
}
