package com.magbo.access.dto.auth;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class LoginResponse {
    private String token;
    private String username;
    private String nomeCompleto;
    private String role;
    private String setoresPermitidos;
    private String permissoes;
    private long expiresInMs;
}
