package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthMethod;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Token como SEGMENTO DE CAMINHO: /api/hikvision/webhook/t/{token}.
 *
 * Motivo: a camera DeepinView da portaria (canal "Serveur d'alarme") nao envia
 * o token de jeito nenhum — descarta a query string da URL configurada e nao
 * suporta header customizado. Comprovado com tcpdump em 28/07/2026: o aparelho
 * reenviava em loop (~1 req/s, milhares de 401) ate a entrada ser removida
 * dele. Segmento de caminho e o unico formato que ela preserva.
 *
 * As duas rotas compartilham o MESMO handleEvent: os testes abaixo provam que
 * a autenticacao e o processamento sao identicos aos do /webhook. A nao
 * regressao do /webhook fica em WebhookTokenIT, que nao foi tocado.
 */
class WebhookPathTokenIT extends AbstractIT {

    @Test
    @DisplayName("token correto no caminho -> 200 e evento processado igual ao /webhook")
    void tokenNoCaminhoProcessaOEvento() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));

        mockMvc.perform(TestFixtures.jsonWebhookPathToken(
                        TestFixtures.WEBHOOK_TOKEN,
                        TestFixtures.payload("camera-json.json"),
                        "10.10.0.77"))
                .andExpect(status().isOk());

        // Mesmas asercoes de WebhookJsonCameraIT para o /webhook: o IP do
        // payload (192.168.1.167) resolve PORT1/ENTRADA pelo seed do bootstrap.
        assertThat(accessLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getPointId()).isEqualTo("PORT1");
                    assertThat(log.getAction()).isEqualTo(AccessAction.ENTRADA);
                    assertThat(log.getAuthMethod()).isEqualTo(AuthMethod.FACE);
                    assertThat(log.getUserId()).isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
                });
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("token errado no caminho -> 401, nada gravado")
    void tokenErradoNoCaminhoEh401() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));

        mockMvc.perform(TestFixtures.jsonWebhookPathToken(
                        "token-errado",
                        TestFixtures.payload("camera-json.json"),
                        "10.10.0.77"))
                .andExpect(status().isUnauthorized());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    /**
     * O guard e do controller, nao do SecurityConfig: a rota e permitAll
     * ("/api/hikvision/webhook/t/**"). Se o permitAll faltasse, a resposta seria
     * 403 do Spring Security em vez de 401 — e a camera continuaria em loop.
     */
    @Test
    @DisplayName("a rota e permitAll: token invalido devolve 401 do controller, nao 403 do Security")
    void rotaEhPermitAllComGuardDoController() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(TestFixtures.webhookPathTokenUrl("qualquer-coisa"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * Por isso o segmento "/t/" e obrigatorio: um mapping "/webhook/{token}"
     * engoliria /webhook/capture, com token="capture".
     */
    @Test
    @DisplayName("/webhook/capture continua chegando no endpoint de captura")
    void captureNaoEhEngolidoPeloNovoMapping() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(TestFixtures.WEBHOOK_CAPTURE_URL)
                        .header(TestFixtures.TOKEN_HEADER, TestFixtures.WEBHOOK_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(TestFixtures.payload("camera-json.json")))
                .andExpect(status().isOk())
                .andExpect(content().string("Captured"));

        assertThat(accessLogRepository.count())
                .as("o endpoint de captura nao persiste")
                .isZero();
    }
}
