package com.magbo.access.repositories;

import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.MealEntitlement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MealEntitlementRepository extends JpaRepository<MealEntitlement, String> {

    List<MealEntitlement> findByStatus(EntitlementStatus status);

    long countByStatus(EntitlementStatus status);
}
