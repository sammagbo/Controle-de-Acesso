package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * employeeNoString que nao corresponde a nenhum app_user.
 */
class WebhookUnknownUserIT extends AbstractIT {

    @Test
    @DisplayName("usuario desconhecido -> 200, 0 logs, attempt UNKNOWN_USER com raw preservado")
    void usuarioDesconhecidoViraAttempt() throws Exception {
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);
        // Nenhum user semeado: 8888888 nao existe.

        String payload = TestFixtures.withEmployeeNo(
                TestFixtures.payload("face-75.txt"), TestFixtures.EMPLOYEE_INEXISTENTE);

        mockMvc.perform(TestFixtures.multipartWebhook(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isEqualTo(1);

        AccessAttempt attempt = accessAttemptRepository.findAll().get(0);
        assertThat(attempt.getDenialReason()).isEqualTo(DenialReason.UNKNOWN_USER);
        assertThat(attempt.getAuthorizationResult()).isEqualTo(AuthorizationResult.DENIED);
        assertThat(attempt.getUserId())
                .as("nao ha user para vincular")
                .isNull();
        assertThat(attempt.getEmployeeNoRaw())
                .as("o ID cru do terminal fica preservado para investigacao")
                .isEqualTo(TestFixtures.EMPLOYEE_INEXISTENTE);
        assertThat(attempt.getNomeSnapshot())
                .as("o nome que o terminal enviou tambem fica")
                .isEqualTo("Teste Piloto");
    }

    @Test
    @DisplayName("usuario desconhecido nao consulta regra de refeicao nem de saida")
    void desconhecidoParaAntesDasRegras() throws Exception {
        seedMapping(TestFixtures.IP_PORTAO_SAIDA, "PORT1", AccessAction.SAIDA);

        String payload = TestFixtures.withEmployeeNo(
                TestFixtures.payload("face-75.txt"), TestFixtures.EMPLOYEE_INEXISTENTE);

        mockMvc.perform(TestFixtures.multipartWebhook(payload, TestFixtures.IP_PORTAO_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .extracting(AccessAttempt::getDenialReason)
                .as("para em UNKNOWN_USER, nunca chega a EXIT_NOT_AUTHORIZED")
                .isEqualTo(DenialReason.UNKNOWN_USER);
    }
}
