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

    /**
     * Quem autorizou pela FAMILIA (pai, mae, guardiao).
     *
     * Nulavel: a regra e "pelo menos uma das duas autoridades", e isso um
     * NOT NULL nao expressa. A exigencia vive no ExitPermissionService.
     */
    @Column(name = "authorized_by_family", length = 255)
    private String authorizedByFamily;

    /**
     * Quem autorizou pela ESCOLA (membro da Vie Scolaire).
     *
     * ⚠️ NAO E `createdBy`, e a diferenca e real: createdBy e quem DIGITOU o
     * registro. Na pratica divergem — a CPE autoriza de viva voz e a
     * secretaria registra. A tela preenche este campo com o operador logado
     * (acerta na maioria) mas deixa editar, porque fundi-los apagaria a
     * distincao entre quem decidiu e quem teclou.
     */
    @Column(name = "authorized_by_school", length = 255)
    private String authorizedBySchool;

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
