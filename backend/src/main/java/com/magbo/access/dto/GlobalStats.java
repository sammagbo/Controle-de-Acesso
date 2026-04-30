package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GlobalStats {
    private long totalToday;     // total de eventos (entradas+saidas) hoje
    private long activeUsers;    // pessoas dentro de areas especiais agora
    private long totalUsers;     // total cadastrados na base
}
