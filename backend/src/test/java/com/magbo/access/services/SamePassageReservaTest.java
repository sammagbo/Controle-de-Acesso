package com.magbo.access.services;

import com.magbo.access.models.AccessAction;
import com.magbo.access.repositories.AccessAttemptRepository;
import com.magbo.access.repositories.AccessLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A RESERVA — a metade da regra de mesma passagem que o banco nao pode dar.
 *
 * ⚠️ O QUE ESTE ARQUIVO EXISTE PARA PROVAR, e a cantina pagou por ele em
 * 24/08/2026: consultar o banco antes de gravar NAO impede duas transacoes
 * concorrentes de gravarem a mesma passagem. `process()` e @Transactional; a
 * segunda requisicao consulta ANTES de a primeira commitar, as duas leem "nao
 * existe", as duas gravam.
 *
 * Medido em producao — quatro aparelhos num ponto so, dois deles a ver a mesma
 * pessoa:
 *     09:02:42,317  FUNC-042  REFEI1 SAIDA  (.13)
 *     09:02:42,538  FUNC-042  REFEI1 SAIDA  (.14)   +221 ms
 *     09:04:29,589  FUNC-001  REFEI1 SAIDA  (.14)
 *     09:04:29,974  FUNC-001  REFEI1 SAIDA  (.13)   +385 ms
 * As duas linhas de cada par ficaram gravadas com O MESMO instante de evento,
 * dentro da janela. A regra estava certa; a corrida e que nao estava fechada.
 *
 * Reproduzido em rajada local antes da correcao: 25 pessoas lidas por dois
 * aparelhos ao mesmo tempo -> 7, depois 1, depois 0 duplicadas. Intermitente,
 * como toda corrida. Depois: 125 pessoas, 125 linhas, ZERO duplicadas.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SamePassageService.alreadyClaimed — fechar a corrida sem inventar janela")
class SamePassageReservaTest {

    @Mock private AccessLogRepository accessLogRepository;
    @Mock private AccessAttemptRepository accessAttemptRepository;

    private SamePassageService service;
    private static final LocalDateTime QUANDO = LocalDateTime.of(2026, 8, 24, 9, 4, 28);

    @BeforeEach
    void setUp() {
        service = new SamePassageService(accessLogRepository, accessAttemptRepository);
        ReflectionTestUtils.setField(service, "windowSeconds", 30L);
    }

    @Test
    @DisplayName("★★★ 24 threads reclamam a MESMA passagem: exatamente UMA passa")
    void apenasUmaReservaVence() throws Exception {
        // Esta e a asercao que a consulta ao banco nao consegue fazer. Se
        // `alreadyClaimed` usasse containsKey+put em vez de compute, este teste
        // falharia de vez em quando — que e exatamente como o defeito se
        // comportou em producao.
        final int N = 24;
        ExecutorService pool = Executors.newFixedThreadPool(N);
        CountDownLatch largada = new CountDownLatch(1);
        AtomicInteger venceram = new AtomicInteger();

        for (int i = 0; i < N; i++) {
            pool.submit(() -> {
                try {
                    largada.await();
                    if (!service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                            "FUNC-001", "REFEI1", AccessAction.SAIDA, QUANDO)) {
                        venceram.incrementAndGet();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
        }
        largada.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(10, TimeUnit.SECONDS)).isTrue();

        assertThat(venceram.get())
                .as("uma passagem fisica, uma linha — mesmo com 24 leitores a gritar ao mesmo tempo")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("★★★ a FILA OFFLINE nao e engolida: mesmos dados, horas de evento diferentes")
    void filaOfflineNaoEEngolida() {
        // Incidente de 03/08/2026: um aparelho esvaziou 33 eventos de uma vez.
        // Mesma pessoa, mesmo ponto, mesma acao, todos chegando no mesmo
        // segundo de RELOGIO, mas com horas de EVENTO separadas por horas.
        // Uma reserva por chave com TTL de relogio de parede teria apagado 32
        // passagens reais — por isso a reserva guarda o instante do EVENTO.
        int aceites = 0;
        for (int h = 8; h < 18; h++) {
            if (!service.alreadyClaimed(SamePassageService.Escopo.ACESSO, "0001234", "PORT1",
                    AccessAction.ENTRADA, LocalDateTime.of(2026, 8, 3, h, 0, 0))) {
                aceites++;
            }
        }
        assertThat(aceites)
                .as("dez horas diferentes sao dez passagens diferentes")
                .isEqualTo(10);
    }

    @Test
    @DisplayName("★★ dentro da janela repete; fora da janela passa")
    void janelaValeParaOsDoisLados() {
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "BIBLIO", AccessAction.ENTRADA, QUANDO)).isFalse();

        // +29 s: mesma passagem
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "BIBLIO", AccessAction.ENTRADA, QUANDO.plusSeconds(29))).isTrue();
        // −29 s: idem, a janela fecha dos DOIS lados (fila fora de ordem)
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "BIBLIO", AccessAction.ENTRADA, QUANDO.minusSeconds(29))).isTrue();
        // +31 s: passagem nova
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "BIBLIO", AccessAction.ENTRADA, QUANDO.plusSeconds(31))).isFalse();
    }

    @Test
    @DisplayName("★★★ uma NEGADA nao reserva o lugar de um ACESSO aceite")
    void escoposNaoSeMisturam() {
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.TENTATIVA,
                "FUNC-001", "REFEI1", AccessAction.ENTRADA, QUANDO)).isFalse();
        // Mesma pessoa, mesmo ponto, mesma acao, mesmo instante — mas e a outra
        // lista. Com uma chave unica, a linha que CONTA seria a descartada.
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "FUNC-001", "REFEI1", AccessAction.ENTRADA, QUANDO)).isFalse();
    }

    @Test
    @DisplayName("★★ ENTRADA e SAIDA no mesmo segundo continuam a ser duas coisas")
    void acaoFazParteDaChave() {
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "REFEI1", AccessAction.ENTRADA, QUANDO)).isFalse();
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "REFEI1", AccessAction.SAIDA, QUANDO))
                .as("entrou e saiu e uma pessoa, nao uma leitura repetida")
                .isFalse();
    }

    @Test
    @DisplayName("★★ pessoas diferentes no mesmo ponto e instante nao se estorvam")
    void pessoasDiferentesNaoSeEstorvam() {
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "REFEI1", AccessAction.SAIDA, QUANDO)).isFalse();
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0002", "REFEI1", AccessAction.SAIDA, QUANDO)).isFalse();
    }

    @Test
    @DisplayName("★ chave incompleta NUNCA descarta — nao se arrisca perder passagem")
    void chaveIncompletaDeixaPassar() {
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                null, "REFEI1", AccessAction.SAIDA, QUANDO)).isFalse();
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "  ", "REFEI1", AccessAction.SAIDA, QUANDO)).isFalse();
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", null, AccessAction.SAIDA, QUANDO)).isFalse();
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "REFEI1", null, QUANDO)).isFalse();
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "REFEI1", AccessAction.SAIDA, null)).isFalse();
    }

    @Test
    @DisplayName("★ o kill-switch (janela <= 0) desliga tambem a reserva")
    void killSwitchDesligaAReserva() {
        ReflectionTestUtils.setField(service, "windowSeconds", 0L);
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "REFEI1", AccessAction.SAIDA, QUANDO)).isFalse();
        assertThat(service.alreadyClaimed(SamePassageService.Escopo.ACESSO,
                "0001", "REFEI1", AccessAction.SAIDA, QUANDO))
                .as("com a regra desligada, nada e descartado")
                .isFalse();
    }
}
