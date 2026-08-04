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
     * Passagem ao vivo: o aparelho manda o evento na hora em que ele acontece,
     * no fuso dele (+08:00 de fabrica). Convertido, tem que cair em "agora".
     *
     * INVERTIDO em 04/08/2026: ate entao este teste afirmava o oposto — que o
     * backend IGNORAVA o dateTime e usava a hora do servidor —, que era o
     * defeito por tras do incidente da fila offline de 03/08. O caso da fila
     * (evento antigo entregue tarde), que e onde as duas horas divergem, vive
     * em WebhookEventTimeIT.
     */
    @Test
    @DisplayName("passagem ao vivo: o dateTime do payload equivale a hora corrente")
    void passagemAoVivoGravaAHoraCorrente() throws Exception {
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
                .as("+08:00 e so o fuso do aparelho: o instante e o de agora")
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
