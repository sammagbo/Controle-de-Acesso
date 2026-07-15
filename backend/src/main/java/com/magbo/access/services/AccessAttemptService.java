package com.magbo.access.services;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.repositories.AccessAttemptRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccessAttemptService {

    private final AccessAttemptRepository accessAttemptRepository;

    public AccessAttempt record(
        String userId,
        String employeeNoRaw,
        String nomeSnapshot,
        String pointId,
        AccessAction action,
        String terminalIp,
        AuthMethod authMethod,
        AuthResult authResult,
        AuthorizationResult authorizationResult,
        DenialReason denialReason,
        Integer hikvisionSubEventType,
        Boolean doorMappingFallback
    ) {
        if (employeeNoRaw == null || employeeNoRaw.isBlank()) {
            throw new IllegalArgumentException("employeeNoRaw must not be null or blank");
        }
        if (denialReason == null) {
            throw new IllegalArgumentException("denialReason must not be null");
        }

        AccessAttempt attempt = AccessAttempt.builder()
                .userId(userId)
                .employeeNoRaw(employeeNoRaw)
                .nomeSnapshot(nomeSnapshot)
                .pointId(pointId)
                .action(action)
                .terminalIp(terminalIp)
                .authMethod(authMethod)
                .authResult(authResult)
                .authorizationResult(authorizationResult)
                .denialReason(denialReason)
                .hikvisionSubEventType(hikvisionSubEventType)
                .doorMappingFallback(doorMappingFallback)
                .timestamp(LocalDateTime.now())
                .build();

        accessAttemptRepository.save(attempt);

        log.info("Access Attempt: user={}, raw={}, point={}, action={}, method={}, authResult={}, decision={}, reason={}, subType={}",
                 userId, employeeNoRaw, pointId, action, authMethod, authResult, authorizationResult, denialReason, hikvisionSubEventType);

        return attempt;
    }
}
