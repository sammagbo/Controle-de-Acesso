package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "responsaveis")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class Responsavel {

    @Id
    @EqualsAndHashCode.Include
    private String id;

    @Column(nullable = false)
    private String nome;

    private String parentesco;

    private String telefone;

    @Column(name = "foto_url")
    private String fotoUrl;
}
