package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    private String id;

    @Column(nullable = false)
    private String nome;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserType tipo;

    private String turma;

    private String fotoUrl;

    private String responsavelId;

    @Column(nullable = false)
    @Builder.Default
    private Integer mealCount = 0;
}
