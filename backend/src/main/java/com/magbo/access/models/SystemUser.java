package com.magbo.access.models;

import com.magbo.access.security.Role;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

@Entity
@Table(name = "system_users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SystemUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 50)
    private String username;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "nome_completo", nullable = false)
    private String nomeCompleto;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    /**
     * CSV dos setores que este operador pode atuar.
     * Valor "*" significa todos os setores (apenas para ADMIN).
     * Exemplos: "BIBLIO", "PORT1,PORT2,PORT3", "REFEI1,REFEI2"
     */
    @Column(name = "setores_permitidos", length = 255)
    private String setoresPermitidos;

    @Column(nullable = false)
    @Builder.Default
    private Boolean ativo = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "last_login")
    private LocalDateTime lastLogin;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    /**
     * Verifica se este operador pode atuar no setor informado.
     * Suporta tanto o ID específico do ponto (ex: REFEI1) quanto a área geral (ex: cantine).
     */
    public boolean canOperateSector(String sectorId) {
        if (role == Role.ADMIN) return true;
        if (setoresPermitidos == null || setoresPermitidos.isBlank()) return false;
        if ("*".equals(setoresPermitidos.trim())) return true;
        
        List<String> permitidos = Arrays.asList(setoresPermitidos.split(","));
        boolean directMatch = permitidos.stream()
                .map(String::trim)
                .anyMatch(s -> s.equalsIgnoreCase(sectorId));
                
        if (directMatch) return true;
        
        // Se não houver match direto, tenta mapear o ponto para sua área macro e verifica.
        String area = getAreaForPoint(sectorId);
        if (area != null) {
            return permitidos.stream()
                    .map(String::trim)
                    .anyMatch(s -> s.equalsIgnoreCase(area));
        }
        return false;
    }

    private String getAreaForPoint(String pointId) {
        if (pointId == null) return null;
        if (pointId.startsWith("PORT")) return "portail";
        if (pointId.equalsIgnoreCase("BIBLIO")) return "cdi";
        if (pointId.startsWith("ENFERM") || pointId.equals("INFIRMARY_REPORT")) return "infirmerie";
        if (pointId.startsWith("REFEI") || pointId.startsWith("CANTINA")) return "cantine";
        return null;
    }
}
