package com.magbo.access.repositories;

import com.magbo.access.models.PasswordResetRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PasswordResetRequestRepository extends JpaRepository<PasswordResetRequest, Long> {

    /** O pendente desta pessoa, se houver — a chave do dedupe. */
    Optional<PasswordResetRequest> findFirstByUsernameIgnoreCaseAndStatus(
            String username, PasswordResetRequest.Status status);

    long countByStatus(PasswordResetRequest.Status status);

    /** Pendentes primeiro, mais novos primeiro — a ordem de trabalho do admin. */
    List<PasswordResetRequest> findTop100ByOrderByStatusAscRequestedAtDesc();
}
