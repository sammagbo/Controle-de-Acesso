package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Caminho feliz da face (subtipo 75) com payload real do MinMoe.
 */
class WebhookFaceIT extends AbstractIT {

    @Test
    @DisplayName("face aprovada -> 200, 1 access_log FACE/75, 0 attempts")
    void faceAprovadaViraAccessLog() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(1);
        assertThat(accessAttemptRepository.count())
                .as("acesso limpo nao gera tentativa")
                .isZero();

        AccessLog log = accessLogRepository.findAll().get(0);
        assertThat(log.getUserId()).isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
        assertThat(log.getPointId()).isEqualTo("REFEI1");
        assertThat(log.getAction()).isEqualTo(AccessAction.ENTRADA);
        assertThat(log.getAuthMethod()).isEqualTo(AuthMethod.FACE);
        assertThat(log.getHikvisionSubEventType()).isEqualTo(75);
    }

    /**
     * O payload real traz dateTime "2026-07-14T11:33:19+08:00" — fuso de
     * fabrica do aparelho. O backend deve IGNORAR e usar a hora do servidor.
     */
    @Test
    @DisplayName("o timestamp gravado e a hora do SERVIDOR, nao o dateTime GMT+8 do payload")
    void timestampEhDoServidorNaoDoPayload() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        LocalDateTime antes = LocalDateTime.now().minusSeconds(5);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        LocalDateTime depois = LocalDateTime.now().plusSeconds(5);
        AccessLog log = accessLogRepository.findAll().get(0);

        assertThat(log.getTimestamp())
                .as("payload diz 14/07/2026 11:33 +08:00; o servidor manda a hora real")
                .isBetween(antes, depois);
    }

    /**
     * Terminal sem mapping cadastrado: politica FALLBACK (default do perfil
     * test) cai no legado PORT1+ENTRADA em vez de gerar attempt.
     */
    @Test
    @DisplayName("IP sem mapping -> fallback legado PORT1/ENTRADA, log gravado")
    void ipSemMappingCaiNoFallbackLegado() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), "10.10.0.99"))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getPointId()).isEqualTo("PORT1");
                    assertThat(log.getAction()).isEqualTo(AccessAction.ENTRADA);
                });
    }
}
