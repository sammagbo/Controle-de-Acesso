package com.magbo.access.repositories;

import com.magbo.access.models.MealSlot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MealSlotRepository extends JpaRepository<MealSlot, Long> {

    List<MealSlot> findByDiaSemanaAndAtivoTrueOrderByOrdemAscHoraAsc(Short diaSemana);

    List<MealSlot> findAllByOrderByDiaSemanaAscOrdemAscHoraAsc();
}
