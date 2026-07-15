package com.magbo.access.security;

import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Authorization helper for @PreAuthorize: checks whether the authenticated
 * user may access a given functional area (cantine, infirmerie, cdi, portail).
 * ADMIN always passes. Others must list the area in setoresPermitidos.
 */
@Component("areaSecurity")
@RequiredArgsConstructor
public class AreaSecurity {

    private final SystemUserRepository systemUserRepository;

    public boolean can(String area) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return false;

        // ADMIN bypass via granted authority (no DB hit needed)
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        if (isAdmin) return true;

        String username = auth.getName();
        SystemUser user = systemUserRepository.findByUsername(username).orElse(null);
        if (user == null) return false;

        // reuse the entity's own permission logic
        return user.canOperateSector(area);
    }

    /**
     * Verifica permissão granular de ESCRITA (ex.: MEAL_ENTITLEMENT_WRITE).
     * ADMIN sempre passa. Operadores precisam da permissão listada em SystemUser.permissoes ("*" = todas).
     * Permissões granulares NÃO governam leitura — leitura continua por setor (can(area)).
     */
    public boolean hasPermission(String permission) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return false;

        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        if (isAdmin) return true;

        String username = auth.getName();
        SystemUser user = systemUserRepository.findByUsername(username).orElse(null);
        if (user == null) return false;

        return user.hasPermission(permission);
    }
}
