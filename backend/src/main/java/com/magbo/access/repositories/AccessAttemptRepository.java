package com.magbo.access.repositories;

import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.DenialReason;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AccessAttemptRepository extends JpaRepository<AccessAttempt, Long> {

    long countByTimestampGreaterThanEqual(LocalDateTime start);

    long countByDenialReasonAndTimestampGreaterThanEqual(DenialReason reason, LocalDateTime start);

    List<AccessAttempt> findTop200ByPointIdInAndTimestampAfterOrderByTimestampDesc(List<String> pointIds, LocalDateTime after);

    List<AccessAttempt> findTop200ByUserIdOrderByTimestampDesc(String userId);

    @org.springframework.data.jpa.repository.Query("""
        SELECT a FROM AccessAttempt a
        WHERE (:#{#from == null} = true OR a.timestamp >= :from)
          AND (:#{#to == null} = true OR a.timestamp <= :to)
          AND (:#{#pointId == null} = true OR a.pointId = :pointId)
          AND (:#{#userId == null} = true OR a.userId = :userId)
          AND (:#{#reason == null} = true OR a.denialReason = :reason)
          AND (:#{#method == null} = true OR a.authMethod = :method)
        ORDER BY a.timestamp DESC
    """)
    org.springframework.data.domain.Page<AccessAttempt> findFiltered(
        @org.springframework.data.repository.query.Param("from") java.time.LocalDateTime from,
        @org.springframework.data.repository.query.Param("to") java.time.LocalDateTime to,
        @org.springframework.data.repository.query.Param("pointId") String pointId,
        @org.springframework.data.repository.query.Param("userId") String userId,
        @org.springframework.data.repository.query.Param("reason") com.magbo.access.models.DenialReason reason,
        @org.springframework.data.repository.query.Param("method") com.magbo.access.models.AuthMethod method,
        org.springframework.data.domain.Pageable pageable
    );

    @org.springframework.data.jpa.repository.Query("SELECT a.denialReason, COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start GROUP BY a.denialReason")
    List<Object[]> countByReasonSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query("SELECT a.pointId, COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start GROUP BY a.pointId")
    List<Object[]> countByPointSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query("SELECT a.authMethod, COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start GROUP BY a.authMethod")
    List<Object[]> countByMethodSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query(value = "SELECT u.turma, COUNT(a.id) FROM access_attempts a JOIN app_users u ON u.id = a.user_id WHERE a.timestamp >= :start GROUP BY u.turma", nativeQuery = true)
    List<Object[]> countByTurmaSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start AND a.authResult = com.magbo.access.models.AuthResult.SUCCESS AND a.authorizationResult = com.magbo.access.models.AuthorizationResult.DENIED")
    long countDivergenceSince(@org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

}
