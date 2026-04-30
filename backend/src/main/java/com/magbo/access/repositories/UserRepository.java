package com.magbo.access.repositories;

import com.magbo.access.models.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    java.util.List<User> findByResponsavelId(String responsavelId);
    java.util.List<User> findByAtivoTrue();
    java.util.List<User> findByAtivoFalse();
}
