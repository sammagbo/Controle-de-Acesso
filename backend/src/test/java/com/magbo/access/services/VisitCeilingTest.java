package com.magbo.access.services;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * O TETO DE DURACAO — um par longo demais e uma SAIDA PERDIDA, nao uma visita.
 *
 * Medido em producao em 12/08/2026 no CDI: 121 ENTRADA contra 70 SAIDA. O
 * leitor facial perde saidas; quando a pessoa REENTRA, a regra JA_PRESENTE
 * (10/08) tira a reentrada do emparelhamento — e o par formado vai da entrada
 * ORIGINAL ate a saida de horas depois. Esse par nao e evidencia de
 * permanencia; e o retrato de uma saida que ninguem registrou.
 *
 * ⚠️ Os numeros (2h de visita, 1h de permanencia continua) sao uma AFIRMACAO
 * SOBRE ESTA ESCOLA, dita por quem dirige o CDI — nao uma lei. Vivem em
 * properties por isso.
 *
 * ⚠️ NADA E APAGADO. O teto exclui da MEDIA; a visita continua contada, a
 * linha continua em access_logs e o Journal continua listando — a mesma
 * assimetria da visita curta e do fechamento automatico.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class VisitCeilingTest {

    private static final String PONTO = "BIBLIO";
    private static final LocalDate DIA = LocalDate.of(2026, 8, 12);

    @Mock private AccessLogRepository accessLogRepository;
    @Mock private UserRepository userRepository;

    private VisitStatsService service;
    private final List<AccessLog> logs = new ArrayList<>();
    private long proximoId = 1;

    @BeforeEach
    void setUp() {
        service = new VisitStatsService(accessLogRepository, userRepository);
        ReflectionTestUtils.setField(service, "minVisitSeconds", 60L);
        ReflectionTestUtils.setField(service, "maxVisitSeconds", 7200L);          // 2h
        ReflectionTestUtils.setField(service, "maxContinuousPresenceSeconds", 3600L); // 1h
        logs.clear();
        when(accessLogRepository.findByPointIdInAndTimestampBetweenOrderByTimestampDesc(
                any(), any(), any())).thenReturn(logs);
    }

    private void evento(String user, AccessAction acao, int h, int m, String flag) {
        logs.add(AccessLog.builder()
                .id(proximoId++).userId(user).pointId(PONTO).action(acao)
                .timestamp(LocalDateTime.of(DIA, LocalTime.of(h, m))).flag(flag).build());
        when(userRepository.findAllById(any())).thenReturn(logs.stream()
                .map(l -> User.builder().id(l.getUserId()).nome(l.getUserId())
                        .tipo(UserType.ALUNO).ativo(true).build())
                .distinct().toList());
    }

    private VisitStatsService.VisitStats stats() {
        return service.stats(List.of(PONTO), DIA.atStartOfDay(), DIA.atTime(23, 59), false);
    }

    @Nested
    @DisplayName("★ o par acima do teto sai da MEDIA, nunca do registro")
    class ForaDaMedia {

        @Test
        @DisplayName("★ o caso real: saida perdida + reentrada JA_PRESENTE -> par de 6h")
        void saidaPerdidaViraParEnorme() {
            // 8:00 entra · [saida das 8:30 PERDIDA pelo leitor] · 10:00 reentra
            // (marcada JA_PRESENTE, logo fora do pareamento) · 14:00 sai.
            // O par formado e 8:00→14:00 = 6 HORAS, que ninguem passou no CDI.
            evento("0001", AccessAction.ENTRADA, 8, 0, null);
            evento("0001", AccessAction.ENTRADA, 10, 0, "JA_PRESENTE");
            evento("0001", AccessAction.SAIDA, 14, 0, null);
            // E um par normal, para a media ter do que ser feita.
            evento("0002", AccessAction.ENTRADA, 9, 0, null);
            evento("0002", AccessAction.SAIDA, 9, 40, null);

            VisitStatsService.VisitStats s = stats();

            assertThat(s.avgDurationMin())
                    .as("sem o teto a media seria (360+40)/2 = 200 min")
                    .isEqualTo(40);
            assertThat(s.implausibleIgnored())
                    .as("e o numero tem de ser DITO, nunca excluido em silencio")
                    .isEqualTo(1);
            assertThat(s.visits())
                    .as("a visita continua CONTADA — ela aconteceu; so a duracao nao e evidencia")
                    .isEqualTo(2);
        }

        @Test
        @DisplayName("★ exatamente no teto ENTRA — a porta e <=, nao <")
        void exatamenteNoTetoEntra() {
            evento("0001", AccessAction.ENTRADA, 8, 0, null);
            evento("0001", AccessAction.SAIDA, 10, 0, null);   // 7200s exatos

            assertThat(stats().avgDurationMin()).isEqualTo(120);
            assertThat(stats().implausibleIgnored()).isZero();
        }

        @Test
        @DisplayName("um segundo acima do teto SAI")
        void umSegundoAcimaSai() {
            logs.add(AccessLog.builder().id(1L).userId("0001").pointId(PONTO)
                    .action(AccessAction.ENTRADA)
                    .timestamp(LocalDateTime.of(DIA, LocalTime.of(8, 0, 0))).build());
            logs.add(AccessLog.builder().id(2L).userId("0001").pointId(PONTO)
                    .action(AccessAction.SAIDA)
                    .timestamp(LocalDateTime.of(DIA, LocalTime.of(10, 0, 1))).build());
            when(userRepository.findAllById(any())).thenReturn(List.of(
                    User.builder().id("0001").nome("A").tipo(UserType.ALUNO).ativo(true).build()));

            assertThat(stats().avgDurationMin()).isNull();
            assertThat(stats().implausibleIgnored()).isEqualTo(1);
        }

        @Test
        @DisplayName("★ so pares implausiveis -> media NULA, e nao zero")
        void soImplausiveisEhNulo() {
            evento("0001", AccessAction.ENTRADA, 8, 0, null);
            evento("0001", AccessAction.SAIDA, 16, 0, null);   // 8h

            assertThat(stats().avgDurationMin())
                    .as("'nao ha duracao confiavel' e NULL — zero seria uma afirmacao")
                    .isNull();
        }
    }

    @Nested
    @DisplayName("permanencia continua: conta, mas e reportada")
    class PermanenciaContinua {

        @Test
        @DisplayName("★ entre 1h e 2h CONTA na media e e somada a parte")
        void entreOsDoisContaESomaAParte() {
            evento("0001", AccessAction.ENTRADA, 8, 0, null);
            evento("0001", AccessAction.SAIDA, 9, 30, null);   // 90 min

            VisitStatsService.VisitStats s = stats();
            assertThat(s.avgDurationMin()).isEqualTo(90);
            assertThat(s.longVisits())
                    .as("acima da permanencia continua que o CDI diz existir")
                    .isEqualTo(1);
            assertThat(s.implausibleIgnored()).isZero();
        }

        @Test
        @DisplayName("visita normal nao entra em nenhum dos dois contadores")
        void visitaNormalNaoContaEmNada() {
            evento("0001", AccessAction.ENTRADA, 8, 0, null);
            evento("0001", AccessAction.SAIDA, 8, 35, null);

            VisitStatsService.VisitStats s = stats();
            assertThat(s.longVisits()).isZero();
            assertThat(s.implausibleIgnored()).isZero();
        }
    }

    @Nested
    @DisplayName("as regras antigas continuam valendo")
    class RegrasAntigas {

        @Test
        @DisplayName("★ fechamento automatico continua fora — e nao vira 'implausivel'")
        void fechamentoAutomaticoContinuaFora() {
            evento("0001", AccessAction.ENTRADA, 8, 0, null);
            evento("0001", AccessAction.SAIDA, 17, 0, "FECHAMENTO_AUTO");

            VisitStatsService.VisitStats s = stats();
            assertThat(s.avgDurationMin()).isNull();
            assertThat(s.implausibleIgnored())
                    .as("ja saiu antes do teto: sao exclusoes de naturezas diferentes")
                    .isZero();
        }

        @Test
        @DisplayName("visita curta continua fora, e o teto nao a conta como implausivel")
        void visitaCurtaContinuaFora() {
            logs.add(AccessLog.builder().id(1L).userId("0001").pointId(PONTO)
                    .action(AccessAction.ENTRADA)
                    .timestamp(LocalDateTime.of(DIA, LocalTime.of(8, 0, 0))).build());
            logs.add(AccessLog.builder().id(2L).userId("0001").pointId(PONTO)
                    .action(AccessAction.SAIDA)
                    .timestamp(LocalDateTime.of(DIA, LocalTime.of(8, 0, 20))).build());
            when(userRepository.findAllById(any())).thenReturn(List.of(
                    User.builder().id("0001").nome("A").tipo(UserType.ALUNO).ativo(true).build()));

            VisitStatsService.VisitStats s = stats();
            assertThat(s.shortVisitsIgnored()).isEqualTo(1);
            assertThat(s.implausibleIgnored()).isZero();
        }
    }
}
