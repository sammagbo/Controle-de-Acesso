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

@Repository
public interface AccessLogRepository extends JpaRepository<AccessLog, Long> {

    List<AccessLog> findTop500ByPointIdAndTimestampGreaterThanEqualOrderByTimestampDesc(String pointId, LocalDateTime timestamp);

    List<AccessLog> findTop500ByUserIdAndTimestampBetweenOrderByTimestampDesc(String userId, LocalDateTime from, LocalDateTime to);

    List<AccessLog> findAllByOrderByTimestampDesc(Pageable pageable);

    Optional<AccessLog> findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(
            String userId, String pointId, AccessAction action);

    List<AccessLog> findByUserIdAndPointIdAndActionAndTimestampAfter(
            String userId, String pointId, AccessAction action, LocalDateTime after);

    @Query("""
        SELECT a FROM AccessLog a
        WHERE (:#{#dateFrom == null} = true OR a.timestamp >= :dateFrom)
          AND (:#{#dateTo == null} = true OR a.timestamp <= :dateTo)
          AND (:#{#pointId == null} = true OR a.pointId = :pointId)
          AND (:#{#action == null} = true OR a.action = :action)
        ORDER BY a.timestamp DESC
    """)
    List<AccessLog> findFilteredLogs(
        @Param("dateFrom") LocalDateTime dateFrom,
        @Param("dateTo") LocalDateTime dateTo,
        @Param("pointId") String pointId,
        @Param("action") com.magbo.access.models.AccessAction action,
        Pageable pageable
    );

    // Conta TODOS os eventos de acesso a partir de um instante (use start = hoje 00:00)
    long countByTimestampGreaterThanEqual(LocalDateTime start);

    // Conta acessos barrados hoje (com flag definida)
    @Query("SELECT COUNT(a) FROM AccessLog a WHERE a.timestamp >= :start AND a.flag IS NOT NULL AND a.flag <> ''")
    long countBlockedSince(@Param("start") LocalDateTime start);

    // Conta pessoas "dentro" de pontos especiais: usuarios com ENTRADA hoje sem SAIDA correspondente posterior
    // Simplificação: conta IDs distintos de usuários cuja última ação hoje foi ENTRADA
    @Query("""
        SELECT COUNT(DISTINCT a.userId) FROM AccessLog a
        WHERE a.timestamp >= :start
          AND a.action = com.magbo.access.models.AccessAction.ENTRADA
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

    // Total de movimentos no período (excluindo portões)
    @Query(value = "SELECT COUNT(*) FROM access_logs WHERE timestamp BETWEEN :from AND :to AND point_id NOT IN ('PORT1','PORT2','PORT3')", nativeQuery = true)
    long countMovementsInternal(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Total de movimentos no período
    @Query(value = "SELECT COUNT(*) FROM access_logs WHERE timestamp BETWEEN :from AND :to", nativeQuery = true)
    long countMovements(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Alunos únicos no período
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM access_logs WHERE timestamp BETWEEN :from AND :to", nativeQuery = true)
    long countUniqueStudents(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Movimentos por hora (0-23)
    @Query(value = "SELECT CAST(EXTRACT(HOUR FROM timestamp) AS int) AS hour, COUNT(*) AS cnt FROM access_logs WHERE timestamp BETWEEN :from AND :to AND point_id NOT IN ('PORT1','PORT2','PORT3') GROUP BY hour ORDER BY hour", nativeQuery = true)
    java.util.List<Object[]> countByHour(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Movimentos, únicos e entradas por point_id no período
    @Query(value = "SELECT point_id, COUNT(*) AS mov, COUNT(DISTINCT user_id) AS uniq, COUNT(*) FILTER (WHERE action='ENTRADA') AS entries FROM access_logs WHERE timestamp BETWEEN :from AND :to GROUP BY point_id", nativeQuery = true)
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
    @Query(value = "SELECT COUNT(*) FROM (" +
           "  SELECT e.user_id, e.timestamp AS ent, " +
           "    (SELECT MIN(s.timestamp) FROM access_logs s WHERE s.user_id=e.user_id AND s.point_id='ENFERM' AND s.action='SAIDA' AND s.timestamp > e.timestamp) AS sai " +
           "  FROM access_logs e WHERE e.point_id='ENFERM' AND e.action='ENTRADA' AND e.timestamp BETWEEN :from AND :to" +
           ") t WHERE t.sai IS NOT NULL AND EXTRACT(EPOCH FROM (t.sai - t.ent))/60 > 30", nativeQuery = true)
    long countLongInfirmaryStays(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Entradas sem saída correspondente (cantina + enfermaria) no período
    @Query(value = "SELECT COUNT(*) FROM access_logs e " +
           "WHERE e.action='ENTRADA' AND e.point_id IN ('REFEI1','REFEI2','ENFERM') " +
           "AND e.timestamp BETWEEN :from AND :to " +
           "AND NOT EXISTS (SELECT 1 FROM access_logs s WHERE s.user_id=e.user_id AND s.point_id=e.point_id AND s.action='SAIDA' AND s.timestamp > e.timestamp AND s.timestamp < e.timestamp + interval '4 hours')", nativeQuery = true)
    long countUnregisteredExits(@Param("from") java.time.LocalDateTime from, @Param("to") java.time.LocalDateTime to);

    // Ocupação atual por setor: última ação de cada user em cada ponto = ENTRADA
    @Query(value = "SELECT point_id, COUNT(*) FROM (" +
           "  SELECT DISTINCT ON (user_id, point_id) user_id, point_id, action " +
           "  FROM access_logs WHERE timestamp >= :dayStart " +
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
    @Query(value = "SELECT AVG(EXTRACT(EPOCH FROM (ts - prev_ts)) / 60.0) FROM (" +
           "  SELECT action, timestamp AS ts, " +
           "    LAG(action) OVER w AS prev_action, " +
           "    LAG(timestamp) OVER w AS prev_ts " +
           "  FROM access_logs " +
           "  WHERE timestamp BETWEEN :from AND :to AND point_id IN (:points) " +
           "  WINDOW w AS (PARTITION BY user_id, point_id, CAST(timestamp AS date) ORDER BY timestamp)" +
           ") t WHERE t.action = 'SAIDA' AND t.prev_action = 'ENTRADA'", nativeQuery = true)
    Double avgStayMinutesByPoints(@Param("from") java.time.LocalDateTime from,
                                  @Param("to") java.time.LocalDateTime to,
                                  @Param("points") java.util.Collection<String> points);
}
