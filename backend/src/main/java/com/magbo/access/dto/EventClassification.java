package com.magbo.access.dto;

import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;

public record EventClassification(
    AuthMethod method,
    AuthResult result,
    boolean isAccessCandidate
) {}
