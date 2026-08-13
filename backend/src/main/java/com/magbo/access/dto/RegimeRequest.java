package com.magbo.access.dto;

import com.magbo.access.models.RegimeGeneral;
import com.magbo.access.models.RegimeSortie;
import lombok.Data;

import java.time.LocalDate;

/** Corpo do POST que cadastra ou substitui o regime de um aluno. */
@Data
public class RegimeRequest {

    private String userId;
    private RegimeGeneral regimeGeneral;
    private RegimeSortie regimeSortie;
    private LocalDate validFrom;
    private LocalDate validUntil;

    /**
     * Nome do responsável legal que assinou. Obrigatório — a validação vive no
     * service, com mensagem que o operador entende, e não num @NotBlank que
     * devolveria 400 sem explicar o quê.
     */
    private String authorizedByFamily;

    private String documentoRef;
    private LocalDate assinadoEm;
    private String note;
}
