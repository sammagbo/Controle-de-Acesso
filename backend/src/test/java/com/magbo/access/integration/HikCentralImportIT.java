package com.magbo.access.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * IMPORTACAO DO EXPORT "Renseignements personnels" DO HIKCENTRAL.
 *
 * Arquivo real: 1198 linhas, cabecalho na linha 9, coluna Service no formato
 * "All Departments/<DEPT>". Mistura 996 alunos que JA existem (vindos do
 * Pronote) com ~100 servidores que nao existem em lugar nenhum.
 *
 * O que esta suite protege:
 *   · aluno nunca e criado nem tem nome/turma sobrescritos — o Pronote e a
 *     fonte da verdade dele;
 *   · identificador Hikvision duplicado e conflito DA LINHA, nunca lote
 *     perdido;
 *   · os 9 alunos que carregam um id de 10 digitos em vez da matricula saem
 *     numa lista separada, para casamento humano — casar por nome sozinho
 *     trocaria a face de um aluno pela de outro;
 *   · a simulacao nao escreve nada.
 */
class HikCentralImportIT extends AbstractIT {

    private static final String PREVIEW = "/api/users/staff/import/preview";
    private static final String APPLY = "/api/users/staff/import";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ───────────────── Interpretacao dos campos ─────────────────

    @Test
    @DisplayName("Service 'All Departments/<DEPT>' perde o prefixo; sem sub-departamento vira NAO_DEFINIDO")
    void prefixoDoServiceEhRemovido() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        preview(token, List.of(
                linha(10, "5000000001", "Marie", "DUPONT", "All Departments/VIE SCOLAIRE"),
                linha(11, "5000000002", "Jean", "MARTIN", "All Departments/SERVIÇOS GERAIS"),
                linha(12, "5000000003", "Ana", "COSTA", "All Departments")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].departamento").value("VIE SCOLAIRE"))
                .andExpect(jsonPath("$.linhas[1].departamento").value("SERVIÇOS GERAIS"))
                .andExpect(jsonPath("$.linhas[2].departamento").value("NAO_DEFINIDO"));
    }

    @Test
    @DisplayName("tipo: ALUNOS→ALUNO, PROFESSORES→PROFESSOR, o resto→FUNCIONARIO")
    void tipoVemDoDepartamento() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(aluno("0004486", "Ja Existente", "6A"));

        apply(token, List.of(
                linha(10, "0004486", "Ja", "Existente", "All Departments/ALUNOS"),
                linha(11, "5000000002", "Prof", "SILVA", "All Departments/PROFESSORES"),
                linha(12, "5000000003", "Porteiro", "SANTOS", "All Departments/PORTARIA")))
                .andExpect(status().isOk());

        assertThat(userRepository.findByHikvisionEmployeeId("5000000002").orElseThrow().getTipo())
                .isEqualTo(UserType.PROFESSOR);
        assertThat(userRepository.findByHikvisionEmployeeId("5000000003").orElseThrow().getTipo())
                .isEqualTo(UserType.FUNCIONARIO);
    }

    @Test
    @DisplayName("nome é 'Prénom Nom de famille'")
    void nomeEhAConcatenacao() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        apply(token, List.of(linha(10, "5000000001", "Marie", "DUPONT", "All Departments/ADM")))
                .andExpect(status().isOk());

        assertThat(userRepository.findByHikvisionEmployeeId("5000000001").orElseThrow().getNome())
                .isEqualTo("Marie DUPONT");
    }

    // ───────────────── Aluno existente: só PREENCHE ─────────────────

    /**
     * O caso mais comum do arquivo: 996 alunos que ja existem, cada um com a
     * matricula de 7 digitos como ID.
     */
    @Test
    @DisplayName("aluno existente -> preenche identificador e departamento, sem tocar em nome nem turma")
    void alunoExistenteEhApenasPreenchido() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(aluno("0004486", "SOUZA Maria Clara", "3B"));

        apply(token, List.of(linha(10, "0004486", "Maria Clara", "SOUZA GRAFIA DIFERENTE",
                        "All Departments/ALUNOS")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.ATUALIZAR").value(1))
                .andExpect(jsonPath("$.totais.CRIAR").value(0));

        User depois = userRepository.findById("0004486").orElseThrow();
        assertThat(depois.getHikvisionEmployeeId()).isEqualTo("0004486");
        assertThat(depois.getDepartamento()).isEqualTo("ALUNOS");
        assertThat(depois.getNome())
                .as("★ nome é do Pronote — a importação não escreve por cima")
                .isEqualTo("SOUZA Maria Clara");
        assertThat(depois.getTurma())
                .as("★ turma é do Pronote — sem ela a chamada e o boletim quebram")
                .isEqualTo("3B");
        assertThat(userRepository.count())
                .as("nenhum aluno duplicado")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("aluno do HCP que não existe no MAGBO -> pulado, nunca criado")
    void alunoAusenteNaoEhCriado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        apply(token, List.of(linha(10, "0009999", "Fantasma", "SILVA", "All Departments/ALUNOS")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.PULAR").value(1))
                .andExpect(jsonPath("$.linhas[0].detalhe").value(
                        org.hamcrest.Matchers.containsString("Pronote")));

        assertThat(userRepository.count()).isZero();
    }

    // ───────────────── Os 9 alunos com ID errado ─────────────────

    /**
     * Tatiana PÁEZ (5629236986) e Brune GOMES (5242091738) sao negadas
     * UNKNOWN_USER a cada passagem: o terminal manda um employeeNo que nao
     * existe em app_users. Casar por nome automaticamente trocaria a face de um
     * aluno pela de outro — vai para revisao humana.
     */
    @Test
    @DisplayName("aluno com ID de 10 dígitos -> lista separada de revisão manual, nada gravado")
    void alunoComIdErradoVaiParaRevisaoManual() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(aluno("0004486", "PÁEZ Tatiana", "2E1"));

        apply(token, List.of(
                linha(10, "5629236986", "Tatiana", "PÁEZ", "All Departments/ALUNOS"),
                linha(11, "5242091738", "Brune", "GOMES", "All Departments/ALUNOS")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.REVISAO_MANUAL").value(2))
                .andExpect(jsonPath("$.revisaoManual.length()").value(2))
                .andExpect(jsonPath("$.revisaoManual[0].nome").value("Tatiana PÁEZ"))
                .andExpect(jsonPath("$.revisaoManual[0].idHikvision").value("5629236986"));

        assertThat(userRepository.findById("0004486").orElseThrow().getHikvisionEmployeeId())
                .as("nenhum casamento automático por nome")
                .isNull();
        assertThat(userRepository.count()).isEqualTo(1);
    }

    // ───────────────── Servidores ─────────────────

    @Test
    @DisplayName("servidor novo -> criado com matrícula FUNC-### e identificador do HCP")
    void servidorNovoEhCriado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidor("FUNC-001", "Servidor Um", null));

        apply(token, List.of(
                linha(10, "5000000001", "Marie", "DUPONT", "All Departments/VIE SCOLAIRE"),
                linha(11, "5000000002", "Jean", "MARTIN", "All Departments/DIREÇÃO")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.CRIAR").value(2));

        User marie = userRepository.findByHikvisionEmployeeId("5000000001").orElseThrow();
        assertThat(marie.getId()).isEqualTo("FUNC-002");
        assertThat(marie.getDepartamento()).isEqualTo("VIE SCOLAIRE");
        assertThat(marie.getTurma()).isNull();
        assertThat(userRepository.findByHikvisionEmployeeId("5000000002").orElseThrow().getId())
                .as("cada linha recebe a sua matrícula, sem colidir")
                .isEqualTo("FUNC-003");
    }

    /** No preview cada linha tem que mostrar a matrícula que receberia. */
    @Test
    @DisplayName("simulação mostra matrículas distintas por linha")
    void previewMostraMatriculasDistintas() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        preview(token, List.of(
                linha(10, "5000000001", "A", "UM", "All Departments/ADM"),
                linha(11, "5000000002", "B", "DOIS", "All Departments/ADM")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].matricula").value("FUNC-001"))
                .andExpect(jsonPath("$.linhas[1].matricula").value("FUNC-002"));
    }

    // ───────────────── Conflitos e lixo ─────────────────

    @Test
    @DisplayName("identificador já usado por outra pessoa -> CONFLITO só naquela linha")
    void identificadorDuplicadoEhConflitoDaLinha() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(aluno("0004486", "SOUZA Maria", "3B"));
        User outro = aluno("0001764", "MARTIN Luis", "4C");
        outro.setHikvisionEmployeeId("0004486");
        userRepository.save(outro);

        apply(token, List.of(
                linha(10, "0004486", "Maria", "SOUZA", "All Departments/ALUNOS"),
                linha(11, "5000000002", "Jean", "MARTIN", "All Departments/ADM")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.CONFLITO").value(1))
                .andExpect(jsonPath("$.totais.CRIAR")
                        .value(1))
                .andExpect(jsonPath("$.linhas[0].detalhe").value(
                        org.hamcrest.Matchers.containsString("MARTIN Luis")));

        assertThat(userRepository.findByHikvisionEmployeeId("5000000002"))
                .as("o conflito de uma linha não derruba as outras")
                .isPresent();
    }

    @Test
    @DisplayName("registro que já tem OUTRO identificador -> conflito, nunca repontado em silêncio")
    void identificadorDivergenteNaoEhSobrescrito() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        User existente = aluno("0004486", "SOUZA Maria", "3B");
        existente.setHikvisionEmployeeId("9999999999");
        userRepository.save(existente);

        apply(token, List.of(linha(10, "0004486", "Maria", "SOUZA", "All Departments/ALUNOS")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.CONFLITO").value(1));

        assertThat(userRepository.findById("0004486").orElseThrow().getHikvisionEmployeeId())
                .isEqualTo("9999999999");
    }

    /** Linha de teste do próprio aparelho: ID="1", "Andre", sem service. */
    @Test
    @DisplayName("linha de lixo (ID=1) -> pulada e reportada")
    void linhaDeLixoEhPuladaEReportada() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        apply(token, List.of(
                linha(10, "1", "Andre", "", ""),
                linha(11, "5000000002", "Jean", "MARTIN", "All Departments/ADM")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.PULAR").value(1))
                .andExpect(jsonPath("$.linhas[0].detalhe").value(
                        org.hamcrest.Matchers.containsString("ID inválido")))
                .andExpect(jsonPath("$.totais.CRIAR").value(1));

        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("linha sem ID -> pulada")
    void linhaSemIdEhPulada() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        apply(token, List.of(linha(10, "", "Sem", "IDENTIFICADOR", "All Departments/ADM")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.PULAR").value(1));

        assertThat(userRepository.count()).isZero();
    }

    // ───────────────── Simulação e idempotência ─────────────────

    @Test
    @DisplayName("★ a simulação NÃO escreve nada")
    void previewNaoEscreveNada() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(aluno("0004486", "SOUZA Maria", "3B"));

        preview(token, List.of(
                linha(10, "0004486", "Maria", "SOUZA", "All Departments/ALUNOS"),
                linha(11, "5000000002", "Jean", "MARTIN", "All Departments/ADM")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(false))
                .andExpect(jsonPath("$.totais.ATUALIZAR").value(1))
                .andExpect(jsonPath("$.totais.CRIAR").value(1));

        assertThat(userRepository.count())
                .as("★ nada gravado antes da confirmação")
                .isEqualTo(1);
        assertThat(userRepository.findById("0004486").orElseThrow().getHikvisionEmployeeId()).isNull();
    }

    /** Reimportar o mesmo arquivo não pode virar uma pilha de conflitos. */
    @Test
    @DisplayName("aplicar duas vezes -> a segunda não altera nada e não conflita")
    void reimportarEhIdempotente() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(aluno("0004486", "SOUZA Maria", "3B"));
        List<Map<String, Object>> arquivo = List.of(
                linha(10, "0004486", "Maria", "SOUZA", "All Departments/ALUNOS"),
                linha(11, "5000000002", "Jean", "MARTIN", "All Departments/ADM"));

        apply(token, arquivo).andExpect(jsonPath("$.totais.ATUALIZAR").value(1))
                .andExpect(jsonPath("$.totais.CRIAR").value(1));
        long depoisDaPrimeira = userRepository.count();

        apply(token, arquivo)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.PULAR").value(2))
                .andExpect(jsonPath("$.totais.CRIAR").value(0))
                .andExpect(jsonPath("$.totais.CONFLITO").value(0));

        assertThat(userRepository.count()).isEqualTo(depoisDaPrimeira);
    }

    @Test
    @DisplayName("relatório traz os totais de todas as ações")
    void relatorioTrazTotais() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(aluno("0004486", "SOUZA Maria", "3B"));

        apply(token, List.of(
                linha(10, "0004486", "Maria", "SOUZA", "All Departments/ALUNOS"),   // ATUALIZAR
                linha(11, "5000000002", "Jean", "MARTIN", "All Departments/ADM"),   // CRIAR
                linha(12, "0009999", "Fantasma", "SILVA", "All Departments/ALUNOS"),// PULAR
                linha(13, "5629236986", "Tatiana", "PÁEZ", "All Departments/ALUNOS")))// REVISAO
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(true))
                .andExpect(jsonPath("$.totais.TOTAL").value(4))
                .andExpect(jsonPath("$.totais.ATUALIZAR").value(1))
                .andExpect(jsonPath("$.totais.CRIAR").value(1))
                .andExpect(jsonPath("$.totais.PULAR").value(1))
                .andExpect(jsonPath("$.totais.REVISAO_MANUAL").value(1))
                .andExpect(jsonPath("$.totais.CONFLITO").value(0));
    }

    /** A linha do relatório aponta a linha da PLANILHA (cabeçalho = 9). */
    @Test
    @DisplayName("o relatório aponta o número da linha na planilha")
    void relatorioApontaALinhaDaPlanilha() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        preview(token, List.of(linha(457, "1", "Andre", "", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].linha").value(457));
    }

    // ───────────────── Helpers ─────────────────

    private static Map<String, Object> linha(int numero, String id, String prenom,
                                             String nom, String service) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("linha", numero);
        m.put("id", id);
        m.put("prenom", prenom);
        m.put("nom", nom);
        m.put("service", service);
        return m;
    }

    private static User aluno(String id, String nome, String turma) {
        return User.builder().id(id).nome(nome).tipo(UserType.ALUNO).turma(turma)
                .ativo(true).mealCount(0).build();
    }

    private static User servidor(String id, String nome, String hikvisionId) {
        return User.builder().id(id).nome(nome).tipo(UserType.FUNCIONARIO)
                .hikvisionEmployeeId(hikvisionId).ativo(true).mealCount(0).build();
    }

    private org.springframework.test.web.servlet.ResultActions preview(
            String token, List<Map<String, Object>> linhas) throws Exception {
        return mockMvc.perform(json(PREVIEW, token, linhas));
    }

    private org.springframework.test.web.servlet.ResultActions apply(
            String token, List<Map<String, Object>> linhas) throws Exception {
        return mockMvc.perform(json(APPLY, token, linhas));
    }

    private static MockHttpServletRequestBuilder json(String url, String token,
                                                      List<Map<String, Object>> body) throws Exception {
        return MockMvcRequestBuilders.post(url)
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(MAPPER.writeValueAsString(new ArrayList<>(body)));
    }
}
