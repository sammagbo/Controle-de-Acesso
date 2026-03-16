package com.magbo.access.dto;

import com.magbo.access.models.AccessAction;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AccessRequest {

    @NotBlank(message = "userId é obrigatório")
    private String userId;

    @NotBlank(message = "pointId é obrigatório")
    private String pointId;

    @NotNull(message = "action é obrigatória (ENTRADA ou SAIDA)")
    private AccessAction action;
}
