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
    /**
     * @deprecated Nome enganoso: conta access_logs com flag != null (alertas), e nada foi
     * bloqueado. Mantido como alias de alertasHoje para compatibilidade do frontend atual.
     * Usar alertasHoje. Remoção prevista para fase futura, após migração da UI.
     */
    @Deprecated
    private long blockedToday;   // alias temporario

    private long authorizedToday;// total de acessos permitidos hoje
    private long activeUsers;    // pessoas dentro de areas especiais agora
    private long totalUsers;     // total cadastrados na base

    private long alertasHoje;       // = mesmo valor de blockedToday
    private long negadasHoje;       // total de access_attempts hoje
    private long divergenciaHoje;   // auth_result=SUCCESS AND authorization_result=DENIED
}
