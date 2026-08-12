package com.magbo.access.integration;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AS DUAS REGRAS DA PERMANENCIA MEDIA (12/08/2026) — a "Durée moyenne" do
 * Rapport General crescia de hoje para semana para mes.
 *
 * Mecanismo, provado em Postgres real antes da correcao: a SAIDA sintetica
 * das 17:00 (FECHAMENTO_AUTO) formava par ENTRADA→17:00 de dia inteiro, e
 * "hoje" antes das 17h ainda nao tem fechamentos — cada dia COMPLETO da
 * janela carregava os seus. O mesmo padrao de visitas media 35 min como
 * "hoje" e 203 min como dia completo.
 *
 * ⚠️ A QUEDA VISIVEL das medias de semana/mes em 12/08/2026 e DELIBERADA —
 * ver docs/frontend-smoke-checklist.md. Este arquivo e o contrato das duas
 * regras: fechamento automatico nao e saida, passagem rapida nao e
 * permanencia — as MESMAS reguas que o Rapport do CDI ja aplicava.
 */
class AvgStayRulesIT extends AbstractIT {

    private static final LocalDate DIA = LocalDate.now().minusDays(1);

    private void evento(String user, String action, int hora, int min, String flag) {
        accessLogRepository.save(AccessLog.builder()
                .userId(user).pointId("REFEI1")
                .action(AccessAction.valueOf(action))
                .timestamp(LocalDateTime.of(DIA, java.time.LocalTime.of(hora, min)))
                .flag(flag)
                .build());
    }

    private Double media() {
        return accessLogRepository.avgStayMinutesByPoints(
                DIA.atStartOfDay(), DIA.atTime(23, 59), List.of("REFEI1"), 60, 7200);
    }

    @Test
    @DisplayName("★ o par do FECHAMENTO_AUTO fica FORA da media — era ele que a inflava")
    void fechamentoAutoForaDaMedia() {
        evento("A", "ENTRADA", 12, 0, null);
        evento("A", "SAIDA", 12, 30, null);            // 30 min reais
        evento("B", "ENTRADA", 12, 0, null);
        evento("B", "SAIDA", 12, 40, null);            // 40 min reais
        evento("C", "ENTRADA", 8, 0, null);
        evento("C", "SAIDA", 17, 0, "FECHAMENTO_AUTO"); // 540 min SINTETICOS

        assertThat(media())
                .as("com o auto-close dentro, o cenario dava (30+40+540)/3 = 203")
                .isBetween(34.0, 36.0);
    }

    @Test
    @DisplayName("★ passagem rapida (< piso de 60s) nao e permanencia — mesma regua do CDI")
    void passagemRapidaForaDaMedia() {
        evento("A", "ENTRADA", 12, 0, null);
        evento("A", "SAIDA", 12, 30, null);            // 30 min
        // Recado de 30 segundos: entra, fala, sai.
        accessLogRepository.save(AccessLog.builder()
                .userId("R").pointId("REFEI1").action(AccessAction.ENTRADA)
                .timestamp(LocalDateTime.of(DIA, java.time.LocalTime.of(12, 0, 0))).build());
        accessLogRepository.save(AccessLog.builder()
                .userId("R").pointId("REFEI1").action(AccessAction.SAIDA)
                .timestamp(LocalDateTime.of(DIA, java.time.LocalTime.of(12, 0, 30))).build());

        assertThat(media())
                .as("sem o piso, o recado de 30s puxaria a media para (30+0.5)/2 = 15")
                .isBetween(29.0, 31.0);
    }

    @Test
    @DisplayName("★ saida REAL depois do fechamento: o par volta a ser ENTRADA→saida real")
    void saidaRealDepoisDoFechamento() {
        // A pessoa ficou ate 17:05 e badgeou a saida; o fechamento das 17:00
        // ja tinha rodado. Tirando o sintetico do WINDOW (e nao so do
        // resultado), o LAG pareia a ENTRADA com a saida REAL — que e o que
        // aconteceu: 8:00→17:05.
        evento("A", "ENTRADA", 8, 0, null);
        evento("A", "SAIDA", 17, 0, "FECHAMENTO_AUTO");
        evento("A", "SAIDA", 17, 5, null);

        // 8:00→17:05 = 545 min, ACIMA do teto de 2h: com o teto em vigor
        // (12/08/2026) este par sai da media — 9 horas no refeitorio nao e
        // permanencia, e saida perdida. O que o teste continua provando e o
        // PAREAMENTO: sem tirar o sintetico do WINDOW, o par seria
        // ENTRADA→17:00 e o de 17:05 ficaria orfao.
        assertThat(media())
                .as("545 min > teto de 7200s -> fora da media")
                .isNull();
    }

    @Test
    @DisplayName("so visitas abertas ou sinteticas -> media NULA, nao zero")
    void soAbertasEhNulo() {
        evento("A", "ENTRADA", 8, 0, null);                 // aberta
        evento("B", "ENTRADA", 9, 0, null);
        evento("B", "SAIDA", 17, 0, "FECHAMENTO_AUTO");     // sintetica

        assertThat(media())
                .as("'nao ha duracao conhecida' e NULL — zero seria uma afirmacao")
                .isNull();
    }
}
