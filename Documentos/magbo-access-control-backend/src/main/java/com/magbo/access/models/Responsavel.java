package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "responsaveis")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Responsavel {

    @Id
    private String id;

    @Column(nullable = false)
    private String nome;

    private String parentesco;

    private String telefone;

    private String fotoUrl;
}
