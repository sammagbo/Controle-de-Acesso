package com.magbo.access.integration;

import ch.qos.logback.classic.Level;
import com.magbo.access.TestFixtures;
import com.magbo.access.controllers.HikvisionWebhookController;
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

    /**
     * Keep-alive do aparelho: eventType "heartBeat", SEM AccessControllerEvent
     * e sem serialNo. Formato diferente do heartbeat.txt (major 5 / sub 9), que
     * vem embrulhado como evento — sao dois formatos do mesmo ruido.
     */
    private static final String KEEPALIVE = "heartbeat-keepalive.txt";

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
     * Achado de PRODUCAO (03/08/2026): o keep-alive de verdade — eventType
     * "heartBeat" — nao traz AccessControllerEvent nenhum. Depois do
     * endurecimento da ingestao ele passou a cair no ramo de evento
     * DESCONHECIDO, que loga uma linha INFO por evento; e como o keep-alive
     * tambem nao traz serialNo, o dedup de desconhecido nao tinha chave para
     * suprimir nada. Resultado: uma linha INFO a cada ~30s por aparelho
     * (~2900/dia com um terminal so), afogando no log os eventos que importam.
     *
     * Contrato: no maximo UM INFO por aparelho por janela de heartbeat, o resto
     * em DEBUG — o mesmo limitador que ja valia para o heartbeat major 5/sub 9.
     */
    @Test
    @DisplayName("keep-alive (eventType heartBeat) -> 1 INFO por aparelho por janela, resto em DEBUG")
    void keepAliveNaoGeraUmInfoPorBatida() throws Exception {
        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            for (int i = 0; i < 6; i++) {
                mockMvc.perform(TestFixtures.jsonWebhook(
                                TestFixtures.payload(KEEPALIVE), TestFixtures.IP_CANTINA_ENTRADA))
                        .andExpect(status().isOk());
            }

            assertThat(logs.count(Level.INFO))
                    .as("6 batidas do mesmo aparelho nao podem virar 6 linhas INFO")
                    .isEqualTo(1);
            assertThat(logs.count(Level.INFO, "Heartbeat do terminal")).isEqualTo(1);
            assertThat(logs.count(Level.DEBUG, "Heartbeat")).isEqualTo(5);
            assertThat(logs.count(Level.INFO, "Evento nao tratado"))
                    .as("keep-alive nao pode mais sair como evento desconhecido")
                    .isZero();
        }
    }

    /** A janela e POR APARELHO: um terminal calado nao pode calar os outros. */
    @Test
    @DisplayName("keep-alive de dois aparelhos -> um INFO para cada")
    void janelaDeHeartbeatEhPorAparelho() throws Exception {
        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            mockMvc.perform(TestFixtures.jsonWebhook(
                            TestFixtures.payload(KEEPALIVE), TestFixtures.IP_CANTINA_ENTRADA))
                    .andExpect(status().isOk());
            mockMvc.perform(TestFixtures.jsonWebhook(
                            TestFixtures.payload(KEEPALIVE), TestFixtures.IP_PORTAO_SAIDA))
                    .andExpect(status().isOk());

            assertThat(logs.count(Level.INFO, "Heartbeat do terminal")).isEqualTo(2);
        }
    }

    @Test
    @DisplayName("keep-alive -> 200, 0 logs, 0 attempts")
    void keepAliveNaoPersisteNada() throws Exception {
        mockMvc.perform(TestFixtures.jsonWebhook(
                        TestFixtures.payload(KEEPALIVE), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    /**
     * O desvio de heartbeat nao pode ter levado junto os OUTROS eventos
     * desconhecidos: um sync do aparelho continua saindo com a linha INFO
     * identificavel de sempre.
     */
    @Test
    @DisplayName("evento desconhecido que NAO e heartbeat segue no caminho de sempre")
    void desvioNaoAfetaOutroEventoDesconhecido() throws Exception {
        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            mockMvc.perform(TestFixtures.multipartWebhookParts(TestFixtures.IP_BIBLIO,
                            TestFixtures.jsonPart("LocalUserChange",
                                    TestFixtures.payload("local-user-change.txt"))))
                    .andExpect(status().isOk());

            assertThat(logs.count(Level.INFO, "Evento nao tratado, descartado")).isEqualTo(1);
        }
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
