package com.magbo.access.integration;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.services.PresenceAutoCloseService;
import com.magbo.access.services.VisitStatsService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * VISITAS DO CDI — filtro de tipo e regra da passagem rápida.
 *
 * Contexto de produção: com 152 FUNCIONARIO + 49 PROFESSOR cadastrados, os
 * servidores passam pelo CDI por segundos, quase nunca passam o rosto na saída,
 * e o fechamento das 17:00 transforma isso em "permanência" de um dia inteiro —
 * ontem ~15 FUNC-### foram fechados assim. Os números do CDI contam ALUNO por
 * padrão, e visita curta demais não é permanência.
 *
 * NADA É APAGADO: estes testes provam também que as linhas continuam no banco.
 */
class VisitStatsIT extends AbstractIT {

    @Autowired
    private VisitStatsService visitStats;

    private static final List<String> CDI = List.of("BIBLIO");
    private static final LocalDate DIA = LocalDate.now().minusDays(1);
    private static final LocalDateTime DE = DIA.atStartOfDay();
    private static final LocalDateTime ATE = DIA.atTime(LocalTime.MAX);

    // ───────────────── Filtro de tipo ─────────────────

    @Test
    @DisplayName("por padrão conta só ALUNO; servidor fica de fora")
    void contaSomenteAlunosPorPadrao() {
        aluno("0004048", "Aluna Um");
        servidor("FUNC-001", "Servidor Um");

        visita("0004048", LocalTime.of(9, 0), LocalTime.of(9, 40));
        visita("FUNC-001", LocalTime.of(10, 0), LocalTime.of(10, 30));

        VisitStatsService.VisitStats so = visitStats.stats(CDI, DE, ATE, false);
        assertThat(so.visits()).isEqualTo(1);
        assertThat(so.uniquePeople()).isEqualTo(1);
    }

    @Test
    @DisplayName("incluirFuncionarios=true conta todo mundo")
    void incluirFuncionariosMostraTudo() {
        aluno("0004048", "Aluna Um");
        servidor("FUNC-001", "Servidor Um");
        visita("0004048", LocalTime.of(9, 0), LocalTime.of(9, 40));
        visita("FUNC-001", LocalTime.of(10, 0), LocalTime.of(10, 30));

        VisitStatsService.VisitStats tudo = visitStats.stats(CDI, DE, ATE, true);
        assertThat(tudo.visits()).isEqualTo(2);
        assertThat(tudo.uniquePeople()).isEqualTo(2);
    }

    @Test
    @DisplayName("professor também é servidor para o filtro")
    void professorTambemEhServidor() {
        aluno("0004048", "Aluna Um");
        User prof = servidor("FUNC-002", "Prof Silva");
        prof.setTipo(UserType.PROFESSOR);
        userRepository.save(prof);

        visita("0004048", LocalTime.of(9, 0), LocalTime.of(9, 40));
        visita("FUNC-002", LocalTime.of(9, 5), LocalTime.of(9, 45));

        assertThat(visitStats.stats(CDI, DE, ATE, false).visits()).isEqualTo(1);
        assertThat(visitStats.stats(CDI, DE, ATE, true).visits()).isEqualTo(2);
    }

    /** Passagem de id sem cadastro não pode entrar num número "de aluno". */
    @Test
    @DisplayName("id sem cadastro em app_users fica de fora quando se pede só aluno")
    void idSemCadastroNaoContaComoAluno() {
        visita("0009999", LocalTime.of(9, 0), LocalTime.of(9, 40));

        assertThat(visitStats.stats(CDI, DE, ATE, false).visits()).isZero();
        assertThat(visitStats.stats(CDI, DE, ATE, true).visits()).isEqualTo(1);
    }

    // ───────────────── Passagem rápida ─────────────────

    @Test
    @DisplayName("visita de 20s não conta como visita (entrou para dar um recado)")
    void visitaCurtaNaoConta() {
        aluno("0004048", "Aluna Um");
        visitaSegundos("0004048", LocalTime.of(9, 0), 20);

        VisitStatsService.VisitStats s = visitStats.stats(CDI, DE, ATE, false);
        assertThat(s.visits()).isZero();
        assertThat(s.shortVisitsIgnored()).isEqualTo(1);
        assertThat(s.avgDurationMin()).isNull();

        assertThat(accessLogRepository.count())
                .as("★ as duas linhas continuam no banco — regra de leitura, não de escrita")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("BORDA: 59s não conta, 60s conta")
    void bordaDoMinimo() {
        aluno("0004048", "Aluna Um");
        visitaSegundos("0004048", LocalTime.of(9, 0), 59);
        assertThat(visitStats.stats(CDI, DE, ATE, false).visits()).isZero();

        visitaSegundos("0004048", LocalTime.of(10, 0), 60);
        assertThat(visitStats.stats(CDI, DE, ATE, false).visits()).isEqualTo(1);
    }

    @Test
    @DisplayName("visita curta não entra na média de duração")
    void visitaCurtaNaoEntraNaMedia() {
        aluno("0004048", "Aluna Um");
        visitaSegundos("0004048", LocalTime.of(9, 0), 10);      // ignorada
        visita("0004048", LocalTime.of(10, 0), LocalTime.of(10, 30));  // 30 min

        VisitStatsService.VisitStats s = visitStats.stats(CDI, DE, ATE, false);
        assertThat(s.visits()).isEqualTo(1);
        assertThat(s.avgDurationMin())
                .as("média só da visita que conta; a de 10s puxaria para baixo")
                .isEqualTo(30);
    }

    // ───────────────── Fechamento automático ─────────────────

    /**
     * A SAIDA das 17:00 é sintética: a pessoa não passou o rosto ali. Somá-la
     * como duração real inventaria permanência — exatamente o que inflou os
     * números do CDI.
     */
    @Test
    @DisplayName("saída de FECHAMENTO_AUTO fica fora da média de duração")
    void fechamentoAutomaticoNaoEntraNaMedia() {
        aluno("0004048", "Aluna Um");
        aluno("0001764", "Aluna Dois");

        visita("0004048", LocalTime.of(9, 0), LocalTime.of(9, 30));   // 30 min reais
        entrada("0001764", LocalTime.of(9, 0));
        saidaComFlag("0001764", LocalTime.of(17, 0), PresenceAutoCloseService.FLAG_FECHAMENTO);

        VisitStatsService.VisitStats s = visitStats.stats(CDI, DE, ATE, false);
        assertThat(s.visits())
                .as("a visita fechada automaticamente ainda é uma visita")
                .isEqualTo(2);
        assertThat(s.avgDurationMin())
                .as("★ só os 30 min reais entram: 17:00 não é hora de saída de ninguém")
                .isEqualTo(30);
    }

    // ───────────────── Emparelhamento ─────────────────

    /**
     * O emparelhamento é por pilha e não por posição. Com ENTRADA sem SAIDA no
     * meio, um pareamento posicional casaria a entrada de uma visita com a
     * saída de outra — e produzia durações negativas nos relatórios.
     */
    @Test
    @DisplayName("ENTRADA sem saída no meio não desalinha as visitas seguintes")
    void entradaSemSaidaNaoDesalinha() {
        aluno("0004048", "Aluna Um");
        entrada("0004048", LocalTime.of(8, 0));                        // fica aberta
        visita("0004048", LocalTime.of(10, 0), LocalTime.of(10, 30));  // 30 min

        VisitStatsService.VisitStats s = visitStats.stats(CDI, DE, ATE, false);
        assertThat(s.visits()).isEqualTo(2);
        assertThat(s.openVisits()).isEqualTo(1);
        assertThat(s.avgDurationMin())
                .as("a média só olha a visita fechada")
                .isEqualTo(30);
    }

    @Test
    @DisplayName("SAIDA sem entrada anterior é ignorada, não vira visita negativa")
    void saidaSoltaNaoViraVisita() {
        aluno("0004048", "Aluna Um");
        saidaComFlag("0004048", LocalTime.of(8, 0), null);
        visita("0004048", LocalTime.of(10, 0), LocalTime.of(10, 30));

        VisitStatsService.VisitStats s = visitStats.stats(CDI, DE, ATE, false);
        assertThat(s.visits()).isEqualTo(1);
        assertThat(s.avgDurationMin()).isEqualTo(30);
    }

    @Test
    @DisplayName("mesma pessoa, duas visitas no dia -> 2 visitas, 1 pessoa")
    void duasVisitasNoMesmoDia() {
        aluno("0004048", "Aluna Um");
        visita("0004048", LocalTime.of(9, 0), LocalTime.of(9, 20));
        visita("0004048", LocalTime.of(14, 0), LocalTime.of(14, 40));

        VisitStatsService.VisitStats s = visitStats.stats(CDI, DE, ATE, false);
        assertThat(s.visits()).isEqualTo(2);
        assertThat(s.uniquePeople()).isEqualTo(1);
        assertThat(s.avgDurationMin()).isEqualTo(30);   // (20 + 40) / 2
    }

    @Test
    @DisplayName("período sem movimento -> zeros e média nula, sem estourar")
    void periodoVazio() {
        VisitStatsService.VisitStats s = visitStats.stats(CDI, DE, ATE, false);
        assertThat(s.visits()).isZero();
        assertThat(s.uniquePeople()).isZero();
        assertThat(s.avgDurationMin()).isNull();
    }

    // ───────────────── Helpers ─────────────────

    private User aluno(String id, String nome) {
        return userRepository.save(User.builder().id(id).nome(nome).tipo(UserType.ALUNO)
                .turma("3B").ativo(true).mealCount(0).build());
    }

    private User servidor(String id, String nome) {
        return userRepository.save(User.builder().id(id).nome(nome).tipo(UserType.FUNCIONARIO)
                .departamento("VIE SCOLAIRE").ativo(true).mealCount(0).build());
    }

    private void visita(String userId, LocalTime entrada, LocalTime saida) {
        entrada(userId, entrada);
        saidaComFlag(userId, saida, null);
    }

    private void visitaSegundos(String userId, LocalTime entrada, int segundos) {
        salvar(userId, AccessAction.ENTRADA, DIA.atTime(entrada), null);
        salvar(userId, AccessAction.SAIDA, DIA.atTime(entrada).plusSeconds(segundos), null);
    }

    private void entrada(String userId, LocalTime hora) {
        salvar(userId, AccessAction.ENTRADA, DIA.atTime(hora), null);
    }

    private void saidaComFlag(String userId, LocalTime hora, String flag) {
        salvar(userId, AccessAction.SAIDA, DIA.atTime(hora), flag);
    }

    private void salvar(String userId, AccessAction action, LocalDateTime ts, String flag) {
        accessLogRepository.save(AccessLog.builder()
                .userId(userId).pointId("BIBLIO").action(action).timestamp(ts).flag(flag).build());
    }
}
