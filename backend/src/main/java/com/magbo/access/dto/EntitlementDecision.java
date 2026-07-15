package com.magbo.access.dto;

import com.magbo.access.models.DenialReason;
import com.magbo.access.models.EntitlementStatus;

public record EntitlementDecision(
    EntitlementStatus effectiveStatus,
    boolean entitled,
    DenialReason reason
) {}
