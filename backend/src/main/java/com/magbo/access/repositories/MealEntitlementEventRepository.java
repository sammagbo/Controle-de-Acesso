package com.magbo.access.repositories;

import com.magbo.access.models.MealEntitlementEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MealEntitlementEventRepository extends JpaRepository<MealEntitlementEvent, Long> {

    List<MealEntitlementEvent> findByUserIdOrderByChangedAtDesc(String userId);
}
