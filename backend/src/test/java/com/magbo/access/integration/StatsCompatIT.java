package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Compatibilidade de /api/stats/global apos as Fases E/H.
 *
 * blockedToday e o nome legado (enganoso: conta alertas, nada foi bloqueado).
 * A UI atual ainda le blockedToday; alertasHoje e o nome novo. O contrato
 * exige que os dois sejam IGUAIS ate a UI migrar (rename blockedToday->
 * alertasHoje esta na lista de pendencias).
 *
 * Todas as queries deste endpoint sao JPQL/derivadas — rodam em H2 sem
 * @Disabled.
 */
class StatsCompatIT extends AbstractIT {

    @Test
    @DisplayName("blockedToday presente E igual a alertasHoje, com valor nao-zero")
    void blockedTodayEhAliasDeAlertasHoje() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        // countBlockedSince conta access_logs de hoje com flag != null. Gravamos
        // um alerta (flag FORA_HORARIO) e um acesso limpo (flag null) para que
        // o valor esperado seja 1 — nao-trivial, provando o alias de verdade.
        // Inserimos o log direto para nao depender do dia da semana no webhook.
        accessLogRepository.save(com.magbo.access.models.AccessLog.builder()
                .userId(TestFixtures.EMPLOYEE_PILOTO)
                .pointId("REFEI1")
                .action(AccessAction.ENTRADA)
                .timestamp(java.time.LocalDateTime.now())
                .flag("FORA_HORARIO")
                .build());
        accessLogRepository.save(com.magbo.access.models.AccessLog.builder()
                .userId(TestFixtures.EMPLOYEE_PILOTO)
                .pointId("REFEI1")
                .action(AccessAction.ENTRADA)
                .timestamp(java.time.LocalDateTime.now())
                .build());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/stats/global")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockedToday").value(1))
                .andExpect(jsonPath("$.alertasHoje").value(1))
                .andExpect(jsonPath("$.totalToday").value(2));
    }

    @Test
    @DisplayName("negadasHoje conta os access_attempts; divergenciaHoje conta SUCCESS+DENIED")
    void negadasEDivergenciaContamCorreto() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        // 1) Face negada pelo MAGBO (NOT_AUTHORIZED): terminal aprovou (SUCCESS),
        //    MAGBO negou (DENIED) -> conta em negadas E em divergencia.
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.NOT_AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        // 2) Evento negado pelo terminal (sub 8): DENIED+DENIED -> conta em negadas,
        //    NAO em divergencia (nao houve aprovacao do terminal).
        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("denied-8.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/stats/global")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.negadasHoje").value(2))
                .andExpect(jsonPath("$.divergenciaHoje").value(1));
    }

    /**
     * ★★★ "NAO SEI" NAO E' "BARRADO".
     *
     * REGIME_TO_VERIFY nasce do regime 2 (semi-libre): a saida depende de ter
     * havido ausencia de professor, informacao que vive na grade do Pronote e
     * nunca chegou aqui. O MAGBO nao DISCORDA daquela saida — ele grava
     * OBSERVATION, nunca DENIED, e diz na tela que nao sabe.
     *
     * ⚠️ Ate 15/08/2026 essa linha entrava em `negadasHoje`, o numero que o
     * painel intitula "tentativas negadas" e que a direcao le. Contar ali uma
     * limitacao do SISTEMA como se fosse conduta do ALUNO e' o tipo de erro que
     * ninguem percebe olhando a tela: o numero e' plausivel, so' esta errado
     * sobre quem.
     *
     * O numero NAO some — ele continua visivel em `verificarHoje` e no card,
     * escrito como "a verificar, nao e' recusa". Esconder o rastro seria o
     * defeito oposto, e o AED pediu justamente para ve-lo.
     */
    @Test
    @DisplayName("★★★ REGIME_TO_VERIFY sai de negadasHoje e aparece em verificarHoje")
    void aVerificarNaoEhNegada() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        // Uma tentativa qualquer que E' recusa.
        accessAttemptRepository.save(com.magbo.access.models.AccessAttempt.builder()
                .employeeNoRaw("0000001")
                .pointId("REFEI1")
                .action(AccessAction.ENTRADA)
                .authResult(com.magbo.access.models.AuthResult.SUCCESS)
                .authorizationResult(com.magbo.access.models.AuthorizationResult.DENIED)
                .denialReason(com.magbo.access.models.DenialReason.MEAL_NOT_ENTITLED)
                .timestamp(java.time.LocalDateTime.now())
                .build());

        // Duas observacoes de "nao sei" no portao.
        for (int i = 0; i < 2; i++) {
            accessAttemptRepository.save(com.magbo.access.models.AccessAttempt.builder()
                    .employeeNoRaw("000000" + (2 + i))
                    .pointId("PORT1")
                    .action(AccessAction.SAIDA)
                    .authResult(com.magbo.access.models.AuthResult.SUCCESS)
                    .authorizationResult(com.magbo.access.models.AuthorizationResult.OBSERVATION)
                    .denialReason(com.magbo.access.models.DenialReason.REGIME_TO_VERIFY)
                    .timestamp(java.time.LocalDateTime.now())
                    .build());
        }

        mockMvc.perform(MockMvcRequestBuilders.get("/api/stats/global")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.negadasHoje").value(1))
                .andExpect(jsonPath("$.verificarHoje").value(2));
    }

    @Test
    @DisplayName("/api/stats/global sem token -> negado (403, endpoint ADMIN)")
    void semTokenEhNegado() throws Exception {
        // Method security sem entry point customizado -> 403 para anonimo, nao
        // 401. Comportamento real do app; ver nota no relatorio da Fase I.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/stats/global"))
                .andExpect(status().isForbidden());
    }
}
