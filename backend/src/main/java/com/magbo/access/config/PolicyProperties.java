package com.magbo.access.config;

import com.magbo.access.models.PolicyMode;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "magbo")
@Getter
@Setter
public class PolicyProperties {

    private static final Logger log = LoggerFactory.getLogger(PolicyProperties.class);

    private Policy policy = new Policy();
    private Dedup dedup = new Dedup();

    @Getter
    @Setter
    public static class Policy {
        private PolicyMode mealNotEntitled = PolicyMode.DENY;
        private PolicyMode mealPending = PolicyMode.OBSERVATION;
        private PolicyMode outsideMealTime = PolicyMode.OBSERVATION;
        private PolicyMode duplicateMeal = PolicyMode.OBSERVATION;
        private PolicyMode exitNotAuthorized = PolicyMode.DENY;
        private PolicyMode userInactive = PolicyMode.DENY;
        private String missingDoorMapping = "FALLBACK";
    }

    @Getter
    @Setter
    public static class Dedup {
        private int windowSeconds = 90;
        private boolean enabled = true;
    }

    @PostConstruct
    public void init() {
        log.info("MAGBO policies: meal-not-entitled={}, meal-pending={}, outside-meal-time={}, duplicate-meal={}, exit-not-authorized={}, user-inactive={}, missing-door-mapping={}, dedup={}s (enabled={})",
                policy.getMealNotEntitled(),
                policy.getMealPending(),
                policy.getOutsideMealTime(),
                policy.getDuplicateMeal(),
                policy.getExitNotAuthorized(),
                policy.getUserInactive(),
                policy.getMissingDoorMapping(),
                dedup.getWindowSeconds(),
                dedup.isEnabled());
    }
}
