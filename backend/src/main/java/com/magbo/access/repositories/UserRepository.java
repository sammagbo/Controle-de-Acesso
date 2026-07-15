package com.magbo.access.repositories;

import com.magbo.access.models.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByHikvisionEmployeeId(String hikvisionEmployeeId);
    java.util.List<User> findByResponsavelId(String responsavelId);
    java.util.List<User> findByAtivoTrue();
    java.util.List<User> findByAtivoFalse();
    long countByTipoAndAtivoTrue(String tipo);

    // Busca por nome OU turma OU id (case-insensitive), só ativos
    @org.springframework.data.jpa.repository.Query("""
        SELECT u FROM User u
        WHERE u.ativo = true
          AND (
                LOWER(u.nome) LIKE LOWER(CONCAT('%', :q, '%'))
             OR LOWER(u.turma) LIKE LOWER(CONCAT('%', :q, '%'))
             OR LOWER(u.id) LIKE LOWER(CONCAT('%', :q, '%'))
          )
        ORDER BY u.nome ASC
    """)
    java.util.List<User> searchActive(
        @org.springframework.data.repository.query.Param("q") String q,
        org.springframework.data.domain.Pageable pageable
    );
}
