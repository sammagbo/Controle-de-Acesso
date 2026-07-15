package com.magbo.access.dto;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class AccessAttemptDto {
    private Long id;
    private String userId;
    private String employeeNoRaw;
    private String nome;
    private String turma;
    private String pointId;
    private AccessAction action;
    private String terminalIp;
    private AuthMethod authMethod;
    private AuthResult authResult;
    private AuthorizationResult authorizationResult;
    private DenialReason denialReason;
    private Integer hikvisionSubEventType;
    private LocalDateTime timestamp;
    private Boolean doorMappingFallback;
}
