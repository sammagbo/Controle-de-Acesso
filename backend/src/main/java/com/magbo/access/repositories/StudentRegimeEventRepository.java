package com.magbo.access.repositories;

import com.magbo.access.models.StudentRegimeEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StudentRegimeEventRepository extends JpaRepository<StudentRegimeEvent, Long> {

    /** Historico de um aluno, o mais recente primeiro. */
    List<StudentRegimeEvent> findByUserIdOrderByChangedAtDesc(String userId);
}
