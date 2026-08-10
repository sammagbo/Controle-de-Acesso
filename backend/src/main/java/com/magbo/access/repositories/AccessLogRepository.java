package com.magbo.access.repositories;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import org.springframework.data.domain.Pageable;
import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * ⚠️ POSTO FIXO E AS CONSULTAS DAQUI.
 *
 * Uma linha com {@code flag='POSTO_FIXO'} e a repeticao do dia de quem
 * TRABALHA naquele ponto (ver {@link com.magbo.access.services.PostoFixoService}).
 * Ela EXISTE no banco, e para sempre — nada e apagado. O que muda e quem a
 * conta:
 *
 *   • telas padrao e contadores  -> NAO contam (o ruido e justamente o problema);
 *   • Journal / auditoria        -> contam TUDO, sempre;
 *   • contagens de pessoas DISTINTAS -> intocadas de proposito: a primeira
 *     passagem do dia nunca e marcada, entao a pessoa ja entra no DISTINCT por
 *     ela e o resultado seria numericamente identico. Mexer ali seria churn
 *     sem efeito.
 *
 * O predicado da exclusao e sempre o mesmo, e o {@code IS NULL} nao e enfeite:
 * a esmagadora maioria das linhas tem flag nula, e {@code flag <> 'POSTO_FIXO'}
 * sozinho e UNKNOWN para NULL em SQL — descartaria a base inteira em silencio.
 *
 *   JPQL   : (a.flag IS NULL OR a.flag <> 'POSTO_FIXO')
 *   nativa : (flag IS NULL OR flag <> 'POSTO_FIXO')
 */
@Repository
public interface AccessLogRepository extends JpaRepository<AccessLog, Long> {

    List<AccessLog> findTop500ByPointIdAndTimestampGreaterThanEqualOrderByTimestampDesc(String pointId, LocalDateTime timestamp);

    /**
     * Fonte das telas de setor (portaria, enfermaria, cantina) e do CDI.
     *
     * Substitui a derivada acima porque a exclusao do posto fixo tem que
     * acontecer NO BANCO, antes do teto de 500. Filtrar depois de carregar
     * devolveria menos de 500 linhas com passagens reais sobrando fora da
     * pagina — o mesmo defeito que fez o filtro de aluno do Journal migrar para
     * a consulta.
     *
     * @param incluirPostoFixo o que o botao da tela liga. false (padrao)
     *                         esconde a repeticao de quem esta de servico;
     *                         true mostra tudo, sem esconder nada de ninguem
     */
    @Query("""
        SELECT a FROM AccessLog a
        WHERE a.pointId = :pointId
          AND a.timestamp >= :desde
          AND (:incluirPostoFixo = true
               OR a.flag IS NULL OR a.flag <> 'POSTO_FIXO')
        ORDER BY a.timestamp DESC
    """)
    List<AccessLog> findRecentesDoPonto(
            @Param("pointId") String pointId,
            @Param("desde") LocalDateTime desde,
            @Param("incluirPostoFixo") boolean incluirPostoFixo,
            Pageable pageable);

    /**
     * POSTO FIXO: esta pessoa ja passou por este ponto no dia?
     *
     * A janela vem fechada dos dois lados (00:00:00 a 23:59:59.999999999) pelo
     * chamador, porque o dia sai da hora do EVENTO — e uma fila offline
     * esvaziada entrega evento de ontem hoje.
     */
    boolean existsByUserIdAndPointIdAndTimestampBetween(
            String userId, String pointId, LocalDateTime from, LocalDateTime to);

    List<AccessLog> findTop500ByUserIdAndTimestampBetweenOrderByTimestampDesc(String userId, LocalDateTime from, LocalDateTime to);

    List<AccessLog> findAllByOrderByTimestampDesc(Pageable pageable);

    Optional<AccessLog> findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(
            String userId, String pointId, AccessAction action);

    List<AccessLog> findByUserIdAndPointIdAndActionAndTimestampAfter(
            String userId, String pointId, AccessAction action, LocalDateTime after);

    /**
     * MESMA PASSAGEM: ja existe acesso aceito desta pessoa, neste ponto, nesta
     * acao, dentro da janela? Intervalo fechado dos dois lados de proposito —
     * a fila offline entrega evento fora de ordem, e o repetido pode chegar com
     * hora ANTERIOR a do que ja esta gravado.
     */
    boolean existsByUserIdAndPointIdAndActionAndTimestampBetween(
            String userId, String pointId, AccessAction action,
            LocalDateTime from, LocalDateTime to);

    /**
     * FECHAMENTO AUTOMATICO: ultimo evento do usuario naquele ponto dentro do
     * dia. Se for ENTRADA, a pessoa ficou "dentro" e precisa da SAIDA sintetica.
     */
    List<AccessLog> findByPointIdAndTimestampBetweenOrderByTimestampAsc(
            String pointId, LocalDateTime from, LocalDateTime to);

    /**
     * Consulta do Journal (Rapport General).
     *
     * O filtro de ELEVE roda AQUI, no banco, e nao sobre as linhas ja
     * carregadas na tela: com o teto de 500 linhas por carga, um aluno que
     * passou cedo num dia cheio simplesmente nao estaria entre as linhas
     * filtraveis no cliente, e a busca devolveria zero sem explicar por que.
     *
     * Casa por MATRICULA (o proprio user_id do log, que e o id do Pronote com
     * zeros a esquerda) OU por NOME do aluno em app_users. Os dois porque o
     * operador usa os dois: o nome quando conhece o aluno, a matricula quando
     * esta lendo de uma lista. O EXISTS, e nao um JOIN: movimento de matricula
     * sem cadastro em app_users (aluno removido, id fora do Pronote) nao pode
     * sumir do Journal — some do JOIN, sobrevive ao EXISTS.
     *
     * @param eleve termo JA em minusculas e JA entre '%' (o controller monta);
     *              null quando o filtro esta vazio
     * @param somentePostoFixo lente do POSTO FIXO, e uma lente so — o padrao
     *              nao esconde nada. {@code null} = mostra TUDO, que e como o
     *              Journal abre e como ele tem que continuar abrindo (e a visao
     *              de auditoria). {@code TRUE} = so as repeticoes marcadas, para
     *              conferir quanto ruido o posto fixo esta absorvendo.
     *              {@code FALSE} = tudo menos elas, que e o que as outras telas
     *              ja mostram.
     */
    @Query("""
        SELECT a FROM AccessLog a
        WHERE (:#{#dateFrom == null} = true OR a.timestamp >= :dateFrom)
          AND (:#{#dateTo == null} = true OR a.timestamp <= :dateTo)
          AND (:#{#pointId == null} = true OR a.pointId = :pointId)
          AND (:#{#action == null} = true OR a.action = :action)
          AND (:#{#eleve == null} = true
               OR LOWER(a.userId) LIKE :eleve
               OR EXISTS (SELECT 1 FROM User u
                          WHERE u.id = a.userId AND LOWER(u.nome) LIKE :eleve))
          AND (:#{#somentePostoFixo == null} = true
               OR (:#{#somentePostoFixo == true} = true AND a.flag = 'POSTO_FIXO')
               OR (:#{#somentePostoFixo == false} = true
                   AND (a.flag IS NULL OR a.flag <> 'POSTO_FIXO')))
        ORDER BY a.timestamp DESC
    """)
    List<AccessLog> findFilteredLogs(
        @Param("dateFrom") LocalDateTime dateFrom,
        @Param("dateTo") LocalDateTime dateTo,
        @Param("pointId") String pointId,
        @Param("action") com.magbo.access.models.AccessAction action,
        @Param("eleve") String eleve,
        @Param("somentePostoFixo") Boolean somentePostoFixo,
        Pageable pageable
    );

    /**
     * Conta TODOS os eventos de acesso a partir de um instante — inclusive as
     * repeticoes de posto fixo.
     *
     * Deliberadamente CRUA e deliberadamente mantida. E a contagem que prova
     * que nada foi apagado: se ela e {@link #countRelevantesSince} divergem, a
     * diferenca sao exatamente as linhas marcadas, que continuam la.
     * Os contadores de tela usam a outra.
     */
    long countByTimestampGreaterThanEqual(LocalDateTime start);

    /**
     * O mesmo periodo, sem a repeticao de quem esta de servico no ponto.
     *
     * Este e o numero que vai para a tela ("mouvements aujourd'hui"): o
     * porteiro reconhecido 40 vezes pela camera nao pode valer 40 movimentos da
     * escola.
     */
    @Query("""
        SELECT COUNT(a) FROM AccessLog a
        WHERE a.timestamp >= :start
          AND (a.flag IS NULL OR a.flag <> 'POSTO_FIXO')
    """)
    long countRelevantesSince(@Param("start") LocalDateTime start);

    /** Histórico de uma pessoa — decide se um cadastro pode ser apagado ou só inativado. */
    long countByUserId(String userId);

    // Conta acessos barrados hoje (com flag definida)
    //
    // ⚠️ POSTO_FIXO fica de fora, e esta e a exclusao mais importante de todas:
    // o card conta "linha com flag", e sem isto a marca criada para SILENCIAR
    // ruido viraria ela propria um alerta — a repeticao do porteiro apareceria
    // na tela da direcao como dezenas de "alertas hoje". A flag nomeia uma
    // passagem NORMAL de quem esta de servico; alerta ela nao e.
    @Query("""
        SELECT COUNT(a) FROM AccessLog a
        WHERE a.timestamp >= :start
          AND a.flag IS NOT NULL AND a.flag <> ''
          AND a.flag <> 'POSTO_FIXO'
    """)
    long countBlockedSince(@Param("start") LocalDateTime start);

    // Conta pessoas "dentro" de pontos especiais: usuarios com ENTRADA hoje sem SAIDA correspondente posterior
    // Simplificação: conta IDs distintos de usuários cuja última ação hoje foi ENTRADA
    //
    // ⚠️ As ENTRADAs de posto fixo saem da contagem, mas as SAIDAs marcadas
    // continuam FECHANDO no NOT EXISTS: uma saida real fecha a presenca tenha
    // ela flag ou nao. Excluir dos dois lados deixaria de pe quem ja saiu.
    @Query("""
        SELECT COUNT(DISTINCT a.userId) FROM AccessLog a
        WHERE a.timestamp >= :start
          AND a.action = com.magbo.access.models.AccessAction.ENTRADA
          AND (a.flag IS NULL OR a.flag <> 'POSTO_FIXO')
          AND NOT EXISTS (
              SELECT 1 FROM AccessLog b
              WHERE b.userId = a.userId
                AND b.timestamp > a.timestamp
                AND b.action = com.magbo.access.models.AccessAction.SAIDA
          )
    """)
    long countActiveUsersSince(@Param("start") LocalDateTime start);

    List<AccessLog> findByPointIdInAndTimestampAfterOrderByTimestampDesc(
            List<String> pointIds, LocalDateTime after);

    List<AccessLog> findByPointIdInAndTimestampBetweenOrderByTimestampDesc(
            List<String> pointIds, LocalDateTime from, LocalDateTime to);

    // Total de movimentos no período (excluindo portões e a repetição de posto fixo)
    @Query(value = "SELECT COUNT(*) FROM access_logs WHERE timestamp BETWEEN :from AND :to AND point_id NOT IN ('PORT1','PORT2','PORT3') AND (flag IS NULL OR flag <> 'POSTO_FIXO')", nativeQuery = true)
    long countMovementsInternal(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Total de movimentos no período — CRU, inclusive posto fixo.
    // Contraparte de countMovementsInternal e a prova de que nada é apagado.
    @Query(value = "SELECT COUNT(*) FROM access_logs WHERE timestamp BETWEEN :from AND :to", nativeQuery = true)
    long countMovements(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Alunos únicos no período.
    // Sem exclusão de posto fixo de propósito: a PRIMEIRA passagem do dia nunca
    // é marcada, então a pessoa já entra no DISTINCT por ela — o resultado
    // seria idêntico e o filtro, ruído no código.
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM access_logs WHERE timestamp BETWEEN :from AND :to", nativeQuery = true)
    long countUniqueStudents(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Movimentos por hora (0-23)
    @Query(value = "SELECT CAST(EXTRACT(HOUR FROM timestamp) AS int) AS hour, COUNT(*) AS cnt FROM access_logs WHERE timestamp BETWEEN :from AND :to AND point_id NOT IN ('PORT1','PORT2','PORT3') AND (flag IS NULL OR flag <> 'POSTO_FIXO') GROUP BY hour ORDER BY hour", nativeQuery = true)
    java.util.List<Object[]> countByHour(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Movimentos, únicos e entradas por point_id no período
    @Query(value = "SELECT point_id, COUNT(*) AS mov, COUNT(DISTINCT user_id) AS uniq, COUNT(*) FILTER (WHERE action='ENTRADA') AS entries FROM access_logs WHERE timestamp BETWEEN :from AND :to AND (flag IS NULL OR flag <> 'POSTO_FIXO') GROUP BY point_id", nativeQuery = true)
    java.util.List<Object[]> statsByPoint(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Refeições fora do horário (flag)
    @Query(value = "SELECT COUNT(*) FROM access_logs WHERE action='ENTRADA' AND flag='FORA_HORARIO' AND timestamp BETWEEN :from AND :to", nativeQuery = true)
    long countOffScheduleMeals(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Alunos distintos que entraram por um portão hoje
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM access_logs " +
           "WHERE action='ENTRADA' AND point_id IN ('PORT1','PORT2','PORT3') " +
           "AND timestamp >= :dayStart", nativeQuery = true)
    long countPresentToday(@Param("dayStart") java.time.LocalDateTime dayStart);

    // Séjours prolongés na enfermaria no período (entrada + saída pareadas, dur > 30min)
    //
    // ⚠️ A exclusão de posto fixo vai só na ENTRADA (a linha externa). A
    // subconsulta que procura a SAÍDA vê TODAS as linhas de propósito: a saída
    // aconteceu, tenha ela flag ou não, e escondê-la inventaria um séjour que
    // nunca terminou. Sem isto, a enfermeira postada em ENFERM produziria um
    // "séjour prolongé" por reconhecimento.
    @Query(value = "SELECT COUNT(*) FROM (" +
           "  SELECT e.user_id, e.timestamp AS ent, " +
           "    (SELECT MIN(s.timestamp) FROM access_logs s WHERE s.user_id=e.user_id AND s.point_id='ENFERM' AND s.action='SAIDA' AND s.timestamp > e.timestamp) AS sai " +
           "  FROM access_logs e WHERE e.point_id='ENFERM' AND e.action='ENTRADA' AND e.timestamp BETWEEN :from AND :to" +
           "    AND (e.flag IS NULL OR e.flag <> 'POSTO_FIXO')" +
           ") t WHERE t.sai IS NOT NULL AND EXTRACT(EPOCH FROM (t.sai - t.ent))/60 > 30", nativeQuery = true)
    long countLongInfirmaryStays(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Entradas sem saída correspondente (cantina + enfermaria) no período
    //
    // ⚠️ Mesma assimetria da consulta acima, e pelo mesmo motivo: exclui a
    // ENTRADA marcada, nunca a SAÍDA que a fecha.
    @Query(value = "SELECT COUNT(*) FROM access_logs e " +
           "WHERE e.action='ENTRADA' AND e.point_id IN ('REFEI1','REFEI2','ENFERM') " +
           "AND e.timestamp BETWEEN :from AND :to " +
           "AND (e.flag IS NULL OR e.flag <> 'POSTO_FIXO') " +
           "AND NOT EXISTS (SELECT 1 FROM access_logs s WHERE s.user_id=e.user_id AND s.point_id=e.point_id AND s.action='SAIDA' AND s.timestamp > e.timestamp AND s.timestamp < e.timestamp + interval '4 hours')", nativeQuery = true)
    long countUnregisteredExits(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Ocupação atual por setor: última ação de cada user em cada ponto = ENTRADA
    //
    // ⚠️ A exclusão é ASSIMÉTRICA — tira a ENTRADA marcada, NUNCA a SAÍDA.
    // Mesma assimetria de countLongInfirmaryStays e countUnregisteredExits, e
    // aqui ela foi aprendida do jeito caro (conferência manual em PostgreSQL
    // real, 10/08/2026).
    //
    // A primeira versão excluía TODA linha marcada. O DISTINCT ON escolhe a
    // última linha de cada (user, ponto); tirando também a saída, quem tem
    // posto fixo ficava preso na primeira entrada do dia e aparecia como
    // "dentro" ATÉ A MEIA-NOITE, mesmo tendo ido embora — a bibliotecária que
    // saiu às 17:00 constava no CDI às 23:00. Medido: BIBLIO 1->2, REFEI1 1->2,
    // PORT1 0->1, com as três pessoas fora do prédio.
    // E o fechamento automático não corrige: ele olha o último evento CRU, vê
    // uma SAIDA e corretamente não faz nada.
    //
    // Com a assimetria: a repetição não reabre presença (a oscilação, que era o
    // objetivo, some) e a saída real continua fechando.
    //
    // O `flag IS NULL OR` não é enfeite: quase toda linha tem flag nula, e
    // `flag <> 'POSTO_FIXO'` sozinho é UNKNOWN para NULL. A forma equivalente
    // `NOT (flag = 'POSTO_FIXO' AND action = 'ENTRADA')` devolve ZERO linhas
    // pelo mesmo motivo — foi verificada, e falha assim.
    //
    // ⚠️ PostgreSQL-only (DISTINCT ON): @Disabled no H2, a suíte NÃO protege
    // esta consulta. Roteiro de conferência manual em
    // docs/frontend-smoke-checklist.md, seção "Ocupação atual com posto fixo".
    @Query(value = "SELECT point_id, COUNT(*) FROM (" +
           "  SELECT DISTINCT ON (user_id, point_id) user_id, point_id, action " +
           "  FROM access_logs WHERE timestamp >= :dayStart " +
           "    AND (flag IS NULL OR flag <> 'POSTO_FIXO' OR action <> 'ENTRADA') " +
           "  ORDER BY user_id, point_id, timestamp DESC" +
           ") last WHERE action='ENTRADA' GROUP BY point_id", nativeQuery = true)
    java.util.List<Object[]> currentOccupancyByPoint(@Param("dayStart") java.time.LocalDateTime dayStart);

    // Élèves únicos no período para um conjunto de pontos (uma área)
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM access_logs " +
           "WHERE timestamp BETWEEN :from AND :to AND point_id IN (:points)", nativeQuery = true)
    long countUniqueStudentsByPoints(@Param("from") java.time.LocalDateTime from,
                                     @Param("to") java.time.LocalDateTime to,
                                     @Param("points") java.util.Collection<String> points);

    // Permanência média (min): pares ENTRADA→SAIDA do mesmo user/ponto/dia via LAG
    //
    // ⚠️ Aqui a exclusão é simétrica (dentro do WINDOW, dos dois lados) — ao
    // contrário das duas consultas de "entrada sem saída". A diferença: ali
    // esconder a saída inventaria um problema; aqui o LAG emparelha vizinhos, e
    // deixar as repetições de quem está de serviço no meio produziria pares
    // ENTRADA→SAIDA de segundos que puxariam a permanência média para baixo.
    @Query(value = "SELECT AVG(EXTRACT(EPOCH FROM (ts - prev_ts)) / 60.0) FROM (" +
           "  SELECT action, timestamp AS ts, " +
           "    LAG(action) OVER w AS prev_action, " +
           "    LAG(timestamp) OVER w AS prev_ts " +
           "  FROM access_logs " +
           "  WHERE timestamp BETWEEN :from AND :to AND point_id IN (:points) " +
           "    AND (flag IS NULL OR flag <> 'POSTO_FIXO') " +
           "  WINDOW w AS (PARTITION BY user_id, point_id, CAST(timestamp AS date) ORDER BY timestamp)" +
           ") t WHERE t.action = 'SAIDA' AND t.prev_action = 'ENTRADA'", nativeQuery = true)
    Double avgStayMinutesByPoints(@Param("from") java.time.LocalDateTime from,
                                  @Param("to") java.time.LocalDateTime to,
                                  @Param("points") java.util.Collection<String> points);
}
