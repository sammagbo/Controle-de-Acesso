package com.magbo.access.integration;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ★ BLINDAGEM LEGADA — prova que registros ANTIGOS continuam validos.
 *
 * Antes das Fases A-H, access_logs nao tinha auth_method nem
 * hikvision_sub_event_type. Toda a base real (validada com hardware ao longo
 * de 4 dias) tem essas colunas NULL. Este IT insere logs "historicos" com
 * esses campos nulos e roda TODAS as queries do AccessLogRepository: nenhuma
 * pode quebrar por causa dos nulos, e os resultados tem que fazer sentido.
 *
 * DUAS queries usam sintaxe exclusiva do PostgreSQL que o H2 (mesmo em
 * MODE=PostgreSQL) nao suporta. Elas estao @Disabled com o construto exato
 * nomeado, e escalam para a bateria de hardware (spec 13.5, V12/V13) como
 * conferencia manual OBRIGATORIA. As queries de PRODUCAO NAO foram alteradas.
 *
 * As outras 10 nativas rodam em H2 e sao exercitadas aqui — incluindo a
 * countByHour, que so passa gracas ao NON_KEYWORDS=HOUR na URL de teste.
 */
class LegacyRegressionIT extends AbstractIT {

    private static final LocalDate ONTEM = LocalDate.now().minusDays(1);
    private LocalDateTime janelaDe;
    private LocalDateTime janelaAte;

    @BeforeEach
    void semearLogsHistoricos() {
        janelaDe = ONTEM.atStartOfDay();
        janelaAte = LocalDateTime.now().plusMinutes(1);

        // Aluno A: entrou e saiu da cantina (par completo, ~40 min)
        legado("0000001", "REFEI1", AccessAction.ENTRADA, ONTEM.atTime(11, 0));
        legado("0000001", "REFEI1", AccessAction.SAIDA,   ONTEM.atTime(11, 40));

        // Aluno B: entrou na enfermaria e ficou > 30 min (sejour prolonge)
        legado("0000002", "ENFERM", AccessAction.ENTRADA, ONTEM.atTime(9, 0));
        legado("0000002", "ENFERM", AccessAction.SAIDA,   ONTEM.atTime(10, 15));

        // Aluno C: entrou pelo portao e nao saiu (presente / ativo)
        legado("0000003", "PORT1", AccessAction.ENTRADA, LocalDateTime.now().minusHours(2));

        // Aluno D: entrada na cantina fora de horario (flag), sem saida
        AccessLog foraHorario = legadoBuild("0000004", "REFEI1", AccessAction.ENTRADA, ONTEM.atTime(16, 0));
        foraHorario.setFlag("FORA_HORARIO");
        accessLogRepository.save(foraHorario);
    }

    /** Log no formato PRE-Fase-A: auth_method e hikvision_sub_event_type NULOS. */
    private void legado(String userId, String pointId, AccessAction action, LocalDateTime ts) {
        accessLogRepository.save(legadoBuild(userId, pointId, action, ts));
    }

    private AccessLog legadoBuild(String userId, String pointId, AccessAction action, LocalDateTime ts) {
        return AccessLog.builder()
                .userId(userId)
                .pointId(pointId)
                .action(action)
                .timestamp(ts)
                .authMethod(null)               // <- registro legado
                .hikvisionSubEventType(null)    // <- registro legado
                .build();
    }

    // ─────────────── Derivadas / JPQL (todas portaveis) ───────────────

    @Test
    @DisplayName("queries derivadas e JPQL rodam sobre logs legados sem excecao")
    void derivadasEJpqlSobreLegado() {
        assertThat(accessLogRepository.count()).isEqualTo(6);

        assertThat(accessLogRepository.countByTimestampGreaterThanEqual(janelaDe)).isEqualTo(6);
        assertThat(accessLogRepository.countBlockedSince(janelaDe))
                .as("so o aluno D tem flag")
                .isEqualTo(1);
        assertThat(accessLogRepository.countActiveUsersSince(janelaDe))
                .as("A e B sairam; C (portao) e D (cantina) entraram sem sair -> 2 ativos")
                .isEqualTo(2);

        assertThat(accessLogRepository.findFilteredLogs(
                janelaDe, janelaAte, null, null, PageRequest.of(0, 100)))
                .isNotEmpty();
        assertThat(accessLogRepository.findFilteredLogs(
                janelaDe, janelaAte, "REFEI1", AccessAction.ENTRADA, PageRequest.of(0, 100)))
                .allSatisfy(l -> {
                    assertThat(l.getPointId()).isEqualTo("REFEI1");
                    assertThat(l.getAction()).isEqualTo(AccessAction.ENTRADA);
                });

        assertThat(accessLogRepository.findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(
                "0000001", "REFEI1", AccessAction.ENTRADA))
                .isPresent()
                .get()
                .satisfies(l -> assertThat(l.getAuthMethod()).as("campo legado permanece null").isNull());

        assertThat(accessLogRepository.findAllByOrderByTimestampDesc(PageRequest.of(0, 100)))
                .hasSize(6);
        assertThat(accessLogRepository.findByPointIdInAndTimestampBetweenOrderByTimestampDesc(
                List.of("REFEI1", "ENFERM"), janelaDe, janelaAte)).isNotEmpty();
    }

    // ─────────────── Nativas que RODAM em H2 ───────────────

    @Test
    @DisplayName("nativas portaveis (COUNT/DISTINCT/FILTER/EXTRACT EPOCH/LAG) rodam em H2")
    void nativasPortaveisSobreLegado() {
        assertThat(accessLogRepository.countMovements(janelaDe, janelaAte)).isEqualTo(6);
        assertThat(accessLogRepository.countMovementsInternal(janelaDe, janelaAte))
                .as("exclui PORT*: fica sem a entrada do aluno C")
                .isEqualTo(5);
        assertThat(accessLogRepository.countUniqueStudents(janelaDe, janelaAte)).isEqualTo(4);
        assertThat(accessLogRepository.countOffScheduleMeals(janelaDe, janelaAte)).isEqualTo(1);
        assertThat(accessLogRepository.countPresentToday(LocalDate.now().atStartOfDay()))
                .as("aluno C entrou pelo portao hoje")
                .isEqualTo(1);
        assertThat(accessLogRepository.countUniqueStudentsByPoints(
                janelaDe, janelaAte, List.of("REFEI1", "ENFERM"))).isEqualTo(3);

        // countByHour: EXTRACT(HOUR ...) — so passa gracas a NON_KEYWORDS=HOUR
        assertThat(accessLogRepository.countByHour(janelaDe, janelaAte))
                .as("agrupa por hora sem quebrar na palavra reservada HOUR")
                .isNotEmpty();

        // statsByPoint: COUNT(*) FILTER (WHERE ...)
        assertThat(accessLogRepository.statsByPoint(janelaDe, janelaAte)).isNotEmpty();

        // countLongInfirmaryStays: EXTRACT(EPOCH FROM (ts - ts))
        assertThat(accessLogRepository.countLongInfirmaryStays(janelaDe, janelaAte))
                .as("aluno B ficou 1h15 na enfermaria (> 30 min)")
                .isEqualTo(1);

        // avgStayMinutesByPoints: LAG(...) OVER w + WINDOW nomeado + EXTRACT EPOCH
        assertThat(accessLogRepository.avgStayMinutesByPoints(
                janelaDe, janelaAte, List.of("REFEI1")))
                .as("aluno A ficou ~40 min na cantina")
                .isNotNull()
                .satisfies(avg -> assertThat(avg).isBetween(39.0, 41.0));
    }

    @Test
    @DisplayName("resultados numericos coerentes com os pares entrada/saida legados")
    void resultadosCoerentes() {
        // O par completo do aluno A na cantina + o aluno D sem saida.
        var stats = accessLogRepository.statsByPoint(janelaDe, janelaAte);
        boolean temRefei1 = stats.stream().anyMatch(r -> "REFEI1".equals(r[0]));
        assertThat(temRefei1).isTrue();
    }

    // ─────────────── Nativas PostgreSQL-only: @Disabled + reportadas ───────────────

    /**
     * @Disabled — nativeQuery PostgreSQL-only.
     * Construto: DISTINCT ON (user_id, point_id). O H2 parseia mas exige que a
     * coluna do ORDER BY (timestamp) esteja no result list; o PostgreSQL tem
     * isencao especifica para DISTINCT ON. Nenhuma flag de URL resolve.
     * Query de producao NAO alterada. Validar manualmente em banco real (V13).
     */
    @Test
    @Disabled("nativeQuery PostgreSQL-only (DISTINCT ON) — validar em banco real; ver relatorio Fase I")
    @DisplayName("currentOccupancyByPoint — PG-only (DISTINCT ON)")
    void currentOccupancyByPoint_PgOnly() {
        assertThat(accessLogRepository.currentOccupancyByPoint(LocalDate.now().atStartOfDay()))
                .isNotNull();
    }

    /**
     * @Disabled — nativeQuery PostgreSQL-only.
     * Construto: interval '4 hours' (literal de intervalo do PostgreSQL). O H2
     * exige INTERVAL '4' HOUR e falha ao parsear a forma PG. Nenhuma flag
     * resolve sem reescrever a query. Query de producao NAO alterada.
     * Validar manualmente em banco real (V13).
     */
    @Test
    @Disabled("nativeQuery PostgreSQL-only (interval '4 hours') — validar em banco real; ver relatorio Fase I")
    @DisplayName("countUnregisteredExits — PG-only (interval literal)")
    void countUnregisteredExits_PgOnly() {
        assertThat(accessLogRepository.countUnregisteredExits(janelaDe, janelaAte))
                .isGreaterThanOrEqualTo(0);
    }
}
