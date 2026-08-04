package com.magbo.access.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Uma linha CRUA do export "Renseignements personnels" do HikCentral.
 *
 * Chega exatamente como esta na planilha — sem prefixo removido, sem nome
 * montado, sem tipo deduzido. Toda a interpretacao vive no
 * {@link com.magbo.access.services.HikCentralImportService}, que e testavel;
 * o frontend so localiza o cabecalho (linha 9) e casa as colunas pelo NOME.
 *
 * Colunas do arquivo real:
 *   ID | Prénom | Nom de famille | Service | Heure de début de la période de
 *   validité | Heure de fin | Date d'inscription | Type | Niveau d'accès
 *
 * Só estas quatro interessam ao MAGBO. As de validade e nível de acesso são
 * governança do HikCentral (ADR-004: o HCP é provisionamento puro).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HikCentralRowDto {

    /**
     * Coluna "ID". Aluno traz a MATRICULA de 7 digitos (identica ao
     * app_users.id); servidor traz um id interno de 10-11 digitos.
     */
    private String id;

    /** Coluna "Prénom". */
    private String prenom;

    /** Coluna "Nom de famille". */
    private String nom;

    /** Coluna "Service", no formato "All Departments/ALUNOS". */
    private String service;

    /** Numero da linha na planilha, para o relatorio. Cabecalho = 9. */
    private Integer linha;
}
