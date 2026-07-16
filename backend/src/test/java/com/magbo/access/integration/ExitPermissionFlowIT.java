package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.ExitPermissionStatus;
import com.magbo.access.models.ExitPermissionType;
import com.magbo.access.models.StudentExitPermission;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Fluxo completo da Fase D: aluno sem autorizacao tenta sair pelo portao.
 * A exigencia do cliente: a tentativa negada NAO pode alterar a presenca.
 */
class ExitPermissionFlowIT extends AbstractIT {

    @Test
    @DisplayName("sem permissao + face no PORT1/SAIDA -> 0 novos logs, attempt EXIT_NOT_AUTHORIZED, presenca INALTERADA")
    void saidaSemPermissaoNaoAlteraPresenca() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_PORTAO_SAIDA, "PORT1", AccessAction.SAIDA);

        // O aluno entrou pela manha: presenca = 1.
        accessLogRepository.save(AccessLog.builder()
                .userId(TestFixtures.EMPLOYEE_PILOTO)
                .pointId("PORT1")
                .action(AccessAction.ENTRADA)
                .timestamp(LocalDateTime.now().minusHours(3))
                .build());

        LocalDateTime inicioDoDia = java.time.LocalDate.now().atStartOfDay();
        long presencaAntes = accessLogRepository.countPresentToday(inicioDoDia);
        assertThat(presencaAntes).isEqualTo(1);
        long logsAntes = accessLogRepository.count();

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_PORTAO_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("a saida negada nao pode virar access_log")
                .isEqualTo(logsAntes);
        assertThat(accessLogRepository.countPresentToday(inicioDoDia))
                .as("★ presenca INALTERADA — exigencia do cliente")
                .isEqualTo(presencaAntes);

        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .satisfies(a -> {
                    assertThat(a.getDenialReason()).isEqualTo(DenialReason.EXIT_NOT_AUTHORIZED);
                    assertThat(a.getAuthorizationResult()).isEqualTo(AuthorizationResult.DENIED);
                    assertThat(a.getUserId()).isEqualTo(TestFixtures.EMPLOYEE_PILOTO);
                    assertThat(a.getPointId()).isEqualTo("PORT1");
                });
    }

    @Test
    @DisplayName("permissao ACTIVE mas fora da janela -> attempt OUTSIDE_EXIT_WINDOW (motivo distinto)")
    void permissaoForaDaJanelaTemMotivoProprio() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_PORTAO_SAIDA, "PORT1", AccessAction.SAIDA);
        // DATE_RANGE de um periodo ja encerrado: existe, esta ACTIVE, nao vale hoje.
        StudentExitPermission p = TestFixtures.permission(TestFixtures.EMPLOYEE_PILOTO,
                ExitPermissionType.DATE_RANGE, ExitPermissionStatus.ACTIVE);
        p.setValidFrom(java.time.LocalDate.now().minusDays(30));
        p.setValidUntil(java.time.LocalDate.now().minusDays(10));
        exitPermissionRepository.save(p);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_PORTAO_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .extracting(AccessAttempt::getDenialReason)
                .as("a distincao EXIT_NOT_AUTHORIZED x OUTSIDE_EXIT_WINDOW e exigencia do cliente")
                .isEqualTo(DenialReason.OUTSIDE_EXIT_WINDOW);
    }

    @Test
    @DisplayName("com permissao PERMANENT valida -> SAIDA registrada normalmente")
    void saidaComPermissaoRegistraLog() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping(TestFixtures.IP_PORTAO_SAIDA, "PORT1", AccessAction.SAIDA);
        exitPermissionRepository.save(TestFixtures.permission(TestFixtures.EMPLOYEE_PILOTO,
                ExitPermissionType.PERMANENT, ExitPermissionStatus.ACTIVE));

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), TestFixtures.IP_PORTAO_SAIDA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getPointId()).isEqualTo("PORT1");
                    assertThat(log.getAction()).isEqualTo(AccessAction.SAIDA);
                });
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("ENTRADA no portao nao exige permissao de saida")
    void entradaNoPortaoNaoExigePermissao() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        seedMapping("10.10.0.5", "PORT1", AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.multipartWebhook(
                        TestFixtures.payload("face-75.txt"), "10.10.0.5"))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(1);
        assertThat(accessAttemptRepository.count()).isZero();
    }
}
