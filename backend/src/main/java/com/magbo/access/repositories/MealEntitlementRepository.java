package com.magbo.access.repositories;

import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.MealEntitlement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

@Repository
public interface MealEntitlementRepository extends JpaRepository<MealEntitlement, String> {

    List<MealEntitlement> findByStatus(EntitlementStatus status);

    long countByStatus(EntitlementStatus status);

    @Query(value = """
            SELECT u.id, u.nome, u.turma,
                   COALESCE(m.status, 'PENDING') AS status,
                   m.valid_from, m.valid_until, m.note, m.updated_by, m.updated_at
            FROM app_users u
            LEFT JOIN meal_entitlements m ON m.user_id = u.id
            WHERE u.tipo = 'ALUNO' AND u.ativo = true
              AND (:q IS NULL OR u.nome ILIKE CONCAT('%', :q, '%') OR u.id LIKE CONCAT('%', :q, '%'))
              AND (:turma IS NULL OR u.turma = :turma)
              AND (:status IS NULL OR COALESCE(m.status, 'PENDING') = :status)
            ORDER BY u.nome
            """,
            countQuery = """
            SELECT count(u.id)
            FROM app_users u
            LEFT JOIN meal_entitlements m ON m.user_id = u.id
            WHERE u.tipo = 'ALUNO' AND u.ativo = true
              AND (:q IS NULL OR u.nome ILIKE CONCAT('%', :q, '%') OR u.id LIKE CONCAT('%', :q, '%'))
              AND (:turma IS NULL OR u.turma = :turma)
              AND (:status IS NULL OR COALESCE(m.status, 'PENDING') = :status)
            """,
            nativeQuery = true)
    Page<Object[]> findEntitlementsWithUsers(
            @Param("q") String q,
            @Param("turma") String turma,
            @Param("status") String status,
            Pageable pageable);
}
