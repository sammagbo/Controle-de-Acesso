package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * O terminal MinMoe manda DUAS parts: "AccessControllerEvent" (JSON) e
 * "Picture" (jpeg de ~25-46KB). O parse precisa achar o JSON e ignorar a
 * imagem, independente da ordem das parts.
 */
class WebhookMultipartPictureIT extends AbstractIT {

    @Test
    @DisplayName("multipart com Picture + AccessControllerEvent -> imagem ignorada, JSON processado")
    void imagemEhIgnoradaEJsonProcessado() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        // multipartWebhook monta exatamente as duas parts do formato real
        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getUserId()).isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
                    assertThat(log.getAuthMethod()).isEqualTo(AuthMethod.FACE);
                });
    }

    @Test
    @DisplayName("multipart SEM a part Picture tambem processa (nem todo evento traz foto)")
    void semPictureTambemProcessa() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhookSemFoto(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("multipart so com a Picture (sem JSON) -> 200 sem processar nada")
    void soImagemNaoProcessaNada() throws Exception {
        org.springframework.mock.web.MockPart picture =
                new org.springframework.mock.web.MockPart("Picture", "face.jpg",
                        new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xD9});
        picture.getHeaders().setContentType(org.springframework.http.MediaType.IMAGE_JPEG);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .multipart(TestFixtures.WEBHOOK_URL)
                        .part(picture)
                        .header(TestFixtures.TOKEN_HEADER, TestFixtures.WEBHOOK_TOKEN))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }
}
