package com.magbo.access.dto;

import lombok.Data;
import java.time.LocalDate;

@Data
public class MealEntitlementBulkItem {
    /**
     * Numero da linha NA PLANILHA, como o front a leu.
     *
     * ⚠️ Existe porque o servidor nao pode deduzi-lo. Ele calculava
     * `indice + 2`, o que so acerta quando o front manda exatamente as linhas do
     * arquivo, na ordem, sem tirar nenhuma. Basta uma linha em branco no meio —
     * que o leitor descarta — para todo numero seguinte apontar uma linha acima
     * do problema. Medido no arquivo de prova em 21/08/2026: o aluno 0009999
     * esta na linha 23 e o plano dizia 22.
     *
     * ⚠️ E ficou pior quando o front passou a NAO ENVIAR as linhas de data
     * ilegivel (para uma celula nao derrubar o lote inteiro com 400): cada linha
     * omitida deslocava todas as seguintes. Um numero de linha que aponta a
     * linha errada e pior do que nenhum — manda o operador corrigir a celula
     * errada.
     *
     * Nulo = pedido antigo (ou de outro cliente): o servico volta a `indice + 2`.
     */
    private Integer linha;

    private String userId;
    private String status;
    private LocalDate validFrom;
    private LocalDate validUntil;
    private String note;
}
