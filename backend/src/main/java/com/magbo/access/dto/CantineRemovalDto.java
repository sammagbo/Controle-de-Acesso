package com.magbo.access.dto;

import com.magbo.access.models.CantineRemoval;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * O que a tela recebe sobre uma retirada.
 *
 * ⚠️ `removidoEm` NAO e enfeite de auditoria: e a regra. A tela so esconde as
 * passagens ANTERIORES a este instante, para que uma entrada NOVA depois da
 * retirada volte a aparecer. Um DTO que omitisse este campo obrigaria o
 * cliente a esconder a pessoa pelo resto do dia — ver
 * {@link CantineRemoval#getRemovidoEm()}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CantineRemovalDto {

    private String userId;
    private String pointId;
    private LocalDateTime removidoEm;
    private String removidoPor;
    private String motivo;

    public static CantineRemovalDto de(CantineRemoval r) {
        return CantineRemovalDto.builder()
                .userId(r.getUserId())
                .pointId(r.getPointId())
                .removidoEm(r.getRemovidoEm())
                .removidoPor(r.getRemovidoPor())
                .motivo(r.getMotivo())
                .build();
    }
}
