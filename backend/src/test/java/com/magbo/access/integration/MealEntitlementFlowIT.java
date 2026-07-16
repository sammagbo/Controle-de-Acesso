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
     * Bug de producao corrigido em 16/07/2026 (Fase B.1): summary() passava
     * a String "ALUNO" a countByTipoAndAtivoTrue, mas o campo `tipo` e o enum
     * UserType — o Hibernate 6 rejeitava com InvalidDataAccessApiUsageException
     * e o endpoint respondia 500 (asercao congelada aqui ate a correcao).
     * Agora a assinatura recebe UserType e o endpoint responde 200.
     *
     * pending e derivado: totalStudents - authorized - notAuthorized
     * (aluno sem linha de entitlement = dado nao preenchido).
     */
    @Test
    @DisplayName("GET /summary -> 200 com contagens corretas (bug de tipo corrigido)")
    void summaryRetornaContagensCorretas() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        userRepository.save(TestFixtures.aluno("9990001", null));
        userRepository.save(TestFixtures.aluno("9990002", null));
        userRepository.save(TestFixtures.alunoInativo("9990003", null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                "9990001", EntitlementStatus.NOT_AUTHORIZED));

        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.get("/api/admin/meal-entitlements/summary")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalStudents").value(3))
                .andExpect(jsonPath("$.authorized").value(1))
                .andExpect(jsonPath("$.notAuthorized").value(1))
                .andExpect(jsonPath("$.pending").value(1));
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
