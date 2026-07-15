package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "meal_entitlement_events")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class MealEntitlementEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "old_status", length = 16)
    private EntitlementStatus oldStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 16)
    private EntitlementStatus newStatus;

    @Column(name = "old_valid_from")
    private LocalDate oldValidFrom;

    @Column(name = "old_valid_until")
    private LocalDate oldValidUntil;

    @Column(name = "new_valid_from")
    private LocalDate newValidFrom;

    @Column(name = "new_valid_until")
    private LocalDate newValidUntil;

    @Column(name = "changed_by", nullable = false, length = 50)
    private String changedBy;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    @Column(length = 255)
    private String note;

    @Column(nullable = false, length = 16)
    private String source;
}
