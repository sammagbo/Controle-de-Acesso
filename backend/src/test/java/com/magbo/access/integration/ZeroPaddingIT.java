package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ★ IDs sao String com zeros a esquerda (Pronote, 7 digitos). "0001764" e o
 * cartao real do teste V03. Se em algum ponto do caminho (Jackson, JPA, JS)
 * o ID virar numero, "0001764" colapsa em "1764" e o aluno errado come.
 *
 * Fixture segue a convencao real do projeto: app_users.id ==
 * hikvision_employee_id (CLAUDE.md). O process() grava user.getId() no log —
 * com a convencao, o valor gravado e o proprio ID com zeros.
 */
class ZeroPaddingIT extends AbstractIT {

    @Test
    @DisplayName("★ employeeNoString 0001764 -> access_log.userId == \"0001764\", nunca \"1764\"")
    void zerosAEsquerdaSobrevivemNoAccessLog() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_ZERO_PADDED, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_ZERO_PADDED, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        String payload = TestFixtures.withEmployeeNo(
                TestFixtures.payload("card-1.txt"), TestFixtures.EMPLOYEE_ZERO_PADDED);

        mockMvc.perform(TestFixtures.multipartWebhook(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll())
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getUserId()).isEqualTo("0001764");
                    assertThat(log.getUserId()).isNotEqualTo("1764");
                });
    }

    @Test
    @DisplayName("★ evento NEGADO preserva os zeros no employee_no_raw do attempt")
    void zerosAEsquerdaSobrevivemNoAttempt() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_ZERO_PADDED, null));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        String payload = TestFixtures.withEmployeeNo(
                TestFixtures.payload("denied-8.txt"), TestFixtures.EMPLOYEE_ZERO_PADDED);

        mockMvc.perform(TestFixtures.multipartWebhook(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .satisfies(attempt -> {
                    assertThat(attempt.getEmployeeNoRaw()).isEqualTo("0001764");
                    assertThat(attempt.getUserId())
                            .as("findByHikvisionEmployeeId deve casar com os zeros intactos")
                            .isEqualTo("0001764");
                });
    }

    /**
     * Zeros errados NAO podem casar: se "1764" chegasse do terminal, nao pode
     * resolver para o aluno "0001764" — deve virar UNKNOWN_USER.
     */
    @Test
    @DisplayName("ID sem os zeros NAO casa com o aluno com zeros -> UNKNOWN_USER")
    void idSemZerosNaoCasa() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_ZERO_PADDED, null));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);

        String payload = TestFixtures.withEmployeeNo(TestFixtures.payload("card-1.txt"), "1764");

        mockMvc.perform(TestFixtures.multipartWebhook(payload, TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.findAll())
                .singleElement()
                .extracting(AccessAttempt::getEmployeeNoRaw)
                .isEqualTo("1764");
    }
}
