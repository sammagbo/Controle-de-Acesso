package com.magbo.access.repositories;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;

import java.lang.reflect.Method;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * GUARDA DA CONSULTA QUE A SUITE NAO EXECUTA.
 *
 * currentOccupancyByPoint usa DISTINCT ON — exclusivo do PostgreSQL — e por
 * isso esta @Disabled no H2 (LegacyRegressionIT). Consequencia medida em
 * 10/08/2026: a primeira versao do filtro de posto fixo passou nas 546 e
 * estava ERRADA — excluia tambem a SAIDA marcada, e quem tem posto fixo
 * constava "dentro" ate a meia-noite mesmo tendo ido embora. So apareceu na
 * conferencia manual em PostgreSQL real (docs/frontend-smoke-checklist.md,
 * secao 6-bis).
 *
 * Este teste nao executa a consulta (nao ha como, em H2): ele le a STRING da
 * anotacao @Query por reflexao e afirma que o predicado ASSIMETRICO esta la.
 * Pega as duas regressoes conhecidas:
 *
 *   1. a forma SIMETRICA — (flag IS NULL OR flag <> 'POSTO_FIXO') sem o
 *      `OR action <> 'ENTRADA'` — que esconde a saida real de quem tem posto
 *      fixo e o deixa preso "dentro";
 *   2. a variante com NOT — `NOT (flag = 'POSTO_FIXO' AND ...)` — que parece
 *      equivalente e devolve ZERO linhas: `flag = 'POSTO_FIXO'` e NULL quando
 *      a flag e nula, NOT NULL e NULL, e quase toda a base tem flag nula.
 *      Verificada em 10/08: falha exatamente assim.
 *
 * A comparacao NORMALIZA o espacamento antes (\s+ -> um espaco) de proposito:
 * o objetivo e prender o PREDICADO, nao a formatacao. Reformatar o SQL —
 * quebrar linha, indentar, juntar as strings concatenadas — nao pode quebrar
 * este teste; trocar a logica do filtro, tem que quebrar.
 */
class AccessLogRepositoryQueryGuardTest {

    /** SQL da anotacao @Query, com o espacamento normalizado. */
    private String sqlNormalizado(String metodo, Class<?>... parametros) throws NoSuchMethodException {
        Method m = AccessLogRepository.class.getMethod(metodo, parametros);
        Query q = m.getAnnotation(Query.class);
        assertThat(q)
                .as("o metodo %s deveria ter @Query — se a consulta virou derivada, este guarda precisa ser revisto", metodo)
                .isNotNull();
        return q.value().replaceAll("\\s+", " ").trim();
    }

    @Test
    @DisplayName("★ currentOccupancyByPoint mantem a exclusao ASSIMETRICA (tira a ENTRADA marcada, nunca a SAIDA)")
    void ocupacaoAtualMantemAExclusaoAssimetrica() throws Exception {
        String sql = sqlNormalizado("currentOccupancyByPoint", LocalDateTime.class);

        assertThat(sql)
                .as("sem o `OR action <> 'ENTRADA'`, a saida real de quem tem posto fixo some do "
                        + "DISTINCT ON e a pessoa consta \"dentro\" ate a meia-noite — ver a secao 6-bis "
                        + "do frontend-smoke-checklist.md, com a medicao de 10/08/2026")
                .contains("(flag IS NULL OR flag <> 'POSTO_FIXO' OR action <> 'ENTRADA')");

        assertThat(sql)
                .as("a variante `NOT (flag = ...)` parece equivalente e devolve ZERO linhas "
                        + "(NULL na flag nula engole a base inteira) — verificada e proibida")
                .doesNotContain("NOT (flag");
    }
}
