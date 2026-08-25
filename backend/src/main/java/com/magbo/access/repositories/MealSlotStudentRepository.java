package com.magbo.access.repositories;

import com.magbo.access.models.MealSlotStudent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MealSlotStudentRepository extends JpaRepository<MealSlotStudent, Long> {

    List<MealSlotStudent> findByUserId(String userId);

    void deleteByUserIdAndSlotId(String userId, Long slotId);

    /** As excecoes deste aluno NESTE dia. Lista, pela mesma razao da turma. */
    @Query("SELECT e FROM MealSlotStudent e, MealSlot s "
         + "WHERE e.slotId = s.id AND e.userId = :userId "
         + "AND s.diaSemana = :dia AND s.ativo = true")
    List<MealSlotStudent> doDia(String userId, Short dia);
}
