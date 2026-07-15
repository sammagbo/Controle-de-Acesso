package com.magbo.access.dto;

import com.magbo.access.models.DenialReason;
import com.magbo.access.models.ExitPermissionType;

public record ExitDecision(
    boolean allowed,
    DenialReason reason,
    Long permissionId,
    ExitPermissionType permissionType
) {}
