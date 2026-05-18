package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "door_mappings", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"terminal_ip", "door_no", "reader_no"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DoorMapping {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "terminal_ip", length = 64)
    private String terminalIp;

    @Column(name = "door_no", nullable = false)
    private Integer doorNo;

    @Column(name = "reader_no")
    private Integer readerNo;

    @Column(name = "point_id", nullable = false, length = 32)
    private String pointId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 16)
    private AccessAction action;

    @Column(name = "label", length = 128)
    private String label;

    @Column(name = "ativo", nullable = false)
    private Boolean ativo;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        if (ativo == null) ativo = true;
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
