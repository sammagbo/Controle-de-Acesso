package com.magbo.access.integration;

import ch.qos.logback.classic.Level;
import com.magbo.access.TestFixtures;
import com.magbo.access.controllers.HikvisionWebhookController;
import com.magbo.access.models.AccessAction;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Dedup de INGESTAO (nao confundir com o DeduplicationService da camada de
 * decisao, que e por pessoa/ponto e so na cantina): os MinMoe ENFILEIRAM e
 * reenviam eventos quando o destino responde erro (observado 2x em bancada;
 * loop de ~1 req/s da DeepinView comprovado por tcpdump em 28/07). Cada
 * reentrega carrega o MESMO serialNo do mesmo aparelho — reprocessar duplica
 * access_logs e inunda o log da aplicacao.
 *
 * Contrato: duplicata por (IP de origem, serialNo) dentro do TTL responde 200,
 * loga DEBUG e NAO escreve no banco. Sem serialNo, dedup nunca se aplica
 * (nunca arriscar descartar evento legitimo).
 */
class WebhookIngestionDedupIT extends AbstractIT {

    private void seedAlunoNaBiblio() {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_BIBLIO, "BIBLIO", AccessAction.ENTRADA);
    }

    @Test
    @DisplayName("reentrega (mesmo IP, mesmo serialNo) -> 200 e NAO persiste de novo")
    void reentregaNaoRepersiste() throws Exception {
        seedAlunoNaBiblio();
        String payload = TestFixtures.payload("face-75.txt");

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("a reentrega do mesmo evento nao pode virar segundo access_log")
                .isEqualTo(1);
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("serialNos diferentes do mesmo IP -> ambos processam (dedup nao pode comer evento novo)")
    void serialsDiferentesProcessamAmbos() throws Exception {
        seedAlunoNaBiblio();
        String payload = TestFixtures.payload("face-75.txt");

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(
                        TestFixtures.withSerialNo(payload, 9124), TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("mesmo serialNo vindo de IPs diferentes -> ambos processam (chave inclui o IP)")
    void mesmoSerialDeIpsDiferentesProcessamAmbos() throws Exception {
        seedAlunoNaBiblio();
        seedMapping(TestFixtures.IP_CANTINA_SAIDA, "BIBLIO2", AccessAction.ENTRADA);
        String payload = TestFixtures.payload("face-75.txt");

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_CANTINA_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("payload sem serialNo -> dedup nunca se aplica, ambos processam")
    void semSerialNoNuncaDeduplica() throws Exception {
        seedAlunoNaBiblio();
        String payload = TestFixtures.withoutSerialNo(TestFixtures.payload("face-75.txt"));

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("duplicata loga DEBUG, nao repete o INFO 'Received' — e o INFO traz o IP de origem")
    void duplicataLogaDebugNaoInfo() throws Exception {
        seedAlunoNaBiblio();
        String payload = TestFixtures.payload("face-75.txt");

        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_BIBLIO))
                    .andExpect(status().isOk());
            mockMvc.perform(TestFixtures.multipartWebhookSemFoto(payload, TestFixtures.IP_BIBLIO))
                    .andExpect(status().isOk());

            assertThat(logs.count(Level.INFO, "Received Hikvision Webhook"))
                    .as("so a primeira entrega loga a recepcao em INFO")
                    .isEqualTo(1);
            assertThat(logs.count(Level.INFO, "ip=" + TestFixtures.IP_BIBLIO))
                    .as("a linha de recepcao atribui o evento ao IP de origem")
                    .isEqualTo(1);
            assertThat(logs.count(Level.DEBUG, "serialNo="))
                    .as("a reentrega descartada e registrada em DEBUG")
                    .isEqualTo(1);
        }
    }
}
