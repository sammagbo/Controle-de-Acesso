package com.magbo.access.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.magbo.access.models.EntitlementStatus;
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
 * Os dois endpoints novos, ponta a ponta.
 *
 * O que so o IT alcanca: autorizacao, serializacao e — no caso da busca — que a
 * insensibilidade a acento sobreviva ao caminho HTTP inteiro. A normalizacao e
 * feita em Java justamente para o resultado ser identico no H2 dos testes e no
 * PostgreSQL de producao; se dependesse de SQL, este teste passaria sem provar
 * nada sobre a escola.
 */
class ExitSearchAndMealImportIT extends AbstractIT {

    private final ObjectMapper mapper = new ObjectMapper();

    private static final String BUSCA = "/api/users/students/search";
    private static final String PREVIEW = "/api/admin/meal-entitlements/import/preview";
    private static final String APLICAR = "/api/admin/meal-entitlements/import";

    private void aluno(String id, String nome, String turma) {
        userRepository.save(User.builder().id(id).nome(nome).turma(turma)
                .tipo(UserType.ALUNO).ativo(true).build());
    }

    private void servidor(String id, String nome) {
        userRepository.save(User.builder().id(id).nome(nome)
                .tipo(UserType.FUNCIONARIO).ativo(true).build());
    }

    private static Map<String, String> linha(String userId, String status) {
        return Map.of("userId", userId, "status", status);
    }

    // ───────────────── Busca de aluno (autorização de saída) ─────────────────

    @Test
    @DisplayName("★ busca sem acento encontra o aluno acentuado, via HTTP")
    void buscaSemAcentoEncontra() throws Exception {
        aluno("0001764", "Aurélie Gonçalves", "2A");
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.get(BUSCA).param("q", "goncalves")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$.users[0].id").value("0001764"))
                .andExpect(jsonPath("$.users[0].nome").value("Aurélie Gonçalves"))
                .andExpect(jsonPath("$.users[0].turma").value("2A"));
    }

    @Test
    @DisplayName("busca pela matrícula, com os zeros à esquerda")
    void buscaPelaMatricula() throws Exception {
        aluno("0001764", "Aurélie Gonçalves", "2A");
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.get(BUSCA).param("q", "0001764")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users[0].id").value("0001764"));
    }

    @Test
    @DisplayName("★ servidor não é selecionável, mesmo casando pelo nome")
    void servidorNaoEhSelecionavel() throws Exception {
        aluno("0001764", "Aurélie Gonçalves", "2A");
        servidor("FUNC-007", "Aurélie Martin");
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.get(BUSCA).param("q", "aurelie")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$.users[0].id").value("0001764"));
    }

    @Test
    @DisplayName("busca de 1 caractere devolve vazio, não a escola inteira")
    void buscaCurta() throws Exception {
        aluno("0001764", "Aurélie Gonçalves", "2A");
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.get(BUSCA).param("q", "a")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users", org.hamcrest.Matchers.hasSize(0)));
    }

    @Test
    @DisplayName("sem token não lista alunos")
    void buscaExigeAutenticacao() throws Exception {
        aluno("0001764", "Aurélie Gonçalves", "2A");
        mockMvc.perform(MockMvcRequestBuilders.get(BUSCA).param("q", "aurelie"))
                .andExpect(status().is4xxClientError());
    }

    // ───────────────── Importação de direitos: dry-run ─────────────────

    @Test
    @DisplayName("★ preview devolve o plano e NÃO grava nada")
    void previewNaoGrava() throws Exception {
        aluno("0001111", "Ana Souza", "2A");
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.post(PREVIEW)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(List.of(linha("0001111", "AUTORIZADO")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(false))
                .andExpect(jsonPath("$.totais.CRIAR").value(1))
                .andExpect(jsonPath("$.linhas[0].nome").value("Ana Souza"))
                .andExpect(jsonPath("$.linhas[0].turma").value("2A"));

        assertThat(mealEntitlementRepository.count())
                .as("a tela promete que nada foi gravado — o banco tem de concordar")
                .isZero();
        assertThat(mealEntitlementEventRepository.count()).isZero();
    }

    @Test
    @DisplayName("★ import grava e deixa histórico com o autor")
    void importGravaComHistorico() throws Exception {
        aluno("0001111", "Ana Souza", "2A");
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.post(APLICAR)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(List.of(linha("0001111", "AUTORIZADO")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(true))
                .andExpect(jsonPath("$.totais.CRIAR").value(1));

        assertThat(mealEntitlementRepository.findById("0001111"))
                .get()
                .satisfies(e -> assertThat(e.getStatus()).isEqualTo(EntitlementStatus.AUTHORIZED));
        assertThat(mealEntitlementEventRepository.findByUserIdOrderByChangedAtDesc("0001111"))
                .as("direito que muda sem rastro de quem mudou não pode existir")
                .singleElement()
                .satisfies(ev -> {
                    assertThat(ev.getNewStatus()).isEqualTo(EntitlementStatus.AUTHORIZED);
                    assertThat(ev.getSource()).isEqualTo("BULK");
                    assertThat(ev.getChangedBy()).isNotBlank();
                });
    }

    @Test
    @DisplayName("★ aluno ausente do MAGBO é ignorado, nunca criado")
    void alunoAusenteNaoEhCriado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.post(APLICAR)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(List.of(linha("9999999", "AUTORIZADO")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.PULAR").value(1))
                .andExpect(jsonPath("$.linhas[0].detalhe",
                        org.hamcrest.Matchers.containsString("Pronote")));

        assertThat(userRepository.findById("9999999")).isEmpty();
        assertThat(mealEntitlementRepository.count()).isZero();
    }

    /**
     * A razao de o plano ser REFEITO no confirm: entre a conferencia e a
     * confirmacao alguem mexeu no direito pela tela. O que a tela mostrou
     * (CRIAR) ja nao vale, e o resultado tem de refletir o banco de agora.
     */
    @Test
    @DisplayName("★ o plano é REFEITO no confirm — o do preview já não vale")
    void planoEhRefeitoNoConfirm() throws Exception {
        aluno("0001111", "Ana Souza", "2A");
        String token = TestAuthHelper.loginAdmin(mockMvc);
        String corpo = mapper.writeValueAsString(List.of(linha("0001111", "AUTORIZADO")));

        mockMvc.perform(MockMvcRequestBuilders.post(PREVIEW)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(jsonPath("$.totais.CRIAR").value(1));

        // Alguém autorizou pela tela nesse intervalo.
        mockMvc.perform(MockMvcRequestBuilders.put("/api/admin/meal-entitlements/0001111")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"AUTHORIZED\",\"note\":\"pela tela\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.post(APLICAR)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.CRIAR").value(0))
                .andExpect(jsonPath("$.totais.PULAR").value(1));
    }

    @Test
    @DisplayName("lote vazio é recusado com mensagem, nos dois endpoints")
    void loteVazio() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        for (String url : List.of(PREVIEW, APLICAR)) {
            mockMvc.perform(MockMvcRequestBuilders.post(url)
                            .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                            .contentType(MediaType.APPLICATION_JSON).content("[]"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").exists());
        }
    }

    @Test
    @DisplayName("sem token não importa direito nenhum")
    void importExigeAutenticacao() throws Exception {
        aluno("0001111", "Ana Souza", "2A");
        mockMvc.perform(MockMvcRequestBuilders.post(APLICAR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(List.of(linha("0001111", "AUTORIZADO")))))
                .andExpect(status().is4xxClientError());
        assertThat(mealEntitlementRepository.count()).isZero();
    }

    @Test
    @DisplayName("zeros à esquerda sobrevivem ao JSON e casam com o cadastro")
    void zerosAEsquerdaSobrevivem() throws Exception {
        aluno("0001764", "Aurélie Gonçalves", "2A");
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.post(APLICAR)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(List.of(linha("0001764", "AUTORIZADO")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.CRIAR").value(1));

        assertThat(mealEntitlementRepository.findById("0001764")).isPresent();
    }
}
