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
 * Contrato: duplicata por (IP de origem, serialNo) dentro da janela responde
 * 200, NAO escreve no banco e deixa UMA linha INFO com ip + serialNo. Sem
 * serialNo, dedup nunca se aplica (nunca arriscar descartar evento legitimo).
 *
 * Estes sao os UNICOS testes que usam multipartWebhookSerialDoPayload: repetir
 * o serialNo e a assinatura da reentrega, e e disso que trata a classe. Os
 * demais ITs usam multipartWebhookSemFoto/multipartWebhook, que carimbam serial
 * novo a cada evento como um aparelho real.
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

        mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
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

        mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(
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

        mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_CANTINA_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("payload sem serialNo -> dedup nunca se aplica, ambos processam")
    void semSerialNoNuncaDeduplica() throws Exception {
        seedAlunoNaBiblio();
        String payload = TestFixtures.withoutSerialNo(TestFixtures.payload("face-75.txt"));

        mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    /**
     * Descarte NUNCA silencioso. Em producao o nivel do pacote e INFO: se a
     * linha do descarte fosse DEBUG, um evento de acesso sumiria sem rastro
     * nenhum no arquivo de log — e nao haveria como responder "o pacote chegou?"
     * quando faltasse um access_log. A linha tem que trazer o que identifica o
     * pacote: IP de origem + serialNo.
     */
    @Test
    @DisplayName("descarte deixa UMA linha INFO com ip + serialNo, e nao repete o INFO 'Received'")
    void duplicataDescartadaDeixaRastroEmInfo() throws Exception {
        seedAlunoNaBiblio();
        String payload = TestFixtures.withSerialNo(TestFixtures.payload("face-75.txt"), 7788);

        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
                    .andExpect(status().isOk());
            mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
                    .andExpect(status().isOk());

            assertThat(logs.count(Level.INFO, "Received Hikvision Webhook"))
                    .as("so a primeira entrega loga a recepcao do evento")
                    .isEqualTo(1);
            assertThat(logs.count(Level.INFO, "duplicado descartado"))
                    .as("o descarte da reentrega deixa exatamente uma linha INFO")
                    .isEqualTo(1);
            assertThat(logs.events().stream()
                    .filter(e -> e.getLevel() == Level.INFO)
                    .map(e -> e.getFormattedMessage())
                    .filter(m -> m.contains("duplicado descartado"))
                    .toList())
                    .singleElement()
                    .as("a linha do descarte identifica o pacote: ip de origem + serialNo")
                    .satisfies(msg -> assertThat(msg)
                            .contains("ip=" + TestFixtures.IP_BIBLIO)
                            .contains("serialNo=7788"));
            assertThat(logs.count(Level.DEBUG, "duplicado descartado"))
                    .as("o descarte NAO pode viver so em DEBUG: em producao DEBUG nao sai")
                    .isZero();
        }
    }

    /**
     * Um aparelho preso em loop nao pode gerar descarte mudo: cada reentrega
     * deixa a sua linha. Custo aceito conscientemente (ver o comentario no
     * controller) — a propria linha e o alarme que denuncia o loop.
     */
    @Test
    @DisplayName("loop de reentregas: uma linha INFO de descarte por reentrega, nenhuma escrita a mais")
    void loopDeReentregasLogaCadaDescarte() throws Exception {
        seedAlunoNaBiblio();
        String payload = TestFixtures.payload("face-75.txt");

        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            for (int i = 0; i < 5; i++) {
                mockMvc.perform(TestFixtures.multipartWebhookSerialDoPayload(payload, TestFixtures.IP_BIBLIO))
                        .andExpect(status().isOk());
            }

            assertThat(accessLogRepository.count())
                    .as("so a primeira entrega vira access_log")
                    .isEqualTo(1);
            assertThat(logs.count(Level.INFO, "duplicado descartado"))
                    .as("as 4 reentregas deixam 4 linhas — nenhum descarte silencioso")
                    .isEqualTo(4);
        }
    }
}
