package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MESMA PASSAGEM — leitura repetida da mesma face em segundos.
 *
 * Producao 03/08/2026: mesmo aluno, ENTRADA as 10:06:50 e de novo as 10:06:51.
 * Duas linhas em access_logs para UMA passagem fisica. Nao e reentrega de
 * pacote — os dois eventos tem serialNo diferente, e o dedup de ingestao os
 * deixa passar corretamente; o que se repetiu foi o reconhecimento.
 *
 * Janela: magbo.same-passage-window-seconds (30s no perfil test, como em prod).
 * Chave: pessoa + ponto + ACAO — ENTRADA seguida de SAIDA continua valendo.
 */
class SamePassageIT extends AbstractIT {

    /** Hora do evento controlada pelo teste: a janela e medida sobre ela. */
    private static LocalDateTime instante() {
        return LocalDateTime.now().minusHours(1).truncatedTo(ChronoUnit.SECONDS);
    }

    @Test
    @DisplayName("duas leituras a 1s -> 1 access_log (o caso de 03/08)")
    void leituraRepetidaEmUmSegundoGravaUmaVez() throws Exception {
        alunoAutorizadoNaCantina();
        LocalDateTime primeira = instante();

        passagem(primeira, TestFixtures.IP_CANTINA_ENTRADA);
        passagem(primeira.plusSeconds(1), TestFixtures.IP_CANTINA_ENTRADA);

        assertThat(accessLogRepository.count())
                .as("uma passagem fisica, uma linha")
                .isEqualTo(1);
        assertThat(accessLogRepository.findAll().get(0).getTimestamp())
                .as("a linha que fica e a PRIMEIRA — a segunda e que foi descartada")
                .isEqualTo(primeira);
    }

    @Test
    @DisplayName("BORDA: 29s ainda e a mesma passagem; 31s ja e passagem nova")
    void bordaDaJanela() throws Exception {
        alunoAutorizadoNaCantina();
        LocalDateTime primeira = instante();

        passagem(primeira, TestFixtures.IP_CANTINA_ENTRADA);
        passagem(primeira.plusSeconds(29), TestFixtures.IP_CANTINA_ENTRADA);
        assertThat(accessLogRepository.count())
                .as("29s < 30s: mesma passagem")
                .isEqualTo(1);

        passagem(primeira.plusSeconds(31), TestFixtures.IP_CANTINA_ENTRADA);
        assertThat(accessLogRepository.count())
                .as("31s > 30s: passagem nova, tem que ser gravada")
                .isEqualTo(2);
    }

    /**
     * A garantia que impede a regra de virar perda de dado: a janela e por
     * ACAO. Quem entra e sai no mesmo minuto fez duas coisas diferentes.
     */
    @Test
    @DisplayName("ENTRADA seguida de SAIDA dentro da janela -> as DUAS ficam")
    void acaoDiferenteDentroDaJanelaContinuaValendo() throws Exception {
        alunoAutorizadoNaCantina();
        seedMapping(TestFixtures.IP_CANTINA_SAIDA, "REFEI1", AccessAction.SAIDA);
        LocalDateTime entrada = instante();

        passagem(entrada, TestFixtures.IP_CANTINA_ENTRADA);
        passagem(entrada.plusSeconds(2), TestFixtures.IP_CANTINA_SAIDA);

        assertThat(accessLogRepository.count())
                .as("entrar e sair nao e leitura repetida")
                .isEqualTo(2);
        assertThat(accessLogRepository.findAll())
                .extracting(l -> l.getAction())
                .containsExactlyInAnyOrder(AccessAction.ENTRADA, AccessAction.SAIDA);
    }

    /** Pontos diferentes tambem sao passagens diferentes. */
    @Test
    @DisplayName("mesma acao em PONTOS diferentes dentro da janela -> as duas ficam")
    void pontoDiferenteDentroDaJanelaContinuaValendo() throws Exception {
        alunoAutorizadoNaCantina();
        seedMapping(TestFixtures.IP_BIBLIO, "BIBLIO", AccessAction.ENTRADA);
        LocalDateTime quando = instante();

        passagem(quando, TestFixtures.IP_CANTINA_ENTRADA);
        passagem(quando.plusSeconds(2), TestFixtures.IP_BIBLIO);

        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    /** Pessoas diferentes na fila do refeitorio nao podem se suprimir. */
    @Test
    @DisplayName("PESSOAS diferentes no mesmo ponto e segundo -> as duas ficam")
    void pessoaDiferenteDentroDaJanelaContinuaValendo() throws Exception {
        alunoAutorizadoNaCantina();
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_ZERO_PADDED, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_ZERO_PADDED, EntitlementStatus.AUTHORIZED));
        LocalDateTime quando = instante();

        passagem(quando, TestFixtures.IP_CANTINA_ENTRADA);
        mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                        faceDe(TestFixtures.EMPLOYEE_ZERO_PADDED, quando.plusSeconds(1)),
                        TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("a leitura repetida responde 200 — o aparelho nao pode entrar em retry")
    void leituraRepetidaResponde200() throws Exception {
        alunoAutorizadoNaCantina();
        LocalDateTime primeira = instante();

        passagem(primeira, TestFixtures.IP_CANTINA_ENTRADA);
        mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                        faceDe(TestFixtures.EMPLOYEE_PILOTO, primeira.plusSeconds(1)),
                        TestFixtures.IP_CANTINA_ENTRADA))
                .andExpect(status().isOk());
    }

    // ───────────────── Lado das negadas ─────────────────

    /**
     * Mesma regra em access_attempts: rosto que o terminal aprova e o MAGBO
     * nao reconhece, lido duas vezes, gerava duas negadas iguais — inflando
     * `negadasHoje` e o feed do operador com um unico fato.
     */
    @Test
    @DisplayName("negada repetida dentro da janela -> 1 access_attempt")
    void negadaRepetidaGravaUmaVez() throws Exception {
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);
        LocalDateTime primeira = instante();

        // Sem cadastro em app_users -> UNKNOWN_USER, e userId fica null:
        // a chave da supressao precisa ser o employeeNoRaw.
        passagem(primeira, TestFixtures.IP_CANTINA_ENTRADA);
        passagem(primeira.plusSeconds(1), TestFixtures.IP_CANTINA_ENTRADA);

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count())
                .as("uma leitura repetida, uma negada")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("negada fora da janela -> 2 access_attempts")
    void negadaForaDaJanelaGravaDuasVezes() throws Exception {
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);
        LocalDateTime primeira = instante();

        passagem(primeira, TestFixtures.IP_CANTINA_ENTRADA);
        passagem(primeira.plusSeconds(31), TestFixtures.IP_CANTINA_ENTRADA);

        assertThat(accessAttemptRepository.count()).isEqualTo(2);
    }

    // ───────────────── Helpers ─────────────────

    /** Uma passagem de face do aluno piloto, na hora dada, pelo IP dado. */
    private void passagem(LocalDateTime quando, String ip) throws Exception {
        mockMvc.perform(TestFixtures.multipartWebhookVerbatim(
                        faceDe(TestFixtures.EMPLOYEE_PILOTO, quando), ip))
                .andExpect(status().isOk());
    }

    /**
     * Payload real de face com matricula e hora escolhidas. serialNo NOVO a
     * cada chamada de proposito: sao eventos distintos do aparelho, e e por
     * isso que o dedup de INGESTAO nao pega — se pegasse, este teste estaria
     * provando a regra errada.
     */
    private static String faceDe(String employeeNo, LocalDateTime quando) {
        return TestFixtures.withSerialNo(
                TestFixtures.withDateTime(
                        TestFixtures.withEmployeeNo(TestFixtures.payload("face-75.txt"), employeeNo),
                        TestFixtures.noFusoDoAparelho(quando)),
                TestFixtures.nextSerialNo());
    }

    private void alunoAutorizadoNaCantina() {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                TestFixtures.EMPLOYEE_PILOTO, EntitlementStatus.AUTHORIZED));
        seedMapping(TestFixtures.IP_CANTINA_ENTRADA, "REFEI1", AccessAction.ENTRADA);
    }
}
