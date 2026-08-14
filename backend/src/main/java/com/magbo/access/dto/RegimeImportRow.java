package com.magbo.access.dto;

import lombok.Data;

/**
 * Uma linha da planilha de regimes, como ela chega da tela.
 *
 * ⚠️ TUDO COMO TEXTO. A matricula tem zeros a esquerda (0001764) e o xlsx a
 * converte em numero se puder — o mesmo defeito que ja custou uma correcao em
 * massa na exportacao do HikCentral. Os enums e as datas tambem chegam crus e
 * sao interpretados no servico, onde a linha invalida vira CONFLITO com o motivo
 * escrito, em vez de estourar a importacao inteira.
 */
@Data
public class RegimeImportRow {

    /** Numero da linha na planilha, para o operador achar o que corrigir. */
    private int linha;

    private String matricula;
    private String regimeGeneral;
    private String regimeSortie;
    private String validFrom;
    private String validUntil;
    private String authorizedByFamily;
    private String documentoRef;
    private String assinadoEm;
    private String note;
}
