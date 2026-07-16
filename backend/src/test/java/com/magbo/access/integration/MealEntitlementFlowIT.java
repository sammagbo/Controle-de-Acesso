package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Fluxo completo da Fase C: aluno sem direito tenta comer -> nada vira
 * refeicao, nem no banco nem no painel da cantina.
 */
class MealEntitlementFlowIT extends AbstractIT {

    @Test
    @DisplayName("NOT_AUTHORIZED + face -> 0 logs, attempt MEAL_NOT_ENTITLED, e /refectory/meals vazio")
    void alunoSemDireitoNaoConta() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.NOT_AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        // Lado 1: banco
        assertThat(accessLogRepository.count()).isZero();
        AccessAttempt attempt = accessAttemptRepository.findAll().get(0);
        assertThat(attempt.getDenialReason()).isEqualTo(DenialReason.MEAL_NOT_ENTITLED);
        assertThat(attempt.getAuthorizationResult()).isEqualTo(AuthorizationResult.DENIED);
        assertThat(attempt.getAuthResult())
                .as("o terminal APROVOU (face 75); quem negou foi o MAGBO — e divergencia")
                .isEqualTo(AuthResult.SUCCESS);

        // Lado 2: o painel da cantina nao mostra refeicao
        String token = TestAuthHelper.loginAdmin(mockMvc);
        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/refectory/meals")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    @DisplayName("AUTHORIZED expirado + face -> tratado como sem direito (0 logs)")
    void direitoExpiradoNaoConta() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED,
                java.time.LocalDate.now().minusDays(60), java.time.LocalDate.now().minusDays(1)));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .extracting(AccessAttempt::getDenialReason)
                .isEqualTo(DenialReason.MEAL_NOT_ENTITLED);
    }

    /**
     * PENDING e OBSERVATION no perfil test: o acesso passa, mas fica a
     * tentativa de auditoria. E o estado inicial dos 923 alunos reais.
     */
    @Test
    @DisplayName("PENDING (politica OBSERVATION) -> log gravado + attempt de auditoria")
    void pendingEmObservacaoPassaComAuditoria() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        // sem linha de entitlement => PENDING
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("OBSERVATION nao bloqueia — o aluno come")
                .isEqualTo(1);
        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .satisfies(a -> {
                    assertThat(a.getAuthorizationResult()).isEqualTo(AuthorizationResult.OBSERVATION);
                    assertThat(a.getDenialReason()).isEqualTo(DenialReason.MEAL_NOT_ENTITLED);
                });
    }

    /**
     * ★ BUG DE PRODUCAO CONGELADO — reportado ao Sam em 16/07/2026.
     *
     * MealEntitlementService.summary() (linha 160) chama
     * userRepository.countByTipoAndAtivoTrue("ALUNO") passando uma String,
     * mas o campo `tipo` e o enum UserType (@Enumerated(STRING)). O Hibernate 6
     * rejeita o argumento na validacao de tipo — ANTES de gerar SQL — com
     * InvalidDataAccessApiUsageException. Como e checagem da camada Hibernate,
     * e independente de dialeto: o endpoint GET /api/admin/meal-entitlements/
     * summary responde 500 tambem em PostgreSQL de producao (o card de resumo
     * do painel da Fase H esta morto).
     *
     * NAO corrigido nesta fase (Fase I nao altera producao). A correcao e
     * trocar por countByTipoAndAtivoTrue(UserType.ALUNO) ou declarar o
     * parametro como UserType. Quando isso for feito, este teste vai virar
     * vermelho — sinal para trocar a asercao para 200. NAO e maquiagem: o teste
     * esta nomeado como bug e documenta o 500 real ate a correcao.
     */
    @Test
    @DisplayName("★ CONGELADO: GET /summary lanca type-mismatch do Hibernate (bug reportado)")
    void summaryQuebraPorBugDeTipo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        // MockMvc re-lanca a excecao nao-tratada (num container real, o
        // BasicErrorController mapearia para 500). Congelamos a excecao em si:
        // e a prova mais direta do bug de tipo em summary().
        assertThat(org.assertj.core.api.Assertions.catchThrowable(() ->
                mockMvc.perform(MockMvcRequestBuilders.get("/api/admin/meal-entitlements/summary")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))))
                .cause()
                .isInstanceOf(org.springframework.dao.InvalidDataAccessApiUsageException.class)
                .hasMessageContaining("did not match parameter type")
                .hasMessageContaining("UserType");
    }

    @Test
    @DisplayName("2a face em <90s -> dedup OBSERVATION: 2 logs + attempt DUPLICATE_MEAL")
    void refeicaoDuplicadaGeraAuditoria() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("politica duplicate-meal=OBSERVATION registra os dois acessos")
                .isEqualTo(2);
        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .satisfies(a -> {
                    assertThat(a.getDenialReason()).isEqualTo(DenialReason.DUPLICATE_MEAL);
                    assertThat(a.getAuthorizationResult()).isEqualTo(AuthorizationResult.OBSERVATION);
                });
    }
}
