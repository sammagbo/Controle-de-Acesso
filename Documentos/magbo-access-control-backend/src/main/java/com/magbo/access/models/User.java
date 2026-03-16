package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "app_users")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class User {

    @Id
    @EqualsAndHashCode.Include
    private String id;

    @Column(nullable = false)
    private String nome;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserType tipo;

    private String turma;

    @Column(name = "foto_url")
    private String fotoUrl;

    @Column(name = "responsavel_id")
    private String responsavelId;

    @Column(name = "meal_count", nullable = false)
    @Builder.Default
    private Integer mealCount = 0;
}
