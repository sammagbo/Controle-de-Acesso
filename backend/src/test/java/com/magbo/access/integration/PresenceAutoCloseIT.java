package com.magbo.access.integration;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.services.PresenceAutoCloseService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FECHAMENTO AUTOMATICO DE PRESENCAS.
 *
 * O CDI fecha as 17:00 e ninguem dorme la dentro, mas a presenca deriva do
 * ULTIMO evento do usuario no ponto: quem entrou e nao passou o rosto na saida
 * fica "dentro" para sempre, e no dia seguinte a tela abre com gente de ontem.
 *
 * Contrato: SAIDA sintetica na hora de fechamento, marcada
 * (flag=FECHAMENTO_AUTO, created_by_user=system) para que auditoria e relatorio
 * consigam separar "saiu" de "foi fechado". Idempotente.
 */
class PresenceAutoCloseIT extends AbstractIT {

    @Autowired
    private PresenceAutoCloseService autoCloseService;

    private static final String CDI = "BIBLIO";
    private static final LocalTime FECHAMENTO = LocalTime.of(17, 0);
    private static final LocalDate ONTEM = LocalDate.now().minusDays(1);

    @Test
    @DisplayName("presenca aberta -> SAIDA sintetica as 17:00, marcada e atribuida ao sistema")
    void presencaAbertaEhFechadaComMarca() {
        entrada("0004048", LocalTime.of(9, 30));

        int fechadas = autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO);

        assertThat(fechadas).isEqualTo(1);
        AccessLog saida = ultimoDe("0004048");
        assertThat(saida.getAction()).isEqualTo(AccessAction.SAIDA);
        assertThat(saida.getTimestamp())
                .as("carimbo e a hora de FECHAMENTO, nao a hora em que o job rodou")
                .isEqualTo(ONTEM.atTime(FECHAMENTO));
        assertThat(saida.getFlag()).isEqualTo(PresenceAutoCloseService.FLAG_FECHAMENTO);
        assertThat(saida.getCreatedByUser())
                .as("nenhum operador humano assina este registro")
                .isEqualTo(PresenceAutoCloseService.AUTOR_SISTEMA);
    }

    /**
     * A garantia que impede o job de inventar passagem: quem JA saiu de verdade
     * nao pode ganhar uma saida sintetica por cima.
     */
    @Test
    @DisplayName("quem ja saiu de verdade nao e fechado de novo")
    void saidaRealNaoEhFechada() {
        entrada("0004048", LocalTime.of(9, 30));
        saida("0004048", LocalTime.of(10, 15));

        int fechadas = autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO);

        assertThat(fechadas).isZero();
        assertThat(accessLogRepository.count()).isEqualTo(2);
        assertThat(ultimoDe("0004048").getFlag())
                .as("a saida real continua sem marca de fechamento")
                .isNull();
    }

    @Test
    @DisplayName("fecha so quem esta aberto, no meio de um dia movimentado")
    void fechaApenasAsPresencasAbertas() {
        entrada("0004048", LocalTime.of(9, 0));                    // aberta
        entrada("0001764", LocalTime.of(9, 5));
        saida("0001764", LocalTime.of(9, 50));                     // fechada de verdade
        entrada("0007777", LocalTime.of(10, 0));                   // aberta
        entrada("0002336", LocalTime.of(10, 5));
        saida("0002336", LocalTime.of(10, 30));
        entrada("0002336", LocalTime.of(14, 0));                   // voltou e ficou: aberta

        int fechadas = autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO);

        assertThat(fechadas).isEqualTo(3);
        assertThat(ultimoDe("0004048").getAction()).isEqualTo(AccessAction.SAIDA);
        assertThat(ultimoDe("0007777").getAction()).isEqualTo(AccessAction.SAIDA);
        assertThat(ultimoDe("0002336").getAction()).isEqualTo(AccessAction.SAIDA);
        assertThat(ultimoDe("0001764").getFlag())
                .as("quem saiu sozinho nao ganhou marca de fechamento")
                .isNull();
    }

    @Test
    @DisplayName("IDEMPOTENTE: rodar duas vezes nao duplica")
    void rodarDuasVezesNaoDuplica() {
        entrada("0004048", LocalTime.of(9, 30));
        entrada("0001764", LocalTime.of(9, 40));

        assertThat(autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO)).isEqualTo(2);
        assertThat(autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO)).isZero();
        assertThat(autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO)).isZero();

        assertThat(accessLogRepository.count())
                .as("2 entradas + 2 fechamentos, e so")
                .isEqualTo(4);
    }

    /**
     * O caso que a via "ultimo evento virou SAIDA" NAO cobre sozinha: alguem
     * entra DEPOIS da hora de fechamento, volta a ser candidato, e sem a guarda
     * de FECHAMENTO_AUTO ja gravado cada execucao seguinte gravaria outra saida
     * das 17:00.
     */
    @Test
    @DisplayName("IDEMPOTENTE mesmo com ENTRADA posterior ao fechamento")
    void entradaDepoisDoFechamentoNaoGeraSegundaSaidaSintetica() {
        entrada("0004048", LocalTime.of(9, 30));
        assertThat(autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO)).isEqualTo(1);

        entrada("0004048", LocalTime.of(17, 30));   // entrou depois do fechamento

        assertThat(autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO))
                .as("ja ha um FECHAMENTO_AUTO deste usuario neste ponto hoje")
                .isZero();
        assertThat(accessLogRepository.findAll())
                .filteredOn(l -> PresenceAutoCloseService.FLAG_FECHAMENTO.equals(l.getFlag()))
                .as("uma unica saida sintetica no dia")
                .hasSize(1);
    }

    /** Fechar o CDI nao pode encerrar presenca de outro espaco. */
    @Test
    @DisplayName("fecha so o ponto pedido")
    void naoTocaEmOutrosPontos() {
        entrada("0004048", LocalTime.of(9, 30));
        accessLogRepository.save(AccessLog.builder()
                .userId("0001764").pointId("REFEI1").action(AccessAction.ENTRADA)
                .timestamp(ONTEM.atTime(LocalTime.of(11, 40))).build());

        autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO);

        assertThat(accessLogRepository.findAll())
                .filteredOn(l -> "REFEI1".equals(l.getPointId()))
                .as("a cantina nao foi tocada")
                .hasSize(1);
    }

    /** Fechar ontem nao pode encerrar quem esta dentro hoje. */
    @Test
    @DisplayName("fecha so o dia pedido")
    void naoTocaEmOutrosDias() {
        entrada("0004048", LocalTime.of(9, 30));
        accessLogRepository.save(AccessLog.builder()
                .userId("0001764").pointId(CDI).action(AccessAction.ENTRADA)
                .timestamp(LocalDate.now().atTime(LocalTime.of(9, 30))).build());

        assertThat(autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO)).isEqualTo(1);
        assertThat(ultimoDe("0001764").getAction())
                .as("quem entrou hoje continua presente")
                .isEqualTo(AccessAction.ENTRADA);
    }

    /**
     * A prova que interessa para a tela: depois do fechamento ninguem consta
     * dentro do CDI.
     *
     * A presenca e conferida aqui pela mesma regra em Java (ultimo evento por
     * usuario) e nao chamando currentOccupancyByPoint, que usa DISTINCT ON e so
     * roda em PostgreSQL — as duas nativas PostgreSQL-only da suite ja estao
     * @Disabled pelo mesmo motivo, com conferencia manual na V13.
     */
    @Test
    @DisplayName("depois do fechamento nao sobra ninguem 'dentro' do CDI")
    void presencaZeraDepoisDoFechamento() {
        entrada("0004048", LocalTime.of(9, 0));
        entrada("0001764", LocalTime.of(9, 5));
        entrada("0007777", LocalTime.of(10, 0));

        assertThat(presentesNoCdi()).isEqualTo(3);
        autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO);
        assertThat(presentesNoCdi())
                .as("ninguem dorme no CDI")
                .isZero();
    }

    @Test
    @DisplayName("ponto sem ninguem aberto -> nada gravado")
    void pontoVazioNaoGravaNada() {
        assertThat(autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO)).isZero();
        assertThat(accessLogRepository.count()).isZero();
    }

    // ───────────────── Helpers ─────────────────

    /** Quantos usuarios tem ENTRADA como ultimo evento do dia no CDI. */
    private long presentesNoCdi() {
        java.util.Map<String, AccessAction> ultimo = new java.util.LinkedHashMap<>();
        accessLogRepository.findByPointIdAndTimestampBetweenOrderByTimestampAsc(
                        CDI, ONTEM.atStartOfDay(), ONTEM.atTime(LocalTime.MAX))
                .forEach(l -> ultimo.put(l.getUserId(), l.getAction()));
        return ultimo.values().stream().filter(a -> a == AccessAction.ENTRADA).count();
    }

    private AccessLog ultimoDe(String userId) {
        return accessLogRepository.findAll().stream()
                .filter(l -> userId.equals(l.getUserId()))
                .max(java.util.Comparator.comparing(AccessLog::getTimestamp)
                        .thenComparing(AccessLog::getId))
                .orElseThrow();
    }

    // (sem helpers de payload: este job nao passa pelo webhook)

    private void entrada(String userId, LocalTime hora) {
        movimento(userId, AccessAction.ENTRADA, hora);
    }

    private void saida(String userId, LocalTime hora) {
        movimento(userId, AccessAction.SAIDA, hora);
    }

    private void movimento(String userId, AccessAction action, LocalTime hora) {
        accessLogRepository.save(AccessLog.builder()
                .userId(userId)
                .pointId(CDI)
                .action(action)
                .timestamp(LocalDateTime.of(ONTEM, hora))
                .build());
    }

}
