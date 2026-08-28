package com.magbo.access.repositories;

import com.magbo.access.models.CdiAlertEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CdiAlertEventRepository extends JpaRepository<CdiAlertEvent, Long> {

    /** As mais recentes primeiro — a pergunta real e «o que aconteceu ultimamente». */
    List<CdiAlertEvent> findAllByOrderByEventTimeDesc(Pageable pageable);
}
