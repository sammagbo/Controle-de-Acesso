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

    /**
     * Especificacao do servidor da escola: Vie Scolaire, Servicos Gerais,
     * Administracao, Direcao, Professor...
     *
     * String livre e NULLABLE de proposito. Livre porque a lista de setores da
     * escola muda por decisao administrativa, nao por deploy — virar enum
     * exigiria recompilar (e mexer no CHECK do banco) a cada setor novo.
     * Nullable porque os 923 alunos ja cadastrados nao tem departamento nenhum,
     * e a coluna precisa nascer sem invalidar uma linha sequer.
     *
     * Nao confundir com `tipo`: `tipo` e o vinculo (ALUNO/PROFESSOR/
     * FUNCIONARIO, com CHECK no banco) e `departamento` e onde a pessoa
     * trabalha. Direcao e Servicos Gerais sao ambos tipo=FUNCIONARIO.
     */
    @Column(name = "departamento", length = 64)
    private String departamento;

    @Column(name = "foto_url")
    private String fotoUrl;

    @Column(name = "responsavel_id")
    private String responsavelId;

    @Column(name = "responsavel2_id")
    private String responsavel2Id;

    @Column(name = "meal_count", nullable = false)
    @Builder.Default
    private Integer mealCount = 0;

    @Column(nullable = false)
    @Builder.Default
    private Boolean ativo = true;

    @Column(name = "hikvision_employee_id", unique = true, length = 64)
    private String hikvisionEmployeeId;

    /**
     * Numero do documento com que a pessoa esta cadastrada na BIBLIOTECA FACIAL
     * das cameras da portaria (reserve_field.certificateNumber do payload).
     *
     * NAO e o mesmo que hikvision_employee_id: aquele e o employeeNo dos
     * terminais MinMoe do CDI/cantina; este e o identificador de OUTRO produto
     * (DeepinView), com outra base de pessoas, preenchida a mao. A mesma pessoa
     * pode ter os dois, um so, ou nenhum.
     *
     * Nullable e UNIQUE. Nullable porque quase ninguem tem: preenche-se sozinho
     * na primeira vez que a camera reconhece alguem e o nome casa com exatamente
     * UM cadastro (CameraIdentityService). Da segunda passagem em diante a
     * identificacao e por este numero — deterministica, sem depender de como o
     * nome foi digitado dos dois lados.
     *
     * UNIQUE porque duas pessoas com o mesmo numero de documento seria um erro
     * de cadastro que, sem a restricao, faria a camera abrir a catraca para
     * quem o banco escolhesse primeiro.
     */
    @Column(name = "camera_person_id", unique = true, length = 64)
    private String cameraPersonId;

    /**
     * Ponto onde esta pessoa fica POSTADA o dia inteiro (PORT1, BIBLIO...).
     *
     * O problema real, medido em 10/08/2026: quem trabalha NO portao — o
     * porteiro, e tambem a Vie Scolaire que fica de pe ali — e reconhecido pela
     * camera dezenas de vezes por dia, entrada, saida, entrada. Sao passagens
     * legitimas e minutos separadas, entao a regra de mesma passagem (30s) nao
     * as alcanca e nem deveria: ela existe para leitura repetida, nao para
     * quem esta de servico.
     *
     * Marcado POR PESSOA e nao por departamento, e a diferenca importa:
     * ha gente da VIE SCOLAIRE postada no portao e gente da PORTARIA que
     * precisa de rastreio normal em qualquer outro lugar. O departamento pode
     * SUGERIR o valor na tela; quem decide e o operador, uma pessoa por vez.
     *
     * Nullable porque a esmagadora maioria nao tem posto fixo — e 923 alunos
     * nunca terao. Nunca preenchido para ALUNO: a tela de servidores e a unica
     * porta de escrita, e ela so aceita PROFESSOR/FUNCIONARIO.
     *
     * O que ele NAO faz: bloquear, esconder ou apagar passagem. Ele so nomeia
     * o ponto em que a REPETICAO do dia recebe flag POSTO_FIXO
     * (PostoFixoService) — a primeira do dia continua normal, e movimento em
     * QUALQUER outro ponto e intocado.
     */
    @Column(name = "posto_fixo_point_id", length = 32)
    private String postoFixoPointId;
}
