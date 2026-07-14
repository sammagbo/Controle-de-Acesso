package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "access_logs")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class AccessLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "point_id", nullable = false)
    private String pointId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccessAction action;

    @Column(nullable = false)
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    @Column(name = "created_by_user", length = 50)
    private String createdByUser;

    @Column(name = "flag", length = 32)
    private String flag;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_method", length = 8)
    private AuthMethod authMethod;

    @Column(name = "hikvision_sub_event_type")
    private Integer hikvisionSubEventType;
}
