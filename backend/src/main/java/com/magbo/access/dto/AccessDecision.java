package com.magbo.access.dto;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;

public record AccessDecision(
    AuthorizationResult result,
    DenialReason reason,
    String flag,
    AuthMethod method,
    AuthResult authResult,
    String userId,
    String employeeNoRaw,
    String nomeSnapshot,
    String pointId,
    AccessAction action,
    boolean fallback,
    Long consumedPermissionId
) {}
