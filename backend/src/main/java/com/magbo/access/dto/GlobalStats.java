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

    /**
     * Quantas vezes o MAGBO registrou "NAO SEI" no portao hoje (regime 2).
     *
     * ⚠️ Sai de `negadasHoje` de proposito. Nao e' recusa — o MAGBO nao
     * discorda daquela saida, falta-lhe a grade horaria. Contada a' parte para
     * que o numero continue visivel (some-la seria esconder um rastro que o AED
     * pediu) sem que ela infle o contador que a direcao le como "barrados".
     */
    // ⚠️ `verificarHoje`, e NAO `aVerificarHoje`/`aVerifierHoje`: um campo cujo
    // nome comeca com UMA letra minuscula seguida de maiuscula gera o getter
    // `getAVerifierHoje()`, e o Jackson o serializa como `averifierHoje` — com
    // o A minusculo colado. Medido em 15/08/2026: a primeira versao deste campo
    // simplesmente NAO APARECIA no JSON sob o nome esperado, e o front leria
    // `undefined || 0` para sempre, sem erro nenhum, mostrando zero num
    // contador que tem valor.
    private long verificarHoje;
}
