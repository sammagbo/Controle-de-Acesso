package com.magbo.access.repositories;

import com.magbo.access.models.ExitPermissionStatus;
import com.magbo.access.models.StudentExitPermission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StudentExitPermissionRepository extends JpaRepository<StudentExitPermission, Long> {

    List<StudentExitPermission> findByUserIdAndStatus(String userId, ExitPermissionStatus status);

    List<StudentExitPermission> findByStatusOrderByCreatedAtDesc(ExitPermissionStatus status);

    List<StudentExitPermission> findByUserIdOrderByCreatedAtDesc(String userId);

    @org.springframework.data.jpa.repository.Query("""
        SELECT p, u.nome, u.turma
        FROM StudentExitPermission p
        JOIN User u ON p.userId = u.id
        WHERE (:#{#userId == null} = true OR p.userId = :userId)
          AND (:#{#status == null} = true OR p.status = :status)
          AND (:#{#type == null} = true OR p.permissionType = :type)
          AND (CAST(:from AS java.time.LocalDateTime) IS NULL OR p.createdAt >= :from)
          AND (CAST(:to AS java.time.LocalDateTime) IS NULL OR p.createdAt <= :to)
        ORDER BY p.createdAt DESC
    """)
    org.springframework.data.domain.Page<Object[]> findFiltered(
        @org.springframework.data.repository.query.Param("userId") String userId,
        @org.springframework.data.repository.query.Param("status") ExitPermissionStatus status,
        @org.springframework.data.repository.query.Param("type") com.magbo.access.models.ExitPermissionType type,
        @org.springframework.data.repository.query.Param("from") java.time.LocalDateTime from,
        @org.springframework.data.repository.query.Param("to") java.time.LocalDateTime to,
        org.springframework.data.domain.Pageable pageable
    );
}
