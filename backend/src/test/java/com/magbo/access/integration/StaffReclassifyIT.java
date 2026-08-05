package com.magbo.access.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * "ESTE SERVIDOR É NA VERDADE UM ALUNO".
 *
 * Caso real de 04-05/08: 74 alunos estavam fora do departamento ALUNOS no
 * HikCentral, com id de 10 dígitos. A importação não achou matrícula para eles
 * e criou FUNC-### segurando a face — e as passagens desses alunos entravam nos
 * relatórios como passagens de servidor. A correção em massa foi feita em SQL;
 * estes testes cobrem a ferramenta para o próximo caso, que volta a acontecer a
 * cada aluno mal arquivado no HCP.
 */
class StaffReclassifyIT extends AbstractIT {

    private static final String URL = "/api/users/staff";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ───────────────── Caminho feliz ─────────────────

    /**
     * O coração: a coluna é UNIQUE, então o aluno só recebe o identificador
     * depois que o servidor o solta — e as duas coisas numa transação só.
     */
    @Test
    @DisplayName("★ transfere o identificador ao aluno e inativa o servidor, numa transação")
    void reclassificaTransfereEInativa() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana", "2E1");
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");
        passagem("FUNC-050");
        passagem("FUNC-050");

        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "0004048")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("5629236986")));

        User alunoDepois = userRepository.findById("0004048").orElseThrow();
        assertThat(alunoDepois.getHikvisionEmployeeId()).isEqualTo("5629236986");

        User servidorDepois = userRepository.findById("FUNC-050").orElseThrow();
        assertThat(servidorDepois.getHikvisionEmployeeId())
                .as("soltou a face — a coluna é UNIQUE")
                .isNull();
        assertThat(servidorDepois.getAtivo()).isFalse();
    }

    @Test
    @DisplayName("★ o cadastro do aluno (nome, turma, tipo) NÃO é tocado — é do Pronote")
    void naoTocaNoCadastroDoAluno() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana", "2E1");
        servidor("FUNC-050", "Grafia Diferente PAEZ", "5629236986", "ADM");

        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "0004048")))
                .andExpect(status().isOk());

        User a = userRepository.findById("0004048").orElseThrow();
        assertThat(a.getNome()).isEqualTo("PÁEZ Tatiana");
        assertThat(a.getTurma()).isEqualTo("2E1");
        assertThat(a.getTipo()).isEqualTo(UserType.ALUNO);
    }

    /** Decisão registrada: histórico honesto. Inativo já sai dos relatórios. */
    @Test
    @DisplayName("★ as passagens antigas FICAM no registro do servidor")
    void passagensAntigasPermanecem() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana", "2E1");
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");
        passagem("FUNC-050");
        passagem("FUNC-050");
        passagem("FUNC-050");

        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "0004048")))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.countByUserId("FUNC-050"))
                .as("elas aconteceram; reescrever a história seria pior")
                .isEqualTo(3);
        assertThat(accessLogRepository.count()).isEqualTo(3);
    }

    @Test
    @DisplayName("servidor SEM identificador: só é inativado, e a mensagem diz isso")
    void servidorSemIdentificadorSoInativa() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana", "2E1");
        servidor("FUNC-050", "Tatiana PAEZ", null, "ADM");

        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "0004048")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("não tinha")));

        assertThat(userRepository.findById("FUNC-050").orElseThrow().getAtivo()).isFalse();
        assertThat(userRepository.findById("0004048").orElseThrow().getHikvisionEmployeeId()).isNull();
    }

    // ───────────────── Aluno ausente ─────────────────

    /** Criar o aluno aqui produziria um registro fora do Pronote — o duplicado que se está desfazendo. */
    @Test
    @DisplayName("★ aluno inexistente -> mensagem que diz o que fazer, e NADA é criado")
    void alunoInexistenteExplicaOCaminho() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");

        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "0009999")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "Este aluno não está no MAGBO; ele deve entrar primeiro pela importação do Pronote"));

        assertThat(userRepository.findById("0009999")).isEmpty();
        assertThat(userRepository.count()).isEqualTo(1);
        assertThat(userRepository.findById("FUNC-050").orElseThrow().getAtivo())
                .as("recusa não pode ter inativado nada")
                .isTrue();
    }

    @Test
    @DisplayName("alvo que não é ALUNO é recusado")
    void alvoPrecisaSerAluno() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");
        servidor("FUNC-051", "Outro Servidor", null, "ADM");

        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "FUNC-051")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("não é um aluno")));
    }

    @Test
    @DisplayName("origem precisa ser um servidor, nunca um aluno")
    void origemPrecisaSerServidor() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana", "2E1");
        aluno("0001764", "MARTIN Luis", "4C");

        mockMvc.perform(post(token, "0001764", Map.of("alunoId", "0004048")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("servidores")));
    }

    // ───────────────── Conflito de identificador ─────────────────

    /** Trocar a face de um aluno é decisão consciente, não efeito colateral. */
    @Test
    @DisplayName("★ aluno que JÁ tem outro identificador -> recusa mostrando os dois")
    void alunoComOutroIdentificadorExigeConfirmacao() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        User a = aluno("0004048", "PÁEZ Tatiana", "2E1");
        a.setHikvisionEmployeeId("1111111111");
        userRepository.save(a);
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");

        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "0004048")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.allOf(
                                org.hamcrest.Matchers.containsString("1111111111"),
                                org.hamcrest.Matchers.containsString("5629236986"))));

        assertThat(userRepository.findById("0004048").orElseThrow().getHikvisionEmployeeId())
                .isEqualTo("1111111111");
        assertThat(userRepository.findById("FUNC-050").orElseThrow().getAtivo()).isTrue();
    }

    @Test
    @DisplayName("com confirmarSubstituicao=true a troca acontece")
    void substituicaoConfirmadaTroca() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        User a = aluno("0004048", "PÁEZ Tatiana", "2E1");
        a.setHikvisionEmployeeId("1111111111");
        userRepository.save(a);
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("alunoId", "0004048");
        body.put("confirmarSubstituicao", true);
        mockMvc.perform(post(token, "FUNC-050", body))
                .andExpect(status().isOk());

        assertThat(userRepository.findById("0004048").orElseThrow().getHikvisionEmployeeId())
                .isEqualTo("5629236986");
        assertThat(userRepository.findById("FUNC-050").orElseThrow().getAtivo()).isFalse();
    }

    @Test
    @DisplayName("aluno que já tem O MESMO identificador não exige confirmação")
    void mesmoIdentificadorNaoExigeConfirmacao() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        User a = aluno("0004048", "PÁEZ Tatiana", "2E1");
        userRepository.save(a);
        // Estado possível depois de um casamento parcial feito à mão.
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");
        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "0004048")))
                .andExpect(status().isOk());
        assertThat(userRepository.findById("0004048").orElseThrow().getHikvisionEmployeeId())
                .isEqualTo("5629236986");
    }

    // ───────────────── Prévia ─────────────────

    @Test
    @DisplayName("prévia mostra os dois lados e sinaliza substituição, sem gravar")
    void previaMostraOsDoisLados() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        User a = aluno("0004048", "PÁEZ Tatiana", "2E1");
        a.setHikvisionEmployeeId("1111111111");
        userRepository.save(a);
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");
        passagem("FUNC-050");

        mockMvc.perform(MockMvcRequestBuilders.get(URL + "/FUNC-050/reclassify/preview")
                        .param("alunoId", "0004048")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preview.servidorNome").value("Tatiana PAEZ"))
                .andExpect(jsonPath("$.preview.servidorPassagens").value(1))
                .andExpect(jsonPath("$.preview.alunoNome").value("PÁEZ Tatiana"))
                .andExpect(jsonPath("$.preview.alunoTurma").value("2E1"))
                .andExpect(jsonPath("$.preview.alunoHikvisionAtual").value("1111111111"))
                .andExpect(jsonPath("$.preview.substituiIdentificadorDoAluno").value(true));

        assertThat(userRepository.findById("FUNC-050").orElseThrow().getAtivo())
                .as("prévia não grava nada")
                .isTrue();
    }

    @Test
    @DisplayName("prévia com aluno inexistente devolve a mesma orientação")
    void previaComAlunoInexistente() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");

        mockMvc.perform(MockMvcRequestBuilders.get(URL + "/FUNC-050/reclassify/preview")
                        .param("alunoId", "0009999")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("importação do Pronote")));
    }

    /** Depois de reclassificado, o registro sai da lista ativa de servidores. */
    @Test
    @DisplayName("o servidor reclassificado aparece como inativo na lista")
    void reclassificadoFicaInativoNaLista() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana", "2E1");
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");

        mockMvc.perform(post(token, "FUNC-050", Map.of("alunoId", "0004048")))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("FUNC-050"))
                .andExpect(jsonPath("$[0].ativo").value(false))
                .andExpect(jsonPath("$[0].hikvisionEmployeeId").doesNotExist());
    }

    // ───────────────── Helpers ─────────────────

    private User aluno(String id, String nome, String turma) {
        return userRepository.save(User.builder().id(id).nome(nome).tipo(UserType.ALUNO)
                .turma(turma).ativo(true).mealCount(0).build());
    }

    private void servidor(String id, String nome, String hik, String dept) {
        userRepository.save(User.builder().id(id).nome(nome).tipo(UserType.FUNCIONARIO)
                .departamento(dept).hikvisionEmployeeId(hik).ativo(true).mealCount(0).build());
    }

    private void passagem(String userId) {
        accessLogRepository.save(AccessLog.builder()
                .userId(userId).pointId("BIBLIO").action(AccessAction.ENTRADA)
                .timestamp(LocalDateTime.now().minusHours(2)).build());
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder post(
            String token, String servidorId, Map<String, ?> body) throws Exception {
        return MockMvcRequestBuilders.post(URL + "/" + servidorId + "/reclassify")
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(MAPPER.writeValueAsString(body));
    }
}
