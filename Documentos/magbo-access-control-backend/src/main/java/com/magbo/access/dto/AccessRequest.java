package com.magbo.access.dto;

import com.magbo.access.models.AccessAction;
import lombok.Data;

@Data
public class AccessRequest {
    private String userId;
    private String pointId;
    private AccessAction action;
}
