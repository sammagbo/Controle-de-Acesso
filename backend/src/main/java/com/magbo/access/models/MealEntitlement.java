package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "meal_entitlements")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class MealEntitlement {

    @Id
    @Column(name = "user_id")
    @EqualsAndHashCode.Include
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private EntitlementStatus status;

    @Column(name = "valid_from")
    private LocalDate validFrom;

    @Column(name = "valid_until")
    private LocalDate validUntil;

    @Column(length = 255)
    private String note;

    /**
     * Reservado para evolução futura — a regra atual IGNORA este campo.
     */
    @Column(name = "days_of_week", length = 16)
    private String daysOfWeek;

    /**
     * Reservado para evolução futura — a regra atual IGNORA este campo.
     */
    @Column(name = "meal_type", length = 16)
    private String mealType;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
