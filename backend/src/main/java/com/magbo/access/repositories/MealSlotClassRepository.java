package com.magbo.access.repositories;

import com.magbo.access.models.MealSlotClass;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MealSlotClassRepository extends JpaRepository<MealSlotClass, Long> {

    List<MealSlotClass> findByTurma(String turma);

    List<MealSlotClass> findBySlotId(Long slotId);

    void deleteBySlotIdAndTurma(Long slotId, String turma);

    /**
     * Os creneaux desta turma NESTE dia.
     *
     * ⚠️ Devolve LISTA e nao Optional: uma turma pode estar em varios creneaux
     * no mesmo dia (terca-feira, 1E2 e 1E3 nos dois passagens). Um Optional
     * aqui teria escondido metade do grupo.
     */
    @Query("SELECT c FROM MealSlotClass c, MealSlot s "
         + "WHERE c.slotId = s.id AND c.turma = :turma "
         + "AND s.diaSemana = :dia AND s.ativo = true")
    List<MealSlotClass> doDia(String turma, Short dia);
}
