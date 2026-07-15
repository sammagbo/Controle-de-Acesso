package com.magbo.access.controllers;

import com.magbo.access.dto.MealEntitlementDto;
import com.magbo.access.dto.MealEntitlementHistoryDto;
import com.magbo.access.dto.MealEntitlementRequest;
import com.magbo.access.services.MealEntitlementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/meal-entitlements")
@RequiredArgsConstructor
public class MealEntitlementController {

    private final MealEntitlementService mealEntitlementService;

    @GetMapping
    @PreAuthorize("@areaSecurity.can('cantine')")
    public ResponseEntity<Page<MealEntitlementDto>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String turma,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        
        if (size > 200) {
            size = 200;
        }

        return ResponseEntity.ok(mealEntitlementService.search(q, turma, status, PageRequest.of(page, size)));
    }

    @GetMapping("/summary")
    @PreAuthorize("@areaSecurity.can('cantine')")
    public ResponseEntity<Map<String, Long>> summary() {
        return ResponseEntity.ok(mealEntitlementService.summary());
    }

    @GetMapping("/{userId}")
    @PreAuthorize("@areaSecurity.can('cantine')")
    public ResponseEntity<MealEntitlementDto> get(@PathVariable String userId) {
        return ResponseEntity.ok(mealEntitlementService.getOrPending(userId));
    }

    @GetMapping("/{userId}/history")
    @PreAuthorize("@areaSecurity.can('cantine')")
    public ResponseEntity<List<MealEntitlementHistoryDto>> history(@PathVariable String userId) {
        return ResponseEntity.ok(mealEntitlementService.history(userId));
    }

    @PutMapping("/{userId}")
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('MEAL_ENTITLEMENT_WRITE')")
    public ResponseEntity<?> upsert(
            @PathVariable String userId,
            @Valid @RequestBody MealEntitlementRequest req) {
        
        try {
            String changedBy = SecurityContextHolder.getContext().getAuthentication().getName();
            mealEntitlementService.upsert(
                    userId, req.getStatus(), req.getValidFrom(), req.getValidUntil(),
                    req.getNote(), changedBy, "UI"
            );
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/bulk")
    @PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('MEAL_ENTITLEMENT_WRITE')")
    public ResponseEntity<?> importBulk(
            @RequestBody List<com.magbo.access.dto.MealEntitlementBulkItem> items,
            @RequestParam(defaultValue = "false") boolean overwrite) {
        
        if (items == null || items.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Lote vazio ou nulo"));
        }
        if (items.size() > 2000) {
            return ResponseEntity.badRequest().body(Map.of("error", "Lote muito grande (máx 2000)"));
        }
        
        String changedBy = SecurityContextHolder.getContext().getAuthentication().getName();
        com.magbo.access.dto.BulkResultDto result = mealEntitlementService.importBulk(items, overwrite, changedBy);
        return ResponseEntity.ok(result);
    }
}
