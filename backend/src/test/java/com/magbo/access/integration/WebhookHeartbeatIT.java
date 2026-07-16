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
 * (HikvisionWebhookController:81 — employeeNoString null/em branco -> 200 sem
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
     * Achado corrigido em 16/07/2026 (Fase B.1): o guard do controller usava
     * isEmpty(), um employeeNoString de espacos passava e o controller
     * respondia 500 — e os MinMoe ENFILEIRAM e reenviam eventos quando o
     * destino responde erro (observado 2x em bancada), risco de loop de retry
     * eterno. Com isBlank() o payload e ignorado como os demais ruidos: 200
     * sem processar, nada persiste.
     */
    @Test
    @DisplayName("employeeNoString de espacos -> 200 ignorado, 0 logs, 0 attempts")
    void employeeNoDeEspacosEhIgnorado() throws Exception {
        String payload = TestFixtures.withEmployeeNo(TestFixtures.payload("door-21.txt"), " ");

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count())
                .as("o guard do controller ignora antes de processar: nada persiste")
                .isZero();
    }
}
