package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Autenticacao do webhook: deny-by-default, header OU query string.
 * O endpoint e permitAll no SecurityConfig — o guard e do proprio controller.
 */
class WebhookTokenIT extends AbstractIT {

    private static final String JSON = "{\"AccessControllerEvent\":{\"subEventType\":75,\"employeeNoString\":\"9999999\"}}";

    @Test
    @DisplayName("sem token -> 401, nada processado")
    void semTokenEh401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(TestFixtures.WEBHOOK_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON))
                .andExpect(status().isUnauthorized());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("token errado no header -> 401")
    void tokenErradoEh401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(TestFixtures.WEBHOOK_URL)
                        .header(TestFixtures.TOKEN_HEADER, "token-errado")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("token errado na query -> 401")
    void tokenErradoNaQueryEh401() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(TestFixtures.WEBHOOK_URL + "?token=token-errado")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("token correto no header -> 200")
    void tokenCorretoNoHeaderEh200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(TestFixtures.WEBHOOK_URL)
                        .header(TestFixtures.TOKEN_HEADER, TestFixtures.WEBHOOK_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON))
                .andExpect(status().isOk());
    }

    /**
     * Os MinMoe nao suportam header customizado na Ecoute HTTP — em producao o
     * token viaja na URL (?token=). Este e o caminho usado pelo hardware real.
     */
    @Test
    @DisplayName("token correto via ?token= -> 200 (caminho do hardware real)")
    void tokenCorretoNaQueryEh200() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(
                                TestFixtures.WEBHOOK_URL + "?token=" + TestFixtures.WEBHOOK_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("token com espacos nas pontas -> aceito (trim dos dois lados; CRLF ja mordeu)")
    void tokenComEspacosEhAceito() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(TestFixtures.WEBHOOK_URL)
                        .header(TestFixtures.TOKEN_HEADER, "  " + TestFixtures.WEBHOOK_TOKEN + "  ")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("header errado NAO cai para a query correta (header presente tem precedencia)")
    void headerErradoNaoCaiParaQuery() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.post(
                                TestFixtures.WEBHOOK_URL + "?token=" + TestFixtures.WEBHOOK_TOKEN)
                        .header(TestFixtures.TOKEN_HEADER, "token-errado")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JSON))
                .andExpect(status().isUnauthorized());
    }
}
