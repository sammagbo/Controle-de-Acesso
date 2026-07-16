package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Usuario com ativo=false (ex.: aluno que saiu da escola mas ainda esta no
 * terminal). Politica user-inactive=DENY no perfil test.
 */
class WebhookInactiveUserIT extends AbstractIT {

    @Test
    @DisplayName("usuario inativo -> 200, 0 logs, attempt USER_INACTIVE identificado")
    void usuarioInativoViraAttempt() throws Exception {
        userRepository.save(TestFixtures.alunoInativo(TestFixtures.EMPLOYEE_PILOTO, null));
        // Mesmo com direito a refeicao vigente, o inativo para antes.
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isEqualTo(1);

        AccessAttempt attempt = accessAttemptRepository.findAll().get(0);
        assertThat(attempt.getDenialReason()).isEqualTo(DenialReason.USER_INACTIVE);
        assertThat(attempt.getAuthorizationResult()).isEqualTo(AuthorizationResult.DENIED);
        assertThat(attempt.getUserId())
                .as("inativo e IDENTIFICADO no attempt (diferente do desconhecido)")
                .isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
    }
}
