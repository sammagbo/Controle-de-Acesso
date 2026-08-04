package com.magbo.access.integration;

import ch.qos.logback.classic.Level;
import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.services.EventTimeResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HORA DO EVENTO x HORA DE RECEPCAO.
 *
 * Incidente de producao de 03/08/2026: um terminal esvaziou a fila offline —
 * 33 eventos em 2 minutos, as 14:51, de passagens ocorridas horas antes. Como o
 * backend gravava LocalDateTime.now() da RECEPCAO, os 33 acessos entraram no
 * banco como se tivessem acontecido as 14:51: duracoes medias negativas, alunos
 * registrados na hora errada e no ponto errado. Os MinMoe enfileiram e reenviam
 * quando o destino cai (ja observado 2x em bancada) — a fila e comportamento
 * normal do aparelho, nao anomalia.
 *
 * Contrato: o timestamp gravado e o dateTime do PAYLOAD (instante real do
 * evento), convertido para America/Sao_Paulo. A hora de recepcao so entra como
 * ultimo recurso — e sempre deixando uma linha INFO com o IP de origem.
 *
 * Os payloads daqui vao VERBATIM (multipartWebhookVerbatim): estes sao os
 * unicos testes que precisam controlar a hora do evento, e os construtores
 * normais carimbam a hora corrente.
 */
class WebhookEventTimeIT extends AbstractIT {

    /** Uma fila de 3h — a ordem de grandeza do incidente de 03/08. */
    private static final long ATRASO_DA_FILA_HORAS = 3;

    @Test
    @DisplayName("evento atrasado na fila -> access_log com a hora do EVENTO, nao a da recepcao")
    void filaOfflineGravaAHoraDoEvento() throws Exception {
        alunoAutorizadoNaCantina();

        LocalDateTime ocorreuEm = LocalDateTime.now()
                .minusHours(ATRASO_DA_FILA_HORAS)
                .truncatedTo(ChronoUnit.SECONDS);

        mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                        faceOcorridaEm(ocorreuEm), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        AccessLog log = accessLogRepository.findAll().get(0);
        assertThat(log.getTimestamp())
                .as("o aluno passou %sh antes de o pacote chegar; o relatorio tem que dizer isso",
                        ATRASO_DA_FILA_HORAS)
                .isEqualTo(ocorreuEm);
    }

    /**
     * O aparelho manda a hora no fuso DELE (+08:00 de fabrica). O que vale e o
     * instante: os digitos do payload nunca podem ir crus para a coluna, que e
     * timestamp without time zone em hora local BRT.
     */
    @Test
    @DisplayName("dateTime em +08:00 e convertido para America/Sao_Paulo, nao copiado literalmente")
    void converteOFusoDoAparelhoEmVezDeCopiarOsDigitos() throws Exception {
        alunoAutorizadoNaCantina();

        LocalDateTime ocorreuEm = LocalDateTime.now().minusHours(2).truncatedTo(ChronoUnit.SECONDS);
        String payload = faceOcorridaEm(ocorreuEm);

        assertThat(payload)
                .as("o corpo precisa mesmo carregar o offset do aparelho para o teste valer")
                .contains("+08:00");

        mockMvc.perform(TestFixtures.multipartWebhookVerbatim(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll().get(0).getTimestamp()).isEqualTo(ocorreuEm);
    }

    /** access_attempts responde ao mesmo contrato — a auditoria depende dele. */
    @Test
    @DisplayName("tentativa negada tambem grava a hora do EVENTO")
    void attemptTambemUsaAHoraDoEvento() throws Exception {
        // Sem linha de entitlement o aluno e PENDING; no perfil test a politica
        // de PENDING e OBSERVATION, entao usamos NOT_AUTHORIZED, que e DENY.
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.NOT_AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        LocalDateTime ocorreuEm = LocalDateTime.now().minusHours(4).truncatedTo(ChronoUnit.SECONDS);

        mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                        faceOcorridaEm(ocorreuEm), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        AccessAttempt attempt = accessAttemptRepository.findAll().get(0);
        assertThat(attempt.getTimestamp()).isEqualTo(ocorreuEm);
    }

    /** Ramo camera: o dateTime vive dentro do EventNotificationAlert. */
    @Test
    @DisplayName("camera (JSON puro): le o dateTime de dentro do EventNotificationAlert")
    void cameraLeODateTimeDoEnvelopeInterno() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_BIBLIO, "BIBLIO", AccessAction.ENTRADA);

        LocalDateTime ocorreuEm = LocalDateTime.now().minusMinutes(90).truncatedTo(ChronoUnit.SECONDS);
        String payload = TestFixtures.withoutIpAddress(   // sem ipAddress -> terminalIp = remoteAddr
                TestFixtures.withDateTime(TestFixtures.payload("camera-json.json"),
                        TestFixtures.noFusoDoAparelho(ocorreuEm)));

        mockMvc.perform(TestFixtures.jsonWebhookVerbatim(payload, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll().get(0).getTimestamp()).isEqualTo(ocorreuEm);
    }

    // ───────────────── Fallback: hora de recepcao, sempre com rastro ─────────────────

    @Test
    @DisplayName("sem dateTime -> hora de recepcao + UMA linha INFO com ip e motivo")
    void semDateTimeCaiNaRecepcaoComRastro() throws Exception {
        alunoAutorizadoNaCantina();

        try (LogCaptor logs = new LogCaptor(EventTimeResolver.class)) {
            LocalDateTime antes = LocalDateTime.now().minusSeconds(5);

            mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                            TestFixtures.withoutDateTime(faceComSerialNovo()),
                            TestFixtures.IP_CANTINA_ENTRADA))
                    .andExpect(status().isOk());

            assertThat(accessLogRepository.findAll().get(0).getTimestamp())
                    .isBetween(antes, LocalDateTime.now().plusSeconds(5));
            assertThat(logs.count(Level.INFO, "ip=" + TestFixtures.IP_CANTINA_ENTRADA))
                    .as("descartar a hora do evento em silencio e o que nao se pode fazer")
                    .isEqualTo(1);
            assertThat(logs.count(Level.INFO, "dateTime ausente")).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("dateTime ilegivel -> hora de recepcao + INFO, e o acesso NAO se perde")
    void dateTimeIlegivelCaiNaRecepcao() throws Exception {
        alunoAutorizadoNaCantina();

        try (LogCaptor logs = new LogCaptor(EventTimeResolver.class)) {
            LocalDateTime antes = LocalDateTime.now().minusSeconds(5);

            mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                            TestFixtures.withDateTime(faceComSerialNovo(), "14/07/2026 11:33"),
                            TestFixtures.IP_CANTINA_ENTRADA))
                    .andExpect(status().isOk());

            assertThat(accessLogRepository.count())
                    .as("hora ruim nao pode custar o registro do acesso")
                    .isEqualTo(1);
            assertThat(accessLogRepository.findAll().get(0).getTimestamp())
                    .isBetween(antes, LocalDateTime.now().plusSeconds(5));
            assertThat(logs.count(Level.INFO, "dateTime ilegivel")).isEqualTo(1);
        }
    }

    // ───────────────── Guarda de sanidade, nas duas pontas ─────────────────

    /**
     * Relogio do aparelho adiantado. Um evento "do futuro" envenena presenca e
     * relatorio de um jeito que nao da para desfazer depois.
     */
    @Test
    @DisplayName("hora muito no futuro -> recusada, grava a recepcao")
    void horaNoFuturoAlemDaFolgaEhRecusada() throws Exception {
        alunoAutorizadoNaCantina();
        LocalDateTime futuro = LocalDateTime.now().plusHours(2).truncatedTo(ChronoUnit.SECONDS);

        try (LogCaptor logs = new LogCaptor(EventTimeResolver.class)) {
            LocalDateTime antes = LocalDateTime.now().minusSeconds(5);

            mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                            faceOcorridaEm(futuro), TestFixtures.IP_CANTINA_ENTRADA))
                    .andExpect(status().isOk());

            assertThat(accessLogRepository.findAll().get(0).getTimestamp())
                    .isBetween(antes, LocalDateTime.now().plusSeconds(5));
            assertThat(logs.count(Level.INFO, "relogio do aparelho adiantado")).isEqualTo(1);
        }
    }

    /**
     * Dentro da folga de 5 min o desvio e dessincronia normal entre relogios —
     * a hora do evento continua valendo. Sem esta ponta, a guarda poderia estar
     * simplesmente recusando tudo que nao e passado.
     */
    @Test
    @DisplayName("hora poucos segundos no futuro (dessincronia normal) -> aceita")
    void pequenoAdiantamentoContinuaValendo() throws Exception {
        alunoAutorizadoNaCantina();
        LocalDateTime quaseAgora = LocalDateTime.now().plusSeconds(30).truncatedTo(ChronoUnit.SECONDS);

        mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                        faceOcorridaEm(quaseAgora), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll().get(0).getTimestamp()).isEqualTo(quaseAgora);
    }

    /** Aparelho que voltou ao relogio de fabrica manda uma data de decadas atras. */
    @Test
    @DisplayName("hora antiga demais (relogio de fabrica) -> recusada, grava a recepcao")
    void horaAntigaDemaisEhRecusada() throws Exception {
        alunoAutorizadoNaCantina();
        LocalDateTime relogioZerado = LocalDateTime.of(1970, 1, 1, 0, 0, 0);

        try (LogCaptor logs = new LogCaptor(EventTimeResolver.class)) {
            LocalDateTime antes = LocalDateTime.now().minusSeconds(5);

            mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                            faceOcorridaEm(relogioZerado), TestFixtures.IP_CANTINA_ENTRADA))
                    .andExpect(status().isOk());

            assertThat(accessLogRepository.findAll().get(0).getTimestamp())
                    .isBetween(antes, LocalDateTime.now().plusSeconds(5));
            assertThat(logs.count(Level.INFO, "antiga demais")).isEqualTo(1);
        }
    }

    /**
     * Uma fila de 5 dias e longa, mas plausivel (terminal esquecido offline num
     * feriado prolongado) — a guarda de 30 dias nao pode comer isso.
     */
    @Test
    @DisplayName("fila de 5 dias -> dentro da guarda, hora do evento preservada")
    void filaLongaMasPlausivelEhPreservada() throws Exception {
        alunoAutorizadoNaCantina();
        LocalDateTime cincoDiasAtras = LocalDateTime.now().minusDays(5).truncatedTo(ChronoUnit.SECONDS);

        mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                        faceOcorridaEm(cincoDiasAtras), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll().get(0).getTimestamp()).isEqualTo(cincoDiasAtras);
    }

    // ───────────────── Helpers ─────────────────

    /** Payload real de face, reescrito para um instante escolhido pelo teste. */
    private static String faceOcorridaEm(LocalDateTime instante) {
        return TestFixtures.withDateTime(faceComSerialNovo(),
                TestFixtures.noFusoDoAparelho(instante));
    }

    /**
     * Serial novo por chamada: o corpo vai verbatim, entao o serial da captura
     * (123) se repetiria e o dedup de ingestao engoliria o segundo evento.
     */
    private static String faceComSerialNovo() {
        return TestFixtures.withSerialNo(TestFixtures.payload("face-75.txt"), TestFixtures.nextSerialNo());
    }

    private void alunoAutorizadoNaCantina() {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);
    }
}
