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

    @Autowired
    private com.magbo.access.config.PresenceAutoCloseProperties autoCloseProperties;

    private static final String CDI = "BIBLIO";
    private static final LocalTime FECHAMENTO = LocalTime.of(17, 0);
    private static final LocalDate ONTEM = LocalDate.now().minusDays(1);

    /** Cantina — preparada, inerte enquanto REFEI1 nao tiver movimento. */
    private static final String CANTINA = "REFEI1";
    private static final LocalTime FECHAMENTO_CANTINA = LocalTime.of(15, 0);

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

    // ───────────────── Cantina (preparado, inerte ate o piloto) ─────────────────

    /**
     * A cantina tem exatamente o mesmo problema do CDI — presenca derivada do
     * ULTIMO evento —, so que ainda nao esta no ar. A entrada no mapa de
     * fechamento e uma preparacao: enquanto REFEI1 nao tiver movimento, o job
     * nao encontra candidato e nao grava nada.
     *
     * Estes testes existem para que a preparacao nao chegue ao dia 1 sem nunca
     * ter sido exercitada. O mecanismo e o mesmo do CDI; o que se prova aqui e
     * que a CONFIGURACAO esta de pe e que o ponto certo e fechado na hora certa.
     */
    @Test
    @DisplayName("REFEI1 esta no mapa de fechamento, as 15:00")
    void cantinaEstaConfigurada() {
        assertThat(autoCloseProperties.parsedTimes())
                .as("sem esta chave, o dia 1 do piloto abre com gente de ontem 'dentro' da cantina")
                .containsEntry(CANTINA, FECHAMENTO_CANTINA)
                .containsEntry(CDI, FECHAMENTO);
    }

    @Test
    @DisplayName("cantina: presenca aberta -> SAIDA sintetica as 15:00, marcada")
    void cantinaFechaPresencaAberta() {
        accessLogRepository.save(AccessLog.builder()
                .userId("0004048").pointId(CANTINA).action(AccessAction.ENTRADA)
                .timestamp(ONTEM.atTime(LocalTime.of(12, 10))).build());

        int fechadas = autoCloseService.closePoint(CANTINA, ONTEM, FECHAMENTO_CANTINA);

        assertThat(fechadas).isEqualTo(1);
        AccessLog saida = ultimoDe("0004048");
        assertThat(saida.getPointId()).isEqualTo(CANTINA);
        assertThat(saida.getAction()).isEqualTo(AccessAction.SAIDA);
        assertThat(saida.getTimestamp()).isEqualTo(ONTEM.atTime(FECHAMENTO_CANTINA));
        assertThat(saida.getFlag()).isEqualTo(PresenceAutoCloseService.FLAG_FECHAMENTO);
        assertThat(saida.getCreatedByUser()).isEqualTo(PresenceAutoCloseService.AUTOR_SISTEMA);
    }

    @Test
    @DisplayName("cantina sem movimento -> nada gravado (o estado de hoje)")
    void cantinaSemMovimentoNaoGravaNada() {
        assertThat(autoCloseService.closePoint(CANTINA, ONTEM, FECHAMENTO_CANTINA)).isZero();
        assertThat(accessLogRepository.count()).isZero();
    }

    /** Fechar a cantina nao pode encerrar quem esta no CDI, e vice-versa. */
    @Test
    @DisplayName("cantina e CDI fecham em horas diferentes, sem se atrapalhar")
    void cantinaECdiSaoIndependentes() {
        accessLogRepository.save(AccessLog.builder()
                .userId("0001764").pointId(CANTINA).action(AccessAction.ENTRADA)
                .timestamp(ONTEM.atTime(LocalTime.of(12, 10))).build());
        entrada("0004048", LocalTime.of(9, 30));   // CDI

        autoCloseService.closePoint(CANTINA, ONTEM, FECHAMENTO_CANTINA);

        assertThat(ultimoDe("0001764").getTimestamp()).isEqualTo(ONTEM.atTime(FECHAMENTO_CANTINA));
        assertThat(ultimoDe("0004048").getAction())
                .as("quem esta no CDI so fecha as 17:00")
                .isEqualTo(AccessAction.ENTRADA);

        autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO);
        assertThat(ultimoDe("0004048").getTimestamp()).isEqualTo(ONTEM.atTime(FECHAMENTO));
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


    // ─────────────────────────────────────────────────────────────
    // A PREVISAO — ver antes de fechar
    // ─────────────────────────────────────────────────────────────

    /**
     * ★★★ PREVER NAO PODE FECHAR.
     *
     * A tela existe para a Vie Scolaire olhar as 16h40 e ainda dar tempo de ir
     * ao CDI. Uma tela de conferencia que grava o que conferiu nao e' uma tela
     * de conferencia: bastaria alguem abri-la para que as SAIDAs sinteticas
     * fossem carimbadas ANTES da hora, e a crianca constaria como tendo saido
     * as 17:00 num momento em que ela estava sentada la' dentro.
     *
     * Ate 15/08/2026 nao havia como nem perguntar: o calculo so' existia dentro
     * do metodo que gravava.
     */
    @Test
    @DisplayName("★★★ candidatos() NAO grava nada — a previsao e' leitura pura")
    void previsaoNaoFecha() {
        entrada("0004048", LocalTime.of(14, 0));
        long antes = accessLogRepository.count();

        var previstos = autoCloseService.candidatos(CDI, ONTEM);

        assertThat(previstos)
                .as("a pessoa esta' aberta e apareceria na tela")
                .hasSize(1);
        assertThat(accessLogRepository.count())
                .as("e NADA foi gravado por ter perguntado")
                .isEqualTo(antes);
        assertThat(accessLogRepository.findAll())
                .as("nenhuma SAIDA de fechamento existe ainda")
                .noneMatch(l -> PresenceAutoCloseService.FLAG_FECHAMENTO.equals(l.getFlag()));
    }

    /**
     * ★★★ A PREVISAO E' A MESMA LISTA QUE O FECHAMENTO USA.
     *
     * Se a tela dissesse "quatro" e o fechamento gravasse tres, a tela seria
     * pior do que nao existir — ela estaria nomeando alguem que nao vai ser
     * fechado, e a Vie Scolaire iria procurar uma pessoa a toa. E' por isso que
     * `closePoint` chama `candidatos` em vez de repetir o criterio: nao ha um
     * segundo criterio, escrito noutro lugar, que possa divergir.
     */
    @Test
    @DisplayName("★★★ o que a previsao mostra e' EXATAMENTE o que o fechamento grava")
    void previsaoBateComOFechamento() {
        entrada("0004048", LocalTime.of(14, 0));
        entrada("0004049", LocalTime.of(14, 5));
        // O segundo saiu de verdade: nao aparece na previsao nem e' fechado.
        saida("0004049", LocalTime.of(15, 0));

        int previstos = autoCloseService.candidatos(CDI, ONTEM).size();
        int fechados = autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO);

        assertThat(previstos).as("so o primeiro ficou aberto").isEqualTo(1);
        assertThat(fechados)
                .as("a previsao prometeu %d e o fechamento gravou %d", previstos, fechados)
                .isEqualTo(previstos);
    }

    /**
     * ★★ Depois do fechamento a previsao esvazia — e o "ja' fechados" responde.
     *
     * Sem a segunda metade, a tela diria "ninguem" as 17h05 para um dia em que
     * quatro pessoas foram fechadas. A pergunta "quem fechamos hoje?" continua
     * valendo no dia seguinte, quando alguem for conferir.
     */
    @Test
    @DisplayName("★★ depois de fechar: previsao vazia, e a lista do que foi fechado responde")
    void depoisDeFecharAsDuasMetades() {
        entrada("0004048", LocalTime.of(14, 0));
        autoCloseService.closePoint(CDI, ONTEM, FECHAMENTO);

        assertThat(autoCloseService.candidatos(CDI, ONTEM))
                .as("ninguem mais para fechar — a idempotencia ja' garantia isto")
                .isEmpty();
        assertThat(autoCloseService.jaFechadas(CDI, ONTEM))
                .as("mas a tela ainda sabe dizer QUEM foi fechado")
                .hasSize(1);
    }
}
