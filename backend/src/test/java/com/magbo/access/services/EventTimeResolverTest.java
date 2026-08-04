package com.magbo.access.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regra de hora do evento, isolada do webhook.
 *
 * A referencia de tempo (recebidoEm) e parametro, entao os dois lados da
 * guarda sao exercitaveis sem mexer no relogio da maquina — inclusive as
 * bordas exatas, que e onde uma guarda costuma estar errada por um segundo.
 */
class EventTimeResolverTest {

    private final EventTimeResolver resolver = new EventTimeResolver();

    private static final String IP = "172.20.40.10";
    private static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    /** Fuso de fabrica dos terminais da escola. */
    private static final ZoneOffset APARELHO = ZoneOffset.ofHours(8);

    /** Meio-dia em Sao Paulo, num dia util qualquer — referencia de recepcao. */
    private static final LocalDateTime RECEBIDO_EM = LocalDateTime.of(2026, 8, 3, 12, 0, 0);

    @Test
    @DisplayName("dateTime com offset -> convertido para America/Sao_Paulo pelo INSTANTE")
    void converteOffsetParaHoraLocalDaEscola() {
        // 21:30 em +08:00 e 10:30 em Sao Paulo (mesmo instante, -11h de diferenca).
        LocalDateTime resolvido = resolver.resolve("2026-08-03T21:30:00+08:00", IP, RECEBIDO_EM);

        assertThat(resolvido)
                .as("o que vale e o instante; copiar os digitos gravaria 21:30")
                .isEqualTo(LocalDateTime.of(2026, 8, 3, 10, 30, 0));
    }

    @Test
    @DisplayName("dateTime em UTC (Z) tambem e aceito")
    void aceitaSufixoZ() {
        assertThat(resolver.resolve("2026-08-03T15:00:00Z", IP, RECEBIDO_EM))
                .isEqualTo(LocalDateTime.of(2026, 8, 3, 12, 0, 0));
    }

    @Test
    @DisplayName("evento atrasado horas (fila offline) -> hora do evento preservada")
    void preservaAHoraDeEventoAtrasado() {
        LocalDateTime ocorreuEm = RECEBIDO_EM.minusHours(6);

        assertThat(resolver.resolve(noAparelho(ocorreuEm), IP, RECEBIDO_EM)).isEqualTo(ocorreuEm);
    }

    // ───────────────── Fallback ─────────────────

    @Test
    @DisplayName("dateTime null ou vazio -> hora de recepcao")
    void semDateTimeUsaRecepcao() {
        assertThat(resolver.resolve(null, IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
        assertThat(resolver.resolve("", IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
        assertThat(resolver.resolve("   ", IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
    }

    @Test
    @DisplayName("dateTime ilegivel -> hora de recepcao")
    void dateTimeIlegivelUsaRecepcao() {
        assertThat(resolver.resolve("03/08/2026 12:00", IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
        assertThat(resolver.resolve("nao e data", IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
        assertThat(resolver.resolve("2026-13-45T99:99:99+08:00", IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
    }

    /**
     * Sem offset nao da para reconstruir o instante. Jogar a hora fora seria
     * pior que a leitura mais proxima da intencao do aparelho — que ja veio na
     * hora local da escola. As guardas continuam valendo para ela.
     */
    @Test
    @DisplayName("dateTime sem offset -> lido como hora local da escola")
    void semOffsetEhLidoComoHoraLocal() {
        assertThat(resolver.resolve("2026-08-03T11:15:00", IP, RECEBIDO_EM))
                .isEqualTo(LocalDateTime.of(2026, 8, 3, 11, 15, 0));
    }

    // ───────────────── Guarda de sanidade ─────────────────

    @Test
    @DisplayName("futuro dentro da folga de 5 min -> aceito (dessincronia normal de relogio)")
    void futuroDentroDaFolgaEhAceito() {
        LocalDateTime quaseAgora = RECEBIDO_EM.plusMinutes(4);

        assertThat(resolver.resolve(noAparelho(quaseAgora), IP, RECEBIDO_EM)).isEqualTo(quaseAgora);
    }

    @Test
    @DisplayName("BORDA: exatamente 5 min no futuro ainda e aceito")
    void bordaDoFuturoEhAceita() {
        LocalDateTime naBorda = RECEBIDO_EM.plus(EventTimeResolver.FOLGA_FUTURO);

        assertThat(resolver.resolve(noAparelho(naBorda), IP, RECEBIDO_EM)).isEqualTo(naBorda);
    }

    @Test
    @DisplayName("futuro alem da folga -> recusado, usa recepcao")
    void futuroAlemDaFolgaEhRecusado() {
        LocalDateTime adiantado = RECEBIDO_EM.plusMinutes(6);

        assertThat(resolver.resolve(noAparelho(adiantado), IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
    }

    @Test
    @DisplayName("passado dentro dos 30 dias -> aceito (fila longa mas plausivel)")
    void passadoDentroDaIdadeMaximaEhAceito() {
        LocalDateTime antigo = RECEBIDO_EM.minusDays(29);

        assertThat(resolver.resolve(noAparelho(antigo), IP, RECEBIDO_EM)).isEqualTo(antigo);
    }

    @Test
    @DisplayName("BORDA: exatamente 30 dias atras ainda e aceito")
    void bordaDoPassadoEhAceita() {
        LocalDateTime naBorda = RECEBIDO_EM.minus(EventTimeResolver.IDADE_MAXIMA);

        assertThat(resolver.resolve(noAparelho(naBorda), IP, RECEBIDO_EM)).isEqualTo(naBorda);
    }

    @Test
    @DisplayName("passado alem de 30 dias -> recusado, usa recepcao")
    void passadoAlemDaIdadeMaximaEhRecusado() {
        LocalDateTime antigoDemais = RECEBIDO_EM.minusDays(31);

        assertThat(resolver.resolve(noAparelho(antigoDemais), IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
    }

    @Test
    @DisplayName("relogio de fabrica (1970) -> recusado, usa recepcao")
    void relogioDeFabricaEhRecusado() {
        assertThat(resolver.resolve("1970-01-01T00:00:00+08:00", IP, RECEBIDO_EM)).isEqualTo(RECEBIDO_EM);
    }

    /** O MESMO instante de `local`, escrito no fuso do aparelho. */
    private static String noAparelho(LocalDateTime local) {
        return local.atZone(SAO_PAULO).withZoneSameInstant(APARELHO)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }
}
