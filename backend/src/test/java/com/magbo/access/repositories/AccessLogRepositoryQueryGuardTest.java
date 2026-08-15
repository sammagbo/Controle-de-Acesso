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
                .contains("(flag IS NULL OR flag NOT IN " + AccessLogRepository.REPETICOES
                        + " OR action <> 'ENTRADA')");

        assertThat(sql)
                .as("a variante `NOT (flag = ...)` parece equivalente e devolve ZERO linhas "
                        + "(NULL na flag nula engole a base inteira) — verificada e proibida")
                .doesNotContain("NOT (flag");
    }

    /**
     * ★ A LISTA DE FLAGS E UMA SO.
     *
     * Dez consultas repetindo literais e como uma flag nova entra em nove delas
     * e some da decima — e a que ficou de fora nao falha, so conta errado.
     * Aqui se cobra que toda consulta que exclui repeticao use a MESMA lista,
     * a de {@link AccessLogRepository#REPETICOES}.
     */
    @Test
    @DisplayName("★ toda exclusao de repeticao usa a lista unica, e ela tem as DUAS flags")
    void listaDeRepeticoesEUnica() {
        assertThat(AccessLogRepository.REPETICOES)
                .contains("POSTO_FIXO")
                .contains("JA_PRESENTE");

        long comLista = 0, comFlagSolta = 0;
        for (Method m : AccessLogRepository.class.getMethods()) {
            Query q = m.getAnnotation(Query.class);
            if (q == null) continue;
            String sql = q.value().replaceAll("\\s+", " ");
            if (!sql.contains("flag")) continue;
            if (sql.contains("NOT IN " + AccessLogRepository.REPETICOES)
                    || sql.contains("IN " + AccessLogRepository.REPETICOES)) {
                comLista++;
            } else if (sql.contains("'POSTO_FIXO'") || sql.contains("'JA_PRESENTE'")) {
                // Consulta que cita uma flag SEM passar pela lista: ou e um
                // caso legitimo e novo, ou e a decima que vai contar errado.
                comFlagSolta++;
                assertThat(sql)
                        .as("%s cita uma flag de repeticao sem usar AccessLogRepository.REPETICOES", m.getName())
                        .isNull();
            }
        }
        assertThat(comLista)
                .as("nenhuma consulta usa a lista — o guarda deixou de guardar alguma coisa")
                .isGreaterThan(0);
        assertThat(comFlagSolta).isZero();
    }

    /**
     * ★★★ A LISTA E O CONTADOR TEM DE FAZER A MESMA PERGUNTA.
     *
     * `countUnregisteredExits` diz QUANTOS movimentos ficaram incompletos; o card
     * "Sorties non enregistrees" mostra esse numero. `findUnregisteredExits`
     * devolve QUAIS — os nomes que a Vie Scolaire precisa para ir procurar
     * alguem. As duas consultas sao a MESMA pergunta com projecoes diferentes.
     *
     * ⚠️ No dia em que o card disser 7 e a lista trouxer 5, ninguem sabe qual
     * dos dois esta certo, e a resposta racional e nao usar nenhum dos dois. A
     * lista so vale enquanto ela FOR o contador.
     *
     * Nao da para executar a comparacao na suite: as duas sao PostgreSQL-only
     * pelo literal `interval '4 hours'` (o H2 exige `INTERVAL '4' HOUR`), e
     * gastar mais duas @Disabled quebraria a invariante do projeto — o criterio
     * e 0 falhas e EXATAMENTE 2 @Disabled, e "Skipped != 2" e como se descobre
     * que alguem desligou uma nativa. Entao vale aqui o mesmo remedio que a
     * ocupacao usa desde 10/08: comparar as STRINGS.
     *
     * O teste extrai o WHERE das duas e exige que sejam identicos. Reformatar,
     * indentar ou quebrar linha nao quebra (o espacamento e normalizado);
     * mudar o predicado de uma sem mudar o da outra, quebra.
     *
     * Conferencia da CONTAGEM em PostgreSQL real: secao 6-bis do
     * docs/frontend-smoke-checklist.md.
     */
    @Test
    @DisplayName("★★★ findUnregisteredExits e countUnregisteredExits tem o MESMO where")
    void listaEContadorFazemAMesmaPergunta() throws Exception {
        String contador = sqlNormalizado("countUnregisteredExits", LocalDateTime.class, LocalDateTime.class);
        String lista = sqlNormalizado("findUnregisteredExits", LocalDateTime.class, LocalDateTime.class);

        String whereDoContador = contador.substring(contador.indexOf("WHERE"));
        String whereDaLista = lista.substring(lista.indexOf("WHERE"));
        // A lista ordena; o contador nao. O ORDER BY nao faz parte da pergunta.
        int ob = whereDaLista.indexOf("ORDER BY");
        if (ob > 0) whereDaLista = whereDaLista.substring(0, ob).trim();

        assertThat(whereDaLista)
                .as("o card mostraria um numero e a lista logo abaixo mostraria outro. "
                        + "As duas consultas sao a mesma pergunta: se uma mudou, mude a outra "
                        + "na MESMA entrega.")
                .isEqualTo(whereDoContador);
    }

    /**
     * ★★ A saida ORFA e a pergunta pelo outro lado — e nao pode virar a mesma.
     *
     * `findOrphanExits` procura SAIDA sem ENTRADA anterior; e' a especie que os
     * dois endpoints de lista descartavam em silencio (`if (entrada == null)
     * continue;`) e que ninguem nunca viu. Ela NAO entra no contador de
     * proposito: mexer nele mudaria o significado da serie historica do painel
     * sem aviso.
     *
     * Este teste prende os dois lados invertidos — action='SAIDA' fora,
     * action='ENTRADA' dentro — porque copiar a consulta irma e esquecer de
     * inverter produz uma lista que parece certa e repete a primeira.
     */
    @Test
    @DisplayName("★★ findOrphanExits procura SAIDA sem ENTRADA — os lados invertidos")
    void saidaOrfaProcuraOInverso() throws Exception {
        String sql = sqlNormalizado("findOrphanExits", LocalDateTime.class, LocalDateTime.class);

        assertThat(sql)
                .as("o lado de FORA tem de ser a SAIDA")
                .contains("s.action='SAIDA'");
        assertThat(sql)
                .as("e o NOT EXISTS tem de procurar a ENTRADA que faltou")
                .contains("e.action='ENTRADA'");
        assertThat(sql)
                .as("a janela e' para TRAS (a entrada vem ANTES da saida) — com "
                        + "`e.timestamp > s.timestamp` esta consulta procuraria no futuro "
                        + "e devolveria a base inteira")
                .contains("e.timestamp < s.timestamp");
    }
}
