package com.magbo.access.services;

import com.magbo.access.config.PolicyProperties;
import com.magbo.access.models.AccessAction;
import com.magbo.access.repositories.AccessLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class DeduplicationService {

    private final AccessLogRepository accessLogRepository;
    private final PolicyProperties policyProperties;

    public boolean isDuplicate(String userId, String pointId, AccessAction action, LocalDateTime now) {
        if (!policyProperties.getDedup().isEnabled()) {
            return false;
        }
        int windowSeconds = policyProperties.getDedup().getWindowSeconds();
        if (windowSeconds <= 0) {
            return false;
        }
        LocalDateTime after = now.minusSeconds(windowSeconds);
        return !accessLogRepository.findByUserIdAndPointIdAndActionAndTimestampAfter(userId, pointId, action, after).isEmpty();
    }
}
