package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * F7b ponta a ponta: GET /api/admin/hikvision-mapping/export-csv.
 *
 * O IT cobre o que o teste unitario nao alcanca — autorizacao, cabecalhos HTTP
 * e, principalmente, os BYTES que saem pela rede. E o unico ponto onde um
 * problema de codificacao apareceria: o arquivo vai para o HikCentral, que nao
 * valida nada e aceita um cabecalho corrompido em silencio.
 */
class HikCentralCsvExportIT extends AbstractIT {

    private static final String URL = "/api/admin/hikvision-mapping/export-csv";

    private void semFace(String id, String nome) {
        semFace(id, nome, null);
    }

    /** Sobrecarga com TURMA — a coluna nova do arquivo. */
    private void semFace(String id, String nome, String turma) {
        userRepository.save(User.builder()
                .id(id).nome(nome).tipo(UserType.ALUNO).ativo(true).turma(turma).build());
    }

    private void comFace(String id, String nome, String hikId) {
        userRepository.save(User.builder()
                .id(id).nome(nome).tipo(UserType.ALUNO).ativo(true)
                .hikvisionEmployeeId(hikId).build());
    }

    /** Corpo lido como UTF-8 explicitamente — o teste nao pode herdar o default da JVM. */
    private String corpo(MvcResult r) throws Exception {
        return new String(r.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
    }

    private MvcResult exportar(String scope) throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        return mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("scope", scope)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andReturn();
    }

    @Test
    @DisplayName("★ padrao missing-face: so quem nao tem identificador Hikvision")
    void padraoTrazSoQuemNaoTemFace() throws Exception {
        semFace("0001111", "Ana Souza");
        comFace("0002222", "Bruno Lima", "1234567890");

        String token = TestAuthHelper.loginAdmin(mockMvc);
        MvcResult r = mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(header().string("X-MAGBO-Export-Scope", "MISSING_FACE"))
                .andReturn();

        String csv = corpo(r);
        assertThat(csv).contains("\"0001111\"");
        assertThat(csv)
                .as("quem ja tem face nao precisa ser reprovisionado")
                .doesNotContain("0002222");
    }

    @Test
    @DisplayName("scope=all traz tambem quem ja tem identificador")
    void escopoTodosTrazTodoMundo() throws Exception {
        semFace("0001111", "Ana Souza");
        comFace("0002222", "Bruno Lima", "1234567890");

        String csv = corpo(exportar("all"));

        assertThat(csv).contains("\"0001111\"");
        assertThat(csv)
                .as("com face: sai o identificador existente, nao a matricula")
                .contains("\"1234567890\"");
    }

    @Test
    @DisplayName("★ os BYTES na rede preservam os zeros a esquerda e o acento")
    void bytesNaRedeEstaoCorretos() throws Exception {
        semFace("0001764", "Aurélie Gonçalves");

        String csv = corpo(exportar("missing-face"));

        assertThat(csv)
                .as("zero a esquerda e a regra critica do procedimento")
                .contains("\"0001764\"");
        assertThat(csv)
                .as("cabecalho e acento sobrevivem ao transporte")
                .contains("\"Prénom\"")
                .contains("\"Aurélie\";\"Gonçalves\"");
    }

    @Test
    @DisplayName("★ sem BOM — o destinatario e o HCP, nao o Excel")
    void semBom() throws Exception {
        semFace("0001111", "Ana Souza");

        byte[] bytes = exportar("missing-face").getResponse().getContentAsByteArray();

        assertThat(bytes.length).isGreaterThan(3);
        assertThat(new byte[]{bytes[0], bytes[1], bytes[2]})
                .as("EF BB BF na frente faria o HCP ler a 1a coluna como ﻿ID")
                .isNotEqualTo(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
    }

    @Test
    @DisplayName("content-type text/csv e nome de arquivo datado no Content-Disposition")
    void cabecalhosDeDownload() throws Exception {
        semFace("0001111", "Ana Souza");

        MvcResult r = exportar("missing-face");

        assertThat(r.getResponse().getContentType()).contains("text/csv");
        assertThat(r.getResponse().getHeader("Content-Disposition"))
                .contains("attachment")
                .contains("magbo-hikcentral-missing_face-")
                .contains(java.time.LocalDate.now().toString());
    }

    @Test
    @DisplayName("ninguem pendente -> 200 com so o cabecalho (nao 204, nao vazio)")
    void ninguemPendente() throws Exception {
        comFace("0002222", "Bruno Lima", "1234567890");

        String csv = corpo(exportar("missing-face"));

        assertThat(csv.split("\r\n"))
                .as("cabecalho sozinho diz 'nao ha ninguem'; arquivo vazio parece defeito")
                .hasSize(1);
        assertThat(csv).startsWith("\"ID\"");
    }

    @Test
    @DisplayName("sem token -> nao exporta a base de alunos")
    void semTokenNaoExporta() throws Exception {
        semFace("0001111", "Ana Souza");

        mockMvc.perform(MockMvcRequestBuilders.get(URL))
                .andExpect(status().is4xxClientError());
    }

    /**
     * IDA E VOLTA: o que este endpoint escreve, o importador do MAGBO le de
     * volta. E a unica garantia disponivel enquanto o template real do HCP for
     * pendencia — se as colunas divergirem, este teste cai.
     */
    @Test
    @DisplayName("★ o CSV gerado casa com as colunas que o proprio importador le")
    void colunasCasamComOImportador() throws Exception {
        semFace("0001764", "Marie Dupont");

        String cabecalho = corpo(exportar("missing-face")).split("\r\n")[0];

        // As QUATRO colunas que o importador le, nos mesmos nomes e na mesma
        // ordem. Cobrado assim, e nao por igualdade da linha inteira: o arquivo
        // pode GANHAR coluna (a turma ganhou) sem que a ida-e-volta se perca,
        // porque o importador descarta o que nao conhece
        // (tests/hikcentralSheet.test.js, "ignora colunas desconhecidas").
        // Renomear uma das quatro, ao contrario, continua derrubando o teste.
        assertThat(cabecalho)
                .startsWith("\"ID\";\"Prénom\";\"Nom de famille\";\"Service\"");

        // A turma vem DEPOIS das quatro — o que mantem um export de hoje
        // comparavel, coluna a coluna, com um anterior a ela.
        assertThat(cabecalho)
                .as("template real do HCP ainda e pendencia 3; 'Classe' e suposicao declarada "
                        + "em HikCentralCsvService.COLUNA_TURMA")
                .isEqualTo("\"ID\";\"Prénom\";\"Nom de famille\";\"Service\";\"Classe\"");

        assertThat(TestFixtures.EMPLOYEE_PILOTO).isNotNull();   // fixtures carregadas
    }

    /** A turma do aluno chega no arquivo, e nao so no cabecalho. */
    @Test
    @DisplayName("a turma do aluno sai na linha dele")
    void turmaSaiNaLinha() throws Exception {
        semFace("0003535", "Ana Silva", "3B");

        String csv = corpo(exportar("missing-face"));

        assertThat(csv.split("\r\n")[1])
                .as("a turma vem do cadastro, como texto entre aspas")
                .endsWith(";\"3B\"");
    }
}
