package com.magbo.access.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.magbo.access.TestFixtures;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CADASTRO DE SERVIDORES — professores, Vie Scolaire, servicos gerais,
 * administracao, direcao.
 *
 * O formulario antigo, com Tipo=Funcionario, mostrava so Nome+Tipo e nao
 * perguntava matricula nem identificador do HikCentral: sem o employeeNo a face
 * nunca casa com o cadastro, e a tela ainda dizia "sucesso". Contrato agora:
 * matricula (FUNC-### automatica quando em branco), identificador Hikvision
 * unico, tipo, departamento — e resposta que diz o que aconteceu.
 */
class StaffRegistrationIT extends AbstractIT {

    private static final String URL = "/api/users/staff";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ───────────────── Cadastro individual ─────────────────

    @Test
    @DisplayName("cadastro completo -> linha com departamento e identificador Hikvision")
    void cadastraServidorComDepartamentoEIdentificador() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(post(token, Map.of(
                        "matricula", "FUNC-042",
                        "nome", "Marie DUPONT",
                        "hikvisionEmployeeId", "1234567890",
                        "tipo", "FUNCIONARIO",
                        "departamento", "Vie Scolaire")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.matricula").value("FUNC-042"));

        User salvo = userRepository.findById("FUNC-042").orElseThrow();
        assertThat(salvo.getNome()).isEqualTo("Marie DUPONT");
        assertThat(salvo.getTipo()).isEqualTo(UserType.FUNCIONARIO);
        assertThat(salvo.getDepartamento()).isEqualTo("Vie Scolaire");
        assertThat(salvo.getHikvisionEmployeeId())
                .as("é o employeeNo do HikCentral que liga a face ao cadastro")
                .isEqualTo("1234567890");
        assertThat(salvo.getAtivo()).isTrue();
        assertThat(salvo.getTurma())
                .as("servidor não tem turma")
                .isNull();
    }

    /**
     * A regressao que motivou tudo: o formulario nao pedia matricula e
     * app_users.id e NOT NULL. Em branco, o servidor emite a proxima da
     * sequencia — FUNC-001 ja existe na escola.
     */
    @Test
    @DisplayName("matrícula em branco -> gera a próxima FUNC-### e o cadastro persiste")
    void matriculaEmBrancoEhGerada() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidorExistente("FUNC-001", "Servidor Um", null));

        mockMvc.perform(post(token, Map.of(
                        "nome", "Jean MARTIN",
                        "tipo", "FUNCIONARIO",
                        "departamento", "Serviços Gerais")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matricula").value("FUNC-002"));

        assertThat(userRepository.findById("FUNC-002")).isPresent();
    }

    @Test
    @DisplayName("a sequência continua do MAIOR emitido, não da contagem de linhas")
    void sequenciaSegueOMaiorEmitido() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidorExistente("FUNC-001", "Servidor Um", null));
        userRepository.save(servidorExistente("FUNC-017", "Servidor Dezessete", null));

        mockMvc.perform(post(token, Map.of("nome", "Nova Pessoa")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matricula").value("FUNC-018"));
    }

    @Test
    @DisplayName("GET /next-matricula mostra a próxima antes de salvar")
    void proximaMatriculaEhConsultavel() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidorExistente("FUNC-001", "Servidor Um", null));

        mockMvc.perform(MockMvcRequestBuilders.get(URL + "/next-matricula")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matricula").value("FUNC-002"));
    }

    @Test
    @DisplayName("tipo em branco assume FUNCIONARIO; PROFESSOR é aceito")
    void tipoPadraoEProfessor() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(post(token, Map.of("nome", "Sem Tipo")))
                .andExpect(status().isOk());
        mockMvc.perform(post(token, Map.of("nome", "Prof Silva", "tipo", "PROFESSOR",
                        "departamento", "Professor")))
                .andExpect(status().isOk());

        assertThat(userRepository.findAll())
                .extracting(User::getTipo)
                .containsExactlyInAnyOrder(UserType.FUNCIONARIO, UserType.PROFESSOR);
    }

    // ───────────────── Recusas, todas faladas ─────────────────

    @Test
    @DisplayName("identificador Hikvision duplicado -> 400 dizendo de quem é")
    void identificadorDuplicadoEhRecusado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidorExistente("FUNC-001", "Marie DUPONT", "1234567890"));

        mockMvc.perform(post(token, Map.of(
                        "nome", "Outra Pessoa",
                        "hikvisionEmployeeId", "1234567890")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("error"))
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("Marie DUPONT")));

        assertThat(userRepository.count())
                .as("nada foi criado na recusa")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("matrícula já usada -> 400, sem sobrescrever quem existe")
    void matriculaDuplicadaEhRecusada() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidorExistente("FUNC-001", "Marie DUPONT", null));

        mockMvc.perform(post(token, Map.of("matricula", "FUNC-001", "nome", "Impostor")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("FUNC-001")));

        assertThat(userRepository.findById("FUNC-001").orElseThrow().getNome())
                .isEqualTo("Marie DUPONT");
    }

    @Test
    @DisplayName("nome em branco -> 400, nunca gravado em silêncio")
    void nomeEmBrancoEhRecusado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(post(token, Map.of("tipo", "FUNCIONARIO", "departamento", "Direção")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("Nome")));

        assertThat(userRepository.count()).isZero();
    }

    @Test
    @DisplayName("identificador Hikvision não numérico -> 400")
    void identificadorNaoNumericoEhRecusado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(post(token, Map.of("nome", "Pessoa", "hikvisionEmployeeId", "ABC123")))
                .andExpect(status().isBadRequest());

        assertThat(userRepository.count()).isZero();
    }

    /** Aluno vem do Pronote; cadastrar por aqui contornaria a sincronização. */
    @Test
    @DisplayName("tipo ALUNO -> 400 explicando que aluno vem do Pronote")
    void tipoAlunoEhRecusado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(post(token, Map.of("nome", "Aluno Qualquer", "tipo", "ALUNO")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("Pronote")));
    }

    // ───────────────── Importação em lote ─────────────────

    @Test
    @DisplayName("planilha válida -> todas as linhas gravadas com departamento")
    void importacaoGravaTodasAsLinhas() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(postBulk(token, List.of(
                        Map.of("nome", "Marie DUPONT", "hikvisionEmployeeId", "1000000001",
                                "tipo", "FUNCIONARIO", "departamento", "Vie Scolaire"),
                        Map.of("nome", "Jean MARTIN", "hikvisionEmployeeId", "1000000002",
                                "tipo", "PROFESSOR", "departamento", "Professor"),
                        Map.of("nome", "Ana COSTA", "hikvisionEmployeeId", "1000000003",
                                "tipo", "FUNCIONARIO", "departamento", "Direção",
                                "matricula", "FUNC-100"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.sucesso").value(3))
                .andExpect(jsonPath("$.falhas").value(0));

        assertThat(userRepository.count()).isEqualTo(3);
        assertThat(userRepository.findById("FUNC-100").orElseThrow().getDepartamento())
                .isEqualTo("Direção");
        assertThat(userRepository.findByHikvisionEmployeeId("1000000002").orElseThrow().getTipo())
                .isEqualTo(UserType.PROFESSOR);
    }

    /**
     * O caso que a coluna UNIQUE do banco tornaria um 500 sem esta camada: a
     * planilha repete um identificador. A linha ruim e recusada com o motivo, e
     * as boas entram.
     */
    @Test
    @DisplayName("identificador duplicado DENTRO da planilha -> só aquela linha falha, com motivo")
    void duplicadoNaPlanilhaFalhaSoNaLinha() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(postBulk(token, List.of(
                        Map.of("nome", "Marie DUPONT", "hikvisionEmployeeId", "1000000001"),
                        Map.of("nome", "Clone da Marie", "hikvisionEmployeeId", "1000000001"),
                        Map.of("nome", "Jean MARTIN", "hikvisionEmployeeId", "1000000002"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("partial"))
                .andExpect(jsonPath("$.sucesso").value(2))
                .andExpect(jsonPath("$.falhas").value(1))
                .andExpect(jsonPath("$.detalheErros[0].linha").value("3"))
                .andExpect(jsonPath("$.detalheErros[0].nome").value("Clone da Marie"))
                .andExpect(jsonPath("$.detalheErros[0].erro").value(
                        org.hamcrest.Matchers.containsString("1000000001")));

        assertThat(userRepository.count())
                .as("as duas linhas boas entraram")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("identificador que já existe no banco -> linha recusada, resto importa")
    void duplicadoContraOBancoFalhaSoNaLinha() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidorExistente("FUNC-001", "Marie DUPONT", "1000000001"));

        mockMvc.perform(postBulk(token, List.of(
                        Map.of("nome", "Clone da Marie", "hikvisionEmployeeId", "1000000001"),
                        Map.of("nome", "Jean MARTIN", "hikvisionEmployeeId", "1000000002"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sucesso").value(1))
                .andExpect(jsonPath("$.falhas").value(1))
                .andExpect(jsonPath("$.detalheErros[0].erro").value(
                        org.hamcrest.Matchers.containsString("Marie DUPONT")));
    }

    /** Uma linha ruim no meio não pode derrubar a planilha inteira. */
    @Test
    @DisplayName("linha sem nome no meio -> as outras continuam entrando")
    void linhaInvalidaNaoDerrubaAPlanilha() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(postBulk(token, List.of(
                        Map.of("nome", "Marie DUPONT", "hikvisionEmployeeId", "1000000001"),
                        Map.of("hikvisionEmployeeId", "1000000009"),
                        Map.of("nome", "Jean MARTIN", "hikvisionEmployeeId", "1000000002"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sucesso").value(2))
                .andExpect(jsonPath("$.falhas").value(1))
                .andExpect(jsonPath("$.detalheErros[0].linha").value("3"));

        assertThat(userRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("importação sem matrícula -> cada linha recebe a sua, sem colidir")
    void importacaoGeraMatriculasSequenciais() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidorExistente("FUNC-001", "Servidor Um", null));

        mockMvc.perform(postBulk(token, List.of(
                        Map.of("nome", "Pessoa A"),
                        Map.of("nome", "Pessoa B"),
                        Map.of("nome", "Pessoa C"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sucesso").value(3));

        assertThat(userRepository.findAll())
                .extracting(User::getId)
                .containsExactlyInAnyOrder("FUNC-001", "FUNC-002", "FUNC-003", "FUNC-004");
    }

    // ───────────────── Alunos intocados ─────────────────

    /**
     * A garantia que mais importa: nada disto pode ter mexido no cadastro de
     * aluno, que sao 923 pessoas reais chegando pelo Pronote.
     */
    @Test
    @DisplayName("aluno existente continua intacto e o /api/users/bulk segue valendo")
    void cadastroDeAlunoNaoFoiAfetado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, "6A"));

        mockMvc.perform(post(token, Map.of("nome", "Servidor Novo", "departamento", "Direção")))
                .andExpect(status().isOk());

        User aluno = userRepository.findById(TestFixtures.EMPLOYEE_PILOTO).orElseThrow();
        assertThat(aluno.getTipo()).isEqualTo(UserType.ALUNO);
        assertThat(aluno.getTurma()).isEqualTo("6A");
        assertThat(aluno.getDepartamento())
                .as("coluna aditiva: aluno segue sem departamento")
                .isNull();
    }

    /**
     * Servidor nao tem turma. A busca de pessoas (userCache.search -> LIKE em
     * nome OU turma OU id) precisa continuar achando quem tem turma NULL, senao
     * o servidor cadastrado fica invisivel para todas as telas.
     */
    @Test
    @DisplayName("servidor sem turma continua encontrável na busca")
    void servidorSemTurmaAparecheNaBusca() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        mockMvc.perform(post(token, Map.of("nome", "Marie DUPONT", "departamento", "Vie Scolaire")))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/users/search")
                        .param("q", "DUPONT")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(1))
                .andExpect(jsonPath("$.users[0].turma").doesNotExist());
    }

    /**
     * Os relatorios agregam por TURMA. Com servidores no banco existem pessoas
     * sem turma, e o agregado nao pode quebrar por causa disso — o
     * countByTurmaSince e nativo, com JOIN em app_users, e agrupa por uma
     * coluna que agora vem NULL.
     */
    @Test
    @DisplayName("relatório de negadas não quebra com pessoa sem turma")
    void relatorioAgregadoAguentaPessoaSemTurma() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(servidorExistente("FUNC-001", "Marie DUPONT", "1000000001"));

        accessAttemptRepository.save(com.magbo.access.models.AccessAttempt.builder()
                .userId("FUNC-001")
                .employeeNoRaw("1000000001")
                .pointId("REFEI1")
                .action(com.magbo.access.models.AccessAction.ENTRADA)
                .authMethod(com.magbo.access.models.AuthMethod.FACE)
                .authResult(com.magbo.access.models.AuthResult.SUCCESS)
                .authorizationResult(com.magbo.access.models.AuthorizationResult.DENIED)
                .denialReason(com.magbo.access.models.DenialReason.MEAL_NOT_ENTITLED)
                .timestamp(java.time.LocalDateTime.now())
                .build());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/attempts/stats")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.byTurma.UNKNOWN")
                        .value(1));
    }

    /** Listagem geral (fonte do userCache) tem que trazer o servidor tambem. */
    @Test
    @DisplayName("servidor aparece na listagem que alimenta o cache do frontend")
    void servidorApareceNaListagem() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, "6A"));
        mockMvc.perform(post(token, Map.of("nome", "Marie DUPONT", "departamento", "Direção")))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/users")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(2));
    }

    // ───────────────── Helpers ─────────────────

    private static User servidorExistente(String id, String nome, String hikvisionId) {
        return User.builder()
                .id(id).nome(nome).tipo(UserType.FUNCIONARIO)
                .departamento("Vie Scolaire").hikvisionEmployeeId(hikvisionId)
                .ativo(true).mealCount(0).build();
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder post(
            String token, Map<String, String> body) throws Exception {
        return MockMvcRequestBuilders.post(URL)
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(MAPPER.writeValueAsString(body));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder postBulk(
            String token, List<Map<String, String>> body) throws Exception {
        return MockMvcRequestBuilders.post(URL + "/bulk")
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(MAPPER.writeValueAsString(body));
    }
}
