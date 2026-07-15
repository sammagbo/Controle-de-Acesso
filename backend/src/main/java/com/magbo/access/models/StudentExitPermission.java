package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "student_exit_permissions")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class StudentExitPermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "permission_type", nullable = false, length = 16)
    private ExitPermissionType permissionType;

    @Column(name = "valid_from")
    private LocalDate validFrom;

    @Column(name = "valid_until")
    private LocalDate validUntil;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "days_of_week", length = 16)
    private String daysOfWeek;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ExitPermissionStatus status;

    @Column(nullable = false, length = 255)
    private String reason;

    @Column(length = 255)
    private String note;

    @Column(name = "created_by", nullable = false, length = 50)
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "revoked_by", length = 50)
    private String revokedBy;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
