package com.magbo.access.repositories;

import com.magbo.access.models.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AccessLogRepository extends JpaRepository<AccessLog, Long> {

    List<AccessLog> findByPointIdOrderByTimestampDesc(String pointId);
}
