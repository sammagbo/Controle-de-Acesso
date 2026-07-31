package com.magbo.access.integration;

import ch.qos.logback.classic.Level;
import com.magbo.access.TestFixtures;
import com.magbo.access.controllers.HikvisionWebhookController;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Eventos que NAO sao AccessControllerEvent. Caso real de producao (29/07/2026):
 * part "LocalUserChange", sync do proprio aparelho apos edicao de usuario.
 *
 * Contrato: 200, UMA linha INFO concisa (ip + part + eventType + serialNo),
 * descartado. Sem stack trace e sem WARN por requisicao — um aparelho em loop
 * de sync nao pode encher o log sozinho.
 */
class WebhookUnknownEventIT extends AbstractIT {

    private static final String LOCAL_USER_CHANGE = "local-user-change.txt";

    @Test
    @DisplayName("part LocalUserChange -> 200, nada persiste")
    void localUserChangeEhDescartado() throws Exception {
        mockMvc.perform(TestFixtures.multipartWebhookParts(TestFixtures.IP_BIBLIO,
                        TestFixtures.jsonPart("LocalUserChange", TestFixtures.payload(LOCAL_USER_CHANGE))))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count())
                .as("evento de sync do aparelho nao e tentativa de acesso")
                .isZero();
    }

    @Test
    @DisplayName("uma linha INFO com ip + part + eventType + serialNo, e nenhum WARN")
    void logaUmaLinhaInfoComOsIdentificadores() throws Exception {
        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            mockMvc.perform(TestFixtures.multipartWebhookParts(TestFixtures.IP_BIBLIO,
                            TestFixtures.jsonPart("LocalUserChange", TestFixtures.payload(LOCAL_USER_CHANGE))))
                    .andExpect(status().isOk());

            assertThat(logs.count(Level.INFO)).isEqualTo(1);
            assertThat(logs.events().get(0).getFormattedMessage())
                    .contains("ip=" + TestFixtures.IP_BIBLIO)
                    .contains("part=LocalUserChange")
                    .contains("eventType=LocalUserChange")
                    .contains("serialNo=4471");
            assertThat(logs.count(Level.WARN))
                    .as("descarte previsto nao e anomalia: nada de WARN")
                    .isZero();
            assertThat(logs.count(Level.ERROR)).isZero();
        }
    }

    @Test
    @DisplayName("reentrega do mesmo evento desconhecido -> so a primeira loga INFO")
    void reentregaDeDesconhecidoNaoRepeteInfo() throws Exception {
        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            for (int i = 0; i < 4; i++) {
                mockMvc.perform(TestFixtures.multipartWebhookParts(TestFixtures.IP_BIBLIO,
                                TestFixtures.jsonPart("LocalUserChange", TestFixtures.payload(LOCAL_USER_CHANGE))))
                        .andExpect(status().isOk());
            }

            assertThat(logs.count(Level.INFO))
                    .as("aparelho preso em loop de sync gera UMA linha, nao uma por requisicao")
                    .isEqualTo(1);
            assertThat(logs.count(Level.DEBUG, "reentregue")).isEqualTo(3);
        }
    }

    @Test
    @DisplayName("JSON puro de tipo desconhecido (camera) -> 200, descartado, part=(json)")
    void jsonPuroDesconhecidoEhDescartado() throws Exception {
        try (LogCaptor logs = new LogCaptor(HikvisionWebhookController.class)) {
            mockMvc.perform(TestFixtures.jsonWebhook(
                            TestFixtures.payload(LOCAL_USER_CHANGE), TestFixtures.IP_BIBLIO))
                    .andExpect(status().isOk());

            assertThat(accessLogRepository.count()).isZero();
            assertThat(logs.count(Level.INFO, "part=(json)")).isEqualTo(1);
        }
    }

    /**
     * A garantia que mais importa: nada disto pode ter mexido no caminho bom.
     * Mesmo aparelho, evento de sync seguido de uma face real -> a face
     * processa normalmente.
     */
    @Test
    @DisplayName("evento desconhecido nao contamina o AccessControllerEvent seguinte do mesmo aparelho")
    void naoContaminaOFluxoConhecido() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhookParts(TestFixtures.IP_CANTINA_ENTRADA,
                        TestFixtures.jsonPart("LocalUserChange", TestFixtures.payload(LOCAL_USER_CHANGE))))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("o evento de acesso real segue sendo gravado")
                .isEqualTo(1);
    }

    /**
     * Ordem das parts nao pode decidir se o acesso e registrado: a part
     * AccessControllerEvent tem precedencia sobre qualquer outra part JSON.
     */
    @Test
    @DisplayName("LocalUserChange ANTES do AccessControllerEvent -> o evento de acesso ainda processa")
    void partDeEventoTemPrecedenciaSobreOutroJson() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhookParts(TestFixtures.IP_CANTINA_ENTRADA,
                        TestFixtures.jsonPart("LocalUserChange", TestFixtures.payload(LOCAL_USER_CHANGE)),
                        TestFixtures.jsonPart("AccessControllerEvent", TestFixtures.payload("face-75.txt"))))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(1);
    }
}
