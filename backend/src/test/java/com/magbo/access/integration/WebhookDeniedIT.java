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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ★ O TESTE MAIS IMPORTANTE DO PROJETO.
 *
 * Congela a correcao do bug descoberto em 13/07/2026 (teste CANT-09): o
 * terminal nega o acesso mas envia subEventType=8 COM employeeNoString, e o
 * sistema gravava isso como refeicao valida.
 *
 * SE ESTE TESTE FALHAR, A REFEICAO FALSA VOLTOU.
 *
 * Como foi descoberto: colocando a validade da pessoa no passado no terminal.
 * O aparelho nega por voz, mas manda o evento subtipo 8 assim mesmo — com a
 * identidade completa. O que torna o caso traicoeiro e justamente isso: o
 * payload negado e quase indistinguivel de uma aprovacao.
 */
class WebhookDeniedIT extends AbstractIT {

    @Test
    @DisplayName("★ subtipo 8 com identidade -> 200, ZERO access_logs, 1 attempt DEVICE_DENIED")
    void subtipo8NuncaViraRefeicao() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        // O aluno TEM direito a refeicao e o horario esta liberado: a unica
        // coisa que impede o access_log e o subtipo 8.
        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("denied-8.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("★ REGRESSAO: o terminal NEGOU. Se virou access_log, a refeicao falsa voltou.")
                .isZero();

        assertThat(accessAttemptRepository.count()).isEqualTo(1);

        AccessAttempt attempt = accessAttemptRepository.findAll().get(0);
        assertThat(attempt.getDenialReason()).isEqualTo(DenialReason.DEVICE_DENIED);
        assertThat(attempt.getAuthResult()).isEqualTo(AuthResult.DENIED);
        assertThat(attempt.getAuthorizationResult()).isEqualTo(AuthorizationResult.DENIED);
        assertThat(attempt.getHikvisionSubEventType()).isEqualTo(8);
        assertThat(attempt.getEmployeeNoRaw()).isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
        assertThat(attempt.getUserId())
                .as("o evento negado traz identidade: o aluno precisa ser identificado no painel")
                .isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
        assertThat(attempt.getPointId()).isEqualTo("REFEI1");
        assertThat(attempt.getDoorMappingFallback()).isFalse();
    }

    @Test
    @DisplayName("★ negado no portao tambem nao vira log")
    void subtipo8NoPortaoNaoViraLog() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_PORTAO_SAIDA, "PORT1", AccessAction.SAIDA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("denied-8.txt"), TestFixtures.IP_PORTAO_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isEqualTo(1);
        assertThat(accessAttemptRepository.findAll().get(0).getDenialReason())
                .isEqualTo(DenialReason.DEVICE_DENIED);
    }

    /**
     * A negacao do dispositivo precisa vencer ANTES de qualquer regra de
     * negocio: mesmo um aluno sem direito a refeicao, negado pelo terminal,
     * deve ser registrado como DEVICE_DENIED — e nao como MEAL_NOT_ENTITLED.
     * O motivo importa: DEVICE_DENIED e o marcador de auditoria da refeicao
     * falsa, e e o que alimenta divergenciaHoje.
     */
    @Test
    @DisplayName("★ negacao do dispositivo vence as regras de negocio no motivo registrado")
    void deviceDeniedVenceRegraDeNegocio() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.NOT_AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("denied-8.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .extracting(AccessAttempt::getDenialReason)
                .isEqualTo(DenialReason.DEVICE_DENIED);
    }
}
