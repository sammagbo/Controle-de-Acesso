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
}
