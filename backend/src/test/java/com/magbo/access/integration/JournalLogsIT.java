package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/access/logs/all — a fonte da aba "Journal" do Rapport General.
 *
 * Incidente de producao de 03/08/2026 13:02: com os filtros escancarados
 * (03/08 a 03/08, Zone=Toutes, Action=Toutes) a tela mostrou "1 mouvements"
 * enquanto o banco tinha 5 access_logs do dia — e a aba "Vue d'ensemble" da
 * MESMA tela contava certo. Sub-reportar movimento e pior que nao mostrar
 * nada: a tela parece funcionar e a direcao toma decisao com o numero errado.
 *
 * Contrato: N linhas no periodo => N linhas devolvidas.
 */
class JournalLogsIT extends AbstractIT {

    private static final String URL = "/api/access/logs/all";
    private static final String HOJE = LocalDate.now().toString();

    /**
     * O caso do incidente, com os mesmos numeros: 5 movimentos no dia, filtros
     * escancarados. A hora do primeiro (08:18:58) e a da unica linha que a tela
     * exibiu.
     */
    @Test
    @DisplayName("5 movimentos no dia + filtros escancarados -> 5 linhas")
    void periodoComCincoMovimentosDevolveCinco() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        movimento("0004048", "PORT1", AccessAction.ENTRADA, LocalTime.of(8, 18, 58));
        movimento("0004048", "REFEI1", AccessAction.ENTRADA, LocalTime.of(11, 40, 12));
        movimento("0004048", "REFEI1", AccessAction.SAIDA, LocalTime.of(12, 5, 30));
        movimento("0001764", "BIBLIO", AccessAction.ENTRADA, LocalTime.of(12, 30, 0));
        movimento("0001764", "PORT1", AccessAction.SAIDA, LocalTime.of(12, 55, 44));

        assertThat(accessLogRepository.count())
                .as("o cenario so vale se o banco tiver mesmo as 5 linhas")
                .isEqualTo(5);

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("dateFrom", HOJE)
                        .param("dateTo", HOJE)
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5));
    }

    /**
     * A mesma janela SEM filtro de data — o outro jeito de a tela abrir.
     * Separa o defeito: se so o caminho com data falha, o problema esta no
     * filtro de periodo, nao na consulta inteira.
     */
    @Test
    @DisplayName("sem filtro de data -> devolve tudo que existe")
    void semFiltroDeDataDevolveTudo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        movimento("0004048", "PORT1", AccessAction.ENTRADA, LocalTime.of(8, 18, 58));
        movimento("0004048", "REFEI1", AccessAction.ENTRADA, LocalTime.of(11, 40, 12));
        movimento("0001764", "BIBLIO", AccessAction.ENTRADA, LocalTime.of(12, 30, 0));

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    /** Filtro de zona continua estreitando de verdade — nao virou no-op. */
    @Test
    @DisplayName("filtro de zona devolve so a zona pedida")
    void filtroDeZonaContinuaValendo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        movimento("0004048", "PORT1", AccessAction.ENTRADA, LocalTime.of(8, 18, 58));
        movimento("0004048", "REFEI1", AccessAction.ENTRADA, LocalTime.of(11, 40, 12));
        movimento("0001764", "REFEI1", AccessAction.ENTRADA, LocalTime.of(11, 45, 0));

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("dateFrom", HOJE)
                        .param("dateTo", HOJE)
                        .param("pointId", "REFEI1")
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    /** Filtro de acao idem. */
    @Test
    @DisplayName("filtro de acao devolve so a acao pedida")
    void filtroDeAcaoContinuaValendo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        movimento("0004048", "REFEI1", AccessAction.ENTRADA, LocalTime.of(11, 40, 12));
        movimento("0004048", "REFEI1", AccessAction.SAIDA, LocalTime.of(12, 5, 30));
        movimento("0001764", "REFEI1", AccessAction.ENTRADA, LocalTime.of(11, 45, 0));

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("dateFrom", HOJE)
                        .param("dateTo", HOJE)
                        .param("action", "ENTRADA")
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    /**
     * O periodo termina as 23:59:59 — o ULTIMO SEGUNDO do dia ficava de fora.
     * Uma passagem as 23:59:59.7 existe no banco, conta na "Vue d'ensemble"
     * (que usa BETWEEN nativo com outro limite) e sumia do Journal. Fim de
     * periodo tem que ser o fim do dia, nao o comeco do ultimo segundo.
     */
    @Test
    @DisplayName("movimento no ultimo segundo do dia entra no periodo")
    void ultimoSegundoDoDiaEntraNoPeriodo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        movimento("0004048", "PORT1", AccessAction.ENTRADA, LocalTime.of(8, 18, 58));
        salvar("0004048", "PORT1", AccessAction.SAIDA,
                LocalDate.now().atTime(23, 59, 59).plusNanos(700_000_000L));

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("dateFrom", HOJE)
                        .param("dateTo", HOJE)
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    // ───────────────── Filtro ELEVE: matricula OU nome ─────────────────

    /**
     * A matricula do Pronote tem zeros a esquerda e e o proprio user_id do log.
     * Filtrar por ela e o gesto mais natural do operador — e o que devolvia 0.
     */
    @Test
    @DisplayName("filtro eleve por MATRICULA devolve os movimentos do aluno")
    void filtroEleveAceitaMatricula() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cenarioDoisAlunos();

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("dateFrom", HOJE)
                        .param("dateTo", HOJE)
                        .param("eleve", "0004048")
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].userId").value("0004048"));
    }

    @Test
    @DisplayName("filtro eleve por NOME (parcial, sem acento de caixa) devolve os movimentos do aluno")
    void filtroEleveAceitaNome() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cenarioDoisAlunos();

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("dateFrom", HOJE)
                        .param("dateTo", HOJE)
                        .param("eleve", "dupont")
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].userId").value("0004048"));
    }

    /**
     * O filtro roda no BANCO, nao sobre as linhas ja carregadas: num dia cheio
     * o aluno procurado pode estar fora das primeiras 500 linhas. Com o teto de
     * 2 linhas, filtrar por matricula ainda tem que achar o aluno certo.
     */
    @Test
    @DisplayName("filtro eleve procura no periodo inteiro, nao so nas linhas ja carregadas")
    void filtroElevePercorreOPeriodoInteiro() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        // Aluno procurado passa cedo; muitos outros movimentos vem depois.
        cadastrar("0004048", "DUPONT Marie");
        movimento("0004048", "PORT1", AccessAction.ENTRADA, LocalTime.of(7, 5, 0));
        for (int i = 0; i < 10; i++) {
            movimento("000900" + i, "REFEI1", AccessAction.ENTRADA, LocalTime.of(11, 30 + i, 0));
        }

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("dateFrom", HOJE)
                        .param("dateTo", HOJE)
                        .param("eleve", "0004048")
                        .param("limit", "2")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].userId").value("0004048"));
    }

    @Test
    @DisplayName("filtro eleve em branco nao estreita nada")
    void filtroEleveEmBrancoNaoEstreita() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cenarioDoisAlunos();

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("dateFrom", HOJE)
                        .param("dateTo", HOJE)
                        .param("eleve", "   ")
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5));
    }

    /** Aluno sem cadastro em app_users ainda e alcancavel pela matricula do log. */
    @Test
    @DisplayName("matricula sem cadastro em app_users continua encontravel")
    void matriculaSemCadastroContinuaEncontravel() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        movimento("0007777", "PORT1", AccessAction.ENTRADA, LocalTime.of(8, 0, 0));
        movimento("0001764", "PORT1", AccessAction.ENTRADA, LocalTime.of(8, 1, 0));

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .param("eleve", "0007777")
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].userId").value("0007777"));
    }

    // ───────────────── Helpers ─────────────────

    /** 5 movimentos: 3 da DUPONT (0004048) e 2 da MARTIN (0001764). */
    private void cenarioDoisAlunos() {
        cadastrar("0004048", "DUPONT Marie");
        cadastrar("0001764", "MARTIN Luis");

        movimento("0004048", "PORT1", AccessAction.ENTRADA, LocalTime.of(8, 18, 58));
        movimento("0004048", "REFEI1", AccessAction.ENTRADA, LocalTime.of(11, 40, 12));
        movimento("0004048", "REFEI1", AccessAction.SAIDA, LocalTime.of(12, 5, 30));
        movimento("0001764", "BIBLIO", AccessAction.ENTRADA, LocalTime.of(12, 30, 0));
        movimento("0001764", "PORT1", AccessAction.SAIDA, LocalTime.of(12, 55, 44));
    }

    private void cadastrar(String id, String nome) {
        userRepository.save(com.magbo.access.models.User.builder()
                .id(id)
                .nome(nome)
                .tipo(com.magbo.access.models.UserType.ALUNO)
                .ativo(true)
                .hikvisionEmployeeId(id)
                .build());
    }

    private void movimento(String userId, String pointId, AccessAction action, LocalTime hora) {
        salvar(userId, pointId, action, LocalDateTime.of(LocalDate.now(), hora));
    }

    private void salvar(String userId, String pointId, AccessAction action, LocalDateTime ts) {
        accessLogRepository.save(AccessLog.builder()
                .userId(userId)
                .pointId(pointId)
                .action(action)
                .timestamp(ts)
                .build());
    }
}
