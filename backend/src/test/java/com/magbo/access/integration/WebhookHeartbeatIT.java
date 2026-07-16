package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Ruido de dispositivo: heartbeat (~30s), porta abriu/fechou (21/22), eventos
 * de boot. Nada disso pode poluir access_logs NEM access_attempts.
 *
 * NOTA DE FIACAO: os 0 attempts vem do guard do CONTROLLER
 * (HikvisionWebhookController:81 — employeeNoString null/vazio -> 200 sem
 * processar), nao do classificador. Um subtipo 21 que TROUXESSE identidade
 * cairia no ramo !isAccessCandidate e geraria attempt — ver o caso congelado
 * em AccessDecisionServiceTest#subtipoDesconhecidoGravaDeviceDeniedIndevidamente.
 */
class WebhookHeartbeatIT extends AbstractIT {

    @Test
    @DisplayName("heartbeat -> 200, 0 logs, 0 attempts")
    void heartbeatEhIgnorado() throws Exception {
        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(
                        TestFixtures.payload("heartbeat.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count())
                .as("ruido de dispositivo nao pode virar tentativa")
                .isZero();
    }

    @Test
    @DisplayName("porta abriu (21) -> 200, 0 logs, 0 attempts")
    void portaAbriuEhIgnorado() throws Exception {
        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(
                        TestFixtures.payload("door-21.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("porta fechou (22) -> 200, 0 logs, 0 attempts")
    void portaFechouEhIgnorado() throws Exception {
        String payload = TestFixtures.withSubEventType(TestFixtures.payload("door-21.txt"), 22);

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("evento de boot (major 1/2/3, subs de config) -> ignorado")
    void eventoDeBootEhIgnorado() throws Exception {
        String payload = TestFixtures.withSubEventType(TestFixtures.payload("door-21.txt"), 1024);

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    /**
     * CONGELAMENTO DE ACHADO — o guard do controller usa isEmpty(), nao
     * isBlank(). Um employeeNoString de espacos passa do guard, chega ao
     * AccessAttemptService — que LANCA (employeeNoRaw blank) — e o controller
     * responde 500.
     *
     * Por que importa: os MinMoe ENFILEIRAM e reenviam eventos quando o
     * destino responde erro (observado 2x em bancada). Um payload assim
     * entraria em loop de retry eterno. Reportado ao Sam em 15/07/2026;
     * o hardware real nunca enviou espacos ate hoje, entao o congelamento
     * documenta o comportamento sem corrigi-lo nesta fase.
     */
    @Test
    @DisplayName("CONGELADO: employeeNoString de espacos passa do guard e responde 500")
    void employeeNoDeEspacosResultaEm500() throws Exception {
        String payload = TestFixtures.withEmployeeNo(TestFixtures.payload("door-21.txt"), " ");

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isInternalServerError());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count())
                .as("o record() lanca antes de salvar: nada persiste")
                .isZero();
    }
}
