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
}
