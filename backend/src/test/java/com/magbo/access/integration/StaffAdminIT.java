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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MANUTENÇÃO DOS SERVIDORES e CASAMENTO MANUAL.
 *
 * A importação do HikCentral cria FUNC-### para toda linha fora do departamento
 * ALUNOS. Parte dessas ~200 pessoas são ALUNOS cujo id no HCP é um número
 * interno de 10 dígitos, então nenhuma matrícula casou. Resultado: o aluno
 * existe (Pronote) e ao lado dele há um servidor fantasma com a face dele.
 */
class StaffAdminIT extends AbstractIT {

    private static final String URL = "/api/users/staff";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ───────────────── Lista ─────────────────

    @Test
    @DisplayName("★ a contagem em LOTE dá o mesmo número que a contagem uma-a-uma")
    void contagemEmLoteBate() throws Exception {
        // ⚠️ Esta é a asserção que protege a troca do N+1 pela consulta
        // agrupada. Um GROUP BY não devolve linha para quem tem ZERO
        // passagens: se o chamador tratasse "ausente" como desconhecido em vez
        // de zero, todo cadastro novo deixaria de ser removível — e o operador
        // descobriria isso na hora de apagar, não aqui.
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-100", "Com Duas", "1000000100", "PORTARIA");
        servidor("FUNC-101", "Com Uma", "1000000101", "CDI");
        servidor("FUNC-102", "Sem Nenhuma", "1000000102", "DIRECAO");
        passagem("FUNC-100");
        passagem("FUNC-100");
        passagem("FUNC-101");

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                // ordenados por nome: Com Duas, Com Uma, Sem Nenhuma
                .andExpect(jsonPath("$[0].id").value("FUNC-100"))
                .andExpect(jsonPath("$[0].passagens").value(2))
                .andExpect(jsonPath("$[0].podeRemover").value(false))
                .andExpect(jsonPath("$[1].id").value("FUNC-101"))
                .andExpect(jsonPath("$[1].passagens").value(1))
                .andExpect(jsonPath("$[1].podeRemover").value(false))
                // o que o GROUP BY NÃO devolve tem de virar zero, não sumir
                .andExpect(jsonPath("$[2].id").value("FUNC-102"))
                .andExpect(jsonPath("$[2].passagens").value(0))
                .andExpect(jsonPath("$[2].podeRemover").value(true));
    }

    @Test
    @DisplayName("★ a contagem do lote conta as REPETIÇÕES — é 'existe histórico?', não a de tela")
    void loteContaRepeticoes() throws Exception {
        // ⚠️ Seria tentador excluir POSTO_FIXO/JA_PRESENTE aqui, como fazem as
        // consultas de tela, e estaria ERRADO: este número autoriza APAGAR o
        // cadastro. Um porteiro cujas linhas são quase todas marcadas
        // apareceria com zero passagens, viraria apagável, e as linhas dele
        // ficariam órfãs de um id que já não existe.
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-200", "Porteiro Postado", "1000000200", "PORTARIA");
        accessLogRepository.save(AccessLog.builder()
                .userId("FUNC-200").pointId("PORT1").action(AccessAction.ENTRADA)
                .timestamp(LocalDateTime.now().minusHours(3)).flag("POSTO_FIXO").build());
        accessLogRepository.save(AccessLog.builder()
                .userId("FUNC-200").pointId("PORT1").action(AccessAction.ENTRADA)
                .timestamp(LocalDateTime.now().minusHours(2)).flag("JA_PRESENTE").build());

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].passagens").value(2))
                .andExpect(jsonPath("$[0].podeRemover").value(false));
    }

    @Test
    @DisplayName("lista traz servidores com departamento, identificador e histórico")
    void listaServidores() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-001", "Marie DUPONT", "1000000001", "VIE SCOLAIRE");
        aluno("0004048", "SOUZA Maria");

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()")
                        .value(1))
                .andExpect(jsonPath("$[0].id").value("FUNC-001"))
                .andExpect(jsonPath("$[0].departamento").value("VIE SCOLAIRE"))
                .andExpect(jsonPath("$[0].hikvisionEmployeeId").value("1000000001"))
                .andExpect(jsonPath("$[0].passagens").value(0))
                .andExpect(jsonPath("$[0].podeRemover").value(true));
    }

    @Test
    @DisplayName("★ ALUNO nunca aparece na lista de servidores")
    void alunoNaoApareceNaLista() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "SOUZA Maria");
        aluno("0001764", "MARTIN Luis");

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ───────────────── Edição ─────────────────

    @Test
    @DisplayName("corrige departamento e tipo de um servidor")
    void corrigeDepartamentoETipo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-001", "Prof Silva", null, "NAO_DEFINIDO");

        mockMvc.perform(put(token, "FUNC-001", Map.of(
                        "tipo", "PROFESSOR", "departamento", "PROFESSORES")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        User depois = userRepository.findById("FUNC-001").orElseThrow();
        assertThat(depois.getTipo()).isEqualTo(UserType.PROFESSOR);
        assertThat(depois.getDepartamento()).isEqualTo("PROFESSORES");
    }

    @Test
    @DisplayName("★ não dá para transformar servidor em ALUNO por aqui")
    void naoPromoveParaAluno() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-001", "Na verdade um aluno", null, "ADM");

        mockMvc.perform(put(token, "FUNC-001", Map.of("tipo", "ALUNO")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("identificador Hikvision")));

        assertThat(userRepository.findById("FUNC-001").orElseThrow().getTipo())
                .isEqualTo(UserType.FUNCIONARIO);
    }

    @Test
    @DisplayName("★ registro de ALUNO não é editável por esta porta")
    void alunoNaoEhEditavel() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "SOUZA Maria");

        mockMvc.perform(put(token, "0004048", Map.of("departamento", "QUALQUER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("servidores")));

        assertThat(userRepository.findById("0004048").orElseThrow().getDepartamento()).isNull();
    }

    // ───────────────── Remoção segura ─────────────────

    @Test
    @DisplayName("servidor SEM histórico pode ser removido")
    void removeServidorSemHistorico() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-001", "Criado por engano", null, "ADM");

        mockMvc.perform(MockMvcRequestBuilders.delete(URL + "/FUNC-001")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        assertThat(userRepository.findById("FUNC-001")).isEmpty();
    }

    /** Apagar com histórico deixaria access_logs apontando para um id inexistente. */
    @Test
    @DisplayName("★ servidor COM histórico não é removido — a resposta oferece inativar")
    void naoRemoveServidorComHistorico() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-001", "Com passagens", "1000000001", "ADM");
        passagem("FUNC-001");
        passagem("FUNC-001");

        mockMvc.perform(MockMvcRequestBuilders.delete(URL + "/FUNC-001")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("inativar")));

        assertThat(userRepository.findById("FUNC-001")).isPresent();
        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("inativar preserva o registro e o histórico")
    void inativaServidor() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-001", "Com passagens", "1000000001", "ADM");
        passagem("FUNC-001");

        mockMvc.perform(MockMvcRequestBuilders.post(URL + "/FUNC-001/deactivate")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        assertThat(userRepository.findById("FUNC-001").orElseThrow().getAtivo()).isFalse();
        assertThat(accessLogRepository.count()).isEqualTo(1);
    }

    // ───────────────── Casamento manual ─────────────────

    @Test
    @DisplayName("prévia mostra os dois lados antes de confirmar")
    void previaMostraOsDoisLados() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana");
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");
        passagem("FUNC-050");

        mockMvc.perform(MockMvcRequestBuilders.get(URL + "/match/preview")
                        .param("alunoId", "0004048")
                        .param("hikvisionId", "5629236986")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preview.alunoNome").value("PÁEZ Tatiana"))
                .andExpect(jsonPath("$.preview.alunoTurma").value("3B"))
                .andExpect(jsonPath("$.preview.servidorId").value("FUNC-050"))
                .andExpect(jsonPath("$.preview.servidorPassagens").value(1));

        assertThat(userRepository.findById("0004048").orElseThrow().getHikvisionEmployeeId())
                .as("prévia não grava nada")
                .isNull();
    }

    /**
     * O coração da tarefa: a coluna é UNIQUE, então o aluno só recebe a face se
     * o servidor a soltar — e as duas coisas têm de acontecer juntas.
     */
    @Test
    @DisplayName("★ casamento liga a face ao aluno E inativa o servidor fantasma, numa transação")
    void casamentoTransfereEInativa() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana");
        servidor("FUNC-050", "Tatiana PAEZ", "5629236986", "ADM");
        passagem("FUNC-050");

        mockMvc.perform(post(token, Map.of("alunoId", "0004048", "hikvisionId", "5629236986")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.hikvisionEmployeeId").value("5629236986"));

        User alunoDepois = userRepository.findById("0004048").orElseThrow();
        assertThat(alunoDepois.getHikvisionEmployeeId()).isEqualTo("5629236986");
        assertThat(alunoDepois.getTipo()).isEqualTo(UserType.ALUNO);
        assertThat(alunoDepois.getTurma())
                .as("o cadastro do Pronote não é tocado")
                .isEqualTo("3B");

        User servidorDepois = userRepository.findById("FUNC-050").orElseThrow();
        assertThat(servidorDepois.getHikvisionEmployeeId())
                .as("soltou a face — a coluna é UNIQUE")
                .isNull();
        assertThat(servidorDepois.getAtivo())
                .as("fora de circulação, mas preservado")
                .isFalse();
        assertThat(accessLogRepository.count())
                .as("★ as passagens aconteceram de verdade — apagá-las reescreveria a história")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("casamento quando a face não pertence a ninguém")
    void casamentoSemServidorEnvolvido() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana");

        mockMvc.perform(post(token, Map.of("alunoId", "0004048", "hikvisionId", "5629236986")))
                .andExpect(status().isOk());

        assertThat(userRepository.findById("0004048").orElseThrow().getHikvisionEmployeeId())
                .isEqualTo("5629236986");
    }

    @Test
    @DisplayName("★ face que já é de OUTRO ALUNO é recusada — não se troca aluno por aluno em silêncio")
    void naoRoubaFaceDeOutroAluno() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana");
        User outro = aluno("0001764", "MARTIN Luis");
        outro.setHikvisionEmployeeId("5629236986");
        userRepository.save(outro);

        mockMvc.perform(post(token, Map.of("alunoId", "0004048", "hikvisionId", "5629236986")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("MARTIN Luis")));

        assertThat(userRepository.findById("0001764").orElseThrow().getHikvisionEmployeeId())
                .isEqualTo("5629236986");
        assertThat(userRepository.findById("0004048").orElseThrow().getHikvisionEmployeeId()).isNull();
    }

    @Test
    @DisplayName("casar com um id que não é de aluno é recusado")
    void alvoPrecisaSerAluno() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        servidor("FUNC-001", "Servidor", null, "ADM");

        mockMvc.perform(post(token, Map.of("alunoId", "FUNC-001", "hikvisionId", "5629236986")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("não é um aluno")));
    }

    @Test
    @DisplayName("identificador não numérico é recusado")
    void identificadorPrecisaSerNumerico() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana");

        mockMvc.perform(post(token, Map.of("alunoId", "0004048", "hikvisionId", "ABC123")))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("repetir o casamento é inofensivo (a face já é do aluno)")
    void casamentoEhIdempotente() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        aluno("0004048", "PÁEZ Tatiana");

        mockMvc.perform(post(token, Map.of("alunoId", "0004048", "hikvisionId", "5629236986")))
                .andExpect(status().isOk());
        mockMvc.perform(post(token, Map.of("alunoId", "0004048", "hikvisionId", "5629236986")))
                .andExpect(status().isOk());

        assertThat(userRepository.findById("0004048").orElseThrow().getHikvisionEmployeeId())
                .isEqualTo("5629236986");
    }

    // ───────────────── Helpers ─────────────────

    private User aluno(String id, String nome) {
        return userRepository.save(User.builder().id(id).nome(nome).tipo(UserType.ALUNO)
                .turma("3B").ativo(true).mealCount(0).build());
    }

    private User servidor(String id, String nome, String hik, String dept) {
        return userRepository.save(User.builder().id(id).nome(nome).tipo(UserType.FUNCIONARIO)
                .departamento(dept).hikvisionEmployeeId(hik).ativo(true).mealCount(0).build());
    }

    private void passagem(String userId) {
        accessLogRepository.save(AccessLog.builder()
                .userId(userId).pointId("BIBLIO").action(AccessAction.ENTRADA)
                .timestamp(LocalDateTime.now().minusHours(2)).build());
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder put(
            String token, String id, Map<String, String> body) throws Exception {
        return MockMvcRequestBuilders.put(URL + "/" + id)
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(MAPPER.writeValueAsString(body));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder post(
            String token, Map<String, String> body) throws Exception {
        return MockMvcRequestBuilders.post(URL + "/match")
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(MAPPER.writeValueAsString(body));
    }
}
