package com.magbo.access.repositories;

import com.magbo.access.models.SystemUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SystemUserRepository extends JpaRepository<SystemUser, Long> {
    Optional<SystemUser> findByUsername(String username);
    boolean existsByUsername(String username);
}
