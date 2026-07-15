package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "access_attempts")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class AccessAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "employee_no_raw", nullable = false, length = 64)
    private String employeeNoRaw;

    @Column(name = "nome_snapshot")
    private String nomeSnapshot;

    @Column(name = "point_id")
    private String pointId;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private AccessAction action;

    @Column(name = "terminal_ip", length = 45)
    private String terminalIp;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_method", length = 8)
    private AuthMethod authMethod;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_result", nullable = false, length = 8)
    private AuthResult authResult;

    @Enumerated(EnumType.STRING)
    @Column(name = "authorization_result", nullable = false, length = 16)
    private AuthorizationResult authorizationResult;

    @Enumerated(EnumType.STRING)
    @Column(name = "denial_reason", nullable = false, length = 32)
    private DenialReason denialReason;

    @Column(name = "hikvision_sub_event_type")
    private Integer hikvisionSubEventType;

    @Column(nullable = false)
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    @Column(name = "door_mapping_fallback")
    private Boolean doorMappingFallback;
}
