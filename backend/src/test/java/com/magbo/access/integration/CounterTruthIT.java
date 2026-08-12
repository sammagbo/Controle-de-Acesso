package com.magbo.access.integration;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * UM CONTADOR NUNCA MEDE O COMPRIMENTO DE UMA LISTA PAGINADA.
 *
 * Producao, 12/08/2026: o banco tinha 612 movimentos desde a meia-noite e o
 * card "Movimentacoes Hoje" dizia 500 — o comprimento do teto do /logs/all,
 * nao o total. O numero esteve "certo" por meses: a classe de defeito fica
 * invisivel ate o trafego crescer alem do teto, e ai o cartao passa a mentir
 * exatamente no dia em que o movimento e recorde.
 *
 * O contrato que este arquivo congela: a LISTA e paginada (teto 500) e o
 * TOTAL vem de /logs/count, que conta no banco com os MESMOS filtros.
 */
class CounterTruthIT extends AbstractIT {

    private static final String HOJE = LocalDate.now().toString();

    private void movimentos(int quantos) {
        LocalDateTime base = LocalDate.now().atTime(7, 0);
        for (int i = 0; i < quantos; i++) {
            accessLogRepository.save(AccessLog.builder()
                    .userId(String.format("%07d", 1000 + i))
                    .pointId("PORT1")
                    .action(i % 2 == 0 ? AccessAction.ENTRADA : AccessAction.SAIDA)
                    .timestamp(base.plusSeconds(i * 30L))
                    .build());
        }
    }

    @Test
    @DisplayName("★ 512 movimentos: a lista trava em 500, o count diz 512")
    void listaTruncadaCountVerdadeiro() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        movimentos(512);

        // A lista: presa no teto — e o que a tela carrega.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/all")
                        .param("dateFrom", HOJE).param("dateTo", HOJE)
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(500));

        // O total: do banco. E o numero do card.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/count")
                        .param("dateFrom", HOJE).param("dateTo", HOJE)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(512));
    }

    @Test
    @DisplayName("★ o count respeita a lente de repeticoes — o card exclui POSTO_FIXO/JA_PRESENTE")
    void countComLenteDeRepeticoes() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        movimentos(3);
        accessLogRepository.save(AccessLog.builder()
                .userId("0000001").pointId("PORT1").action(AccessAction.ENTRADA)
                .timestamp(LocalDate.now().atTime(8, 0)).flag("POSTO_FIXO").build());
        accessLogRepository.save(AccessLog.builder()
                .userId("0000002").pointId("BIBLIO").action(AccessAction.ENTRADA)
                .timestamp(LocalDate.now().atTime(9, 0)).flag("JA_PRESENTE").build());

        // SANS: as marcadas ficam fora — e a doutrina de toda tela padrao.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/count")
                        .param("dateFrom", HOJE).param("dateTo", HOJE)
                        .param("repeticoes", "SANS")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3));

        // Sem lente: TUDO — o Journal e auditoria e nao esconde linha.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/count")
                        .param("dateFrom", HOJE).param("dateTo", HOJE)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(5));
    }

    @Test
    @DisplayName("count e lista concordam filtro a filtro (ponto e acao)")
    void countEListaConcordam() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        movimentos(10); // PORT1: 5 ENTRADA (pares), 5 SAIDA (impares)

        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/count")
                        .param("dateFrom", HOJE).param("dateTo", HOJE)
                        .param("pointId", "PORT1").param("action", "ENTRADA")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(5));

        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/all")
                        .param("dateFrom", HOJE).param("dateTo", HOJE)
                        .param("pointId", "PORT1").param("action", "ENTRADA")
                        .param("limit", "500")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5));
    }

    @Test
    @DisplayName("★ /logs/{pointId} com dateFrom devolve alem das 24h — a janela do Rapport do CDI")
    void janelaExplicitaAlcancaAlemDe24h() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        // Uma passagem de 10 dias atras: fora das 24h, dentro do mes.
        accessLogRepository.save(AccessLog.builder()
                .userId("0004048").pointId("BIBLIO").action(AccessAction.ENTRADA)
                .timestamp(LocalDateTime.now().minusDays(10)).build());

        // O caminho original (24h) NAO a ve — inalterado.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/BIBLIO")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        // Com a janela explicita, ela aparece — e o que "Ce Mois" precisa.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/BIBLIO")
                        .param("dateFrom", LocalDate.now().minusDays(30).toString())
                        .param("dateTo", HOJE)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }
}
