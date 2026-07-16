package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cartao aprovado (subtipo 1). Fato de hardware: face e cartao trazem o MESMO
 * employeeNoString e nao ha cardNo no payload — o que distingue e apenas o
 * subEventType.
 */
class WebhookCardIT extends AbstractIT {

    @Test
    @DisplayName("cartao aprovado -> 200, 1 access_log CARD/1, 0 attempts")
    void cartaoAprovadoViraAccessLog() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("card-1.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(1);
        assertThat(accessAttemptRepository.count()).isZero();

        AccessLog log = accessLogRepository.findAll().get(0);
        assertThat(log.getAuthMethod()).isEqualTo(AuthMethod.CARD);
        assertThat(log.getHikvisionSubEventType()).isEqualTo(1);
        assertThat(log.getUserId()).isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
    }

    @Test
    @DisplayName("cartao e face do mesmo aluno resolvem pelo MESMO employeeNoString")
    void cartaoEFaceCompartilhamIdentidade() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_BIBLIO, "BIBLIO", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("card-1.txt"), TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll())
                .hasSize(2)
                .allSatisfy(log -> assertThat(log.getUserId()).isEqualTo(TestFixtures.EMPLOYEE_PILOTO))
                .extracting(AccessLog::getAuthMethod)
                .containsExactlyInAnyOrder(AuthMethod.CARD, AuthMethod.FACE);
    }
}
