package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Cadastro de SERVIDOR da escola (professor, Vie Scolaire, servicos gerais,
 * administracao, direcao...).
 *
 * DTO proprio, separado do UserRegistrationDto, de proposito: aluno vem do
 * Pronote e tem regras suas (id de 7 digitos, turma obrigatoria, responsavel);
 * servidor e cadastrado a mao ou por planilha e tem outras (matricula FUNC-###,
 * identificador do HikCentral, departamento). Misturar os dois num DTO so
 * significaria validacoes condicionais cruzadas, que e como se quebra o
 * cadastro de aluno sem perceber.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StaffRegistrationDto {

    /**
     * Matricula institucional = id em app_users. Opcional: em branco, o
     * servidor gera a proxima FUNC-###.
     */
    private String matricula;

    private String nome;

    /**
     * employeeNo do HikCentral (10 digitos) — e ele que liga a FACE ao
     * cadastro. Sem isso a pessoa existe no MAGBO mas nenhum evento do terminal
     * casa com ela. Opcional no cadastro (a face pode ser distribuida depois),
     * UNIQUE quando presente.
     */
    private String hikvisionEmployeeId;

    /** PROFESSOR ou FUNCIONARIO. Em branco assume FUNCIONARIO. */
    private String tipo;

    /** Vie Scolaire, Servicos Gerais, Administracao, Direcao... String livre. */
    private String departamento;
}
