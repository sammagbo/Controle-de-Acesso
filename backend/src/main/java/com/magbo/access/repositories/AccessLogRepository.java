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

    List<AccessLog> findByPointIdOrderByTimestampDesc(String pointId);

    List<AccessLog> findAllByOrderByTimestampDesc(Pageable pageable);

    Optional<AccessLog> findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(
            String userId, String pointId, AccessAction action);

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
}
