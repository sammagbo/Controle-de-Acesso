package com.magbo.access.repositories;

import com.magbo.access.models.StudentRegime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface StudentRegimeRepository extends JpaRepository<StudentRegime, Long> {

    /**
     * O regime VIGENTE de um aluno numa data.
     *
     * ⚠️ A ordem nao e enfeite. Nao ha constraint de banco impedindo duas linhas
     * sobrepostas (ver o javadoc de StudentRegime); se houver, esta consulta tem
     * de escolher SEMPRE a mesma — a mais recente por inicio de vigencia, e
     * entre empates a de maior id. Sem ORDER BY deterministico, o mesmo aluno
     * receberia veredictos diferentes em chamadas seguidas, e o defeito
     * apareceria uma vez por semana, no portao, sem ninguem conseguir
     * reproduzir.
     *
     * `encerrado_em IS NULL` fica aqui e nao no chamador: um regime encerrado
     * continua na tabela para prova, mas nao decide mais nada.
     */
    @Query("""
            SELECT r FROM StudentRegime r
             WHERE r.userId = :userId
               AND r.encerradoEm IS NULL
               AND r.validFrom <= :dia
               AND (r.validUntil IS NULL OR r.validUntil >= :dia)
             ORDER BY r.validFrom DESC, r.id DESC
            """)
    List<StudentRegime> findVigentes(@Param("userId") String userId, @Param("dia") LocalDate dia);

    default Optional<StudentRegime> findVigente(String userId, LocalDate dia) {
        List<StudentRegime> todos = findVigentes(userId, dia);
        return todos.isEmpty() ? Optional.empty() : Optional.of(todos.get(0));
    }

    /** Historico completo de um aluno, o mais recente primeiro. */
    List<StudentRegime> findByUserIdOrderByValidFromDescIdDesc(String userId);

    /**
     * Todos os regimes vigentes hoje, para a tela de gestao e para a contagem
     * de quantos alunos ainda nao tem regime.
     */
    @Query("""
            SELECT r FROM StudentRegime r
             WHERE r.encerradoEm IS NULL
               AND r.validFrom <= :dia
               AND (r.validUntil IS NULL OR r.validUntil >= :dia)
            """)
    List<StudentRegime> findTodosVigentes(@Param("dia") LocalDate dia);
}
