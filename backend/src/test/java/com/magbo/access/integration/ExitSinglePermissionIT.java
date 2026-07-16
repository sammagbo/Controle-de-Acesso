package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.ExitPermissionStatus;
import com.magbo.access.models.ExitPermissionType;
import com.magbo.access.models.StudentExitPermission;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Permissao SINGLE: vale UMA vez. A 1a saida registra o log e consome a
 * permissao (status USED); a 2a tentativa e negada.
 */
class ExitSinglePermissionIT extends AbstractIT {

    @Test
    @DisplayName("SINGLE: 1a saida registra log + marca USED; 2a saida vira attempt negado")
    void permissaoSingleValeUmaVezSo() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_PORTAO_SAIDA, "PORT1", AccessAction.SAIDA);
        StudentExitPermission single = exitPermissionRepository.save(
                TestFixtures.permission(TestFixtures.EMPLOYEE_PILOTO,
                        ExitPermissionType.SINGLE, ExitPermissionStatus.ACTIVE));
        Long permId = single.getId();

        // ── 1a saida ──
        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_PORTAO_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("1a saida com permissao valida deve registrar log")
                .isEqualTo(1);
        assertThat(accessAttemptRepository.count()).isZero();
        assertThat(exitPermissionRepository.findById(permId).orElseThrow().getStatus())
                .as("a permissao SINGLE foi consumida")
                .isEqualTo(ExitPermissionStatus.USED);
        assertThat(exitPermissionRepository.findById(permId).orElseThrow().getUsedAt())
                .as("usedAt carimbado no consumo")
                .isNotNull();

        // ── 2a saida ──
        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_PORTAO_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("a 2a tentativa NAO pode gerar novo log")
                .isEqualTo(1);
        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .satisfies(a -> {
                    assertThat(a.getDenialReason())
                            .as("permissao ja USED nao esta mais ACTIVE -> EXIT_NOT_AUTHORIZED")
                            .isEqualTo(DenialReason.EXIT_NOT_AUTHORIZED);
                    assertThat(a.getAuthorizationResult()).isEqualTo(AuthorizationResult.DENIED);
                });
    }

    @Test
    @DisplayName("SINGLE consumida nao reaparece: 3a tentativa continua negada")
    void permissaoConsumidaNaoRessuscita() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_PORTAO_SAIDA, "PORT1", AccessAction.SAIDA);
        exitPermissionRepository.save(TestFixtures.permission(TestFixtures.EMPLOYEE_PILOTO,
                ExitPermissionType.SINGLE, ExitPermissionStatus.ACTIVE));

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(TestFixtures.multipartWebhook(
                            TestFixtures.payload("face-75.txt"), TestFixtures.IP_PORTAO_SAIDA))
                    .andExpect(status().isOk());
        }

        assertThat(accessLogRepository.count()).isEqualTo(1);
        assertThat(accessAttemptRepository.findAll())
                .hasSize(2)
                .extracting(AccessAttempt::getDenialReason)
                .containsOnly(DenialReason.EXIT_NOT_AUTHORIZED);
    }
}
