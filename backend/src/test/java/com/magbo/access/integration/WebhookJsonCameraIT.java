package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthMethod;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Ramo camera DeepinView: JSON puro EventNotificationAlert (sem multipart).
 *
 * Este ramo NUNCA foi exercitado com hardware real (cameras da portaria
 * isoladas por VLAN — risco aberto). Estes testes congelam o contrato
 * implementado ate o payload real ser capturado.
 *
 * IMPORTANTE: aqui o terminalIp vem do ipAddress DO PAYLOAD
 * (HikvisionWebhookController:70-72) — diferente do ramo multipart, que usa
 * request.getRemoteAddr(). Os dois casos abaixo provam os dois lados; sem o
 * segundo, o ramo do payload poderia quebrar sem nenhum teste notar.
 */
class WebhookJsonCameraIT extends AbstractIT {

    @Test
    @DisplayName("JSON de camera COM ipAddress -> resolve o mapping pelo IP do PAYLOAD")
    void ipDoPayloadResolveOMapping() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        // O mapping fica no IP do payload (192.168.1.167, ja semeado pelo
        // bootstrap como PORT1/ENTRADA). O remoteAddr e OUTRO IP, sem mapping:
        // se o codigo usasse o remoteAddr, cairia no fallback e nao em PORT1.
        mockMvc.perform(TestFixtures.jsonWebhook(
                        TestFixtures.payload("camera-json.json"), "10.10.0.77"))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getPointId())
                            .as("192.168.1.167 -> PORT1/ENTRADA (seed do DoorMappingBootstrap)")
                            .isEqualTo("PORT1");
                    assertThat(log.getAction()).isEqualTo(AccessAction.ENTRADA);
                    assertThat(log.getAuthMethod()).isEqualTo(AuthMethod.FACE);
                    assertThat(log.getUserId()).isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
                });
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("JSON de camera SEM ipAddress -> cai no fallback do remoteAddr")
    void semIpAddressCaiNoRemoteAddr() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_BIBLIO, "BIBLIO", AccessAction.ENTRADA);

        String semIp = TestFixtures.withoutIpAddress(TestFixtures.payload("camera-json.json"));

        mockMvc.perform(TestFixtures.jsonWebhook(semIp, TestFixtures.IP_BIBLIO))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll())
                .singleElement()
                .extracting(AccessLog::getPointId)
                .as("sem ipAddress no payload, o IP de origem da requisicao decide")
                .isEqualTo("BIBLIO");
    }

    @Test
    @DisplayName("JSON de camera com subtipo 8 -> mesmo tratamento do multipart: 0 logs")
    void camaraNegadaTambemNaoViraLog() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));

        String negado = TestFixtures.withSubEventType(TestFixtures.payload("camera-json.json"), 8);

        mockMvc.perform(TestFixtures.jsonWebhook(negado, "10.10.0.77"))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("corpo nao-parseavel -> 200 (evita tempestade de retries do aparelho)")
    void corpoInvalidoRespondera200() throws Exception {
        mockMvc.perform(TestFixtures.jsonWebhook("isto nao e json {{{", "10.10.0.77"))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }
}
