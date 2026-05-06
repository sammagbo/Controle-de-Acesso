package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserRegistrationDto {
    private String id;
    private String nome;
    private String tipo;
    private String turma;
    private String horarioSaida;
    private String fotoUrl;
    private String responsavelId;
    private String parentesco;
    private String telefone;
}
