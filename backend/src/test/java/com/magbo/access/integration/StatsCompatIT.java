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

    @Test
    @DisplayName("/api/stats/global sem token -> negado (403, endpoint ADMIN)")
    void semTokenEhNegado() throws Exception {
        // Method security sem entry point customizado -> 403 para anonimo, nao
        // 401. Comportamento real do app; ver nota no relatorio da Fase I.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/stats/global"))
                .andExpect(status().isForbidden());
    }
}
