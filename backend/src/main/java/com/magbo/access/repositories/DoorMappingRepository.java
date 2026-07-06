package com.magbo.access.repositories;

import com.magbo.access.models.DoorMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DoorMappingRepository extends JpaRepository<DoorMapping, Long> {

    @Query("SELECT dm FROM DoorMapping dm WHERE dm.ativo = true " +
            "AND dm.doorNo = :doorNo " +
            "AND (dm.readerNo = :readerNo OR (dm.readerNo IS NULL AND :readerNo IS NULL)) " +
            "AND (dm.terminalIp = :terminalIp OR dm.terminalIp IS NULL) " +
            "ORDER BY CASE WHEN dm.terminalIp = :terminalIp THEN 0 ELSE 1 END")
    List<DoorMapping> findBestMatch(
            @Param("doorNo") Integer doorNo,
            @Param("readerNo") Integer readerNo,
            @Param("terminalIp") String terminalIp);

    @Query("SELECT dm FROM DoorMapping dm WHERE dm.ativo = true " +
            "AND dm.terminalIp = :terminalIp AND dm.doorNo IS NULL")
    List<DoorMapping> findIpOnlyMatch(@Param("terminalIp") String terminalIp);

    List<DoorMapping> findAllByOrderByDoorNoAscReaderNoAsc();

    Optional<DoorMapping> findByDoorNoAndReaderNoAndTerminalIp(
            Integer doorNo, Integer readerNo, String terminalIp);
}
