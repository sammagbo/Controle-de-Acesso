package com.magbo.access.services;

import com.magbo.access.config.PolicyProperties;
import com.magbo.access.dto.EntitlementDecision;
import com.magbo.access.dto.ExitDecision;
import com.magbo.access.dto.hikvision.HikvisionEventDto;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.ClassSchedule;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.PolicyMode;
import com.magbo.access.models.User;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.ClassScheduleRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Orquestracao do webhook: ordem das regras e efeito das politicas.
 *
 * DETERMINISMO DE TEMPO: process() chama LocalDateTime.now() internamente e o
 * tempo nao e injetavel sem alterar producao (proibido nesta fase). Para
 * forcar FORA_HORARIO em qualquer hora do dia, os testes usam uma turma com
 * class_schedule 'N' em todos os dias ("dia sem refeicao"), em vez de depender
 * do relogio da maquina que roda a suite.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AccessDecisionServiceTest {

    @Mock private DoorMappingService doorMappingService;
    @Mock private UserRepository userRepository;
    @Mock private ClassScheduleRepository classScheduleRepository;
    @Mock private AccessLogRepository accessLogRepository;
    @Mock private DeduplicationService dedupService;
    @Mock private AccessAttemptService attemptService;
    @Mock private MealEntitlementService mealEntitlementService;
    @Mock private ExitPermissionService exitPermissionService;

    /** Classificador real: e puro e sem dependencias — mockar so afastaria do comportamento real. */
    private final HikvisionEventClassifier classifier = new HikvisionEventClassifier();

    private PolicyProperties policy;
    private AccessDecisionService service;

    private static final String EMPLOYEE = "9999999";
    private static final String TURMA_SEM_REFEICAO = "6A";
    private static final String IP = "10.10.0.1";

    @BeforeEach
    void setUp() {
        policy = new PolicyProperties();
        service = new AccessDecisionService(
                doorMappingService, userRepository, classScheduleRepository, accessLogRepository,
                classifier, dedupService, attemptService, policy,
                mealEntitlementService, exitPermissionService);

        when(userRepository.findByHikvisionEmployeeId(EMPLOYEE))
                .thenReturn(Optional.of(aluno(TURMA_SEM_REFEICAO)));
        when(dedupService.isDuplicate(anyString(), anyString(), any(), any())).thenReturn(false);
        // Turma cujo horario e 'N' todos os dias => FORA_HORARIO a qualquer hora.
        when(classScheduleRepository.findById(TURMA_SEM_REFEICAO))
                .thenReturn(Optional.of(scheduleTodosDiasN()));
        emCantinaEntrada();
    }

    // ───────────────── Ordem das regras ─────────────────

    /**
     * A ordem cantina e: dedup -> entitlement -> janela de horario.
     * Com meal-not-entitled=DENY, um aluno NOT_AUTHORIZED que chega fora de
     * horario deve parar em MEAL_NOT_ENTITLED e nunca chegar a OUTSIDE_MEAL_TIME.
     */
    @Test
    @DisplayName("NOT_AUTHORIZED + fora de horario -> vence MEAL_NOT_ENTITLED (entitlement antes de horario)")
    void entitlementVenceHorario() {
        policy.getPolicy().setMealNotEntitled(PolicyMode.DENY);
        naoAutorizado();

        service.process(faceEvent(), IP);

        ArgumentCaptor<DenialReason> motivo = ArgumentCaptor.forClass(DenialReason.class);
        verify(attemptService).record(any(), any(), any(), any(), any(), any(), any(), any(),
                any(), motivo.capture(), any(), any());

        assertThat(motivo.getValue()).isEqualTo(DenialReason.MEAL_NOT_ENTITLED);
        assertThat(motivo.getAllValues())
                .as("nao pode existir um segundo attempt de OUTSIDE_MEAL_TIME: a regra retornou antes")
                .doesNotContain(DenialReason.OUTSIDE_MEAL_TIME);
        verify(accessLogRepository, never()).save(any());
    }

    // ───────────────── OBSERVATION vs DENY ─────────────────

    @Test
    @DisplayName("mesma entrada, politica DENY -> 0 logs, 1 attempt DENIED")
    void politicaDenyNaoGravaLog() {
        policy.getPolicy().setMealNotEntitled(PolicyMode.DENY);
        naoAutorizado();

        service.process(faceEvent(), IP);

        verify(accessLogRepository, never()).save(any());
        verify(attemptService).record(any(), any(), any(), any(), any(), any(), any(), any(),
                eq(AuthorizationResult.DENIED), eq(DenialReason.MEAL_NOT_ENTITLED), any(), any());
    }

    @Test
    @DisplayName("mesma entrada, politica OBSERVATION -> grava log E attempt OBSERVATION")
    void politicaObservationGravaLogEAttempt() {
        policy.getPolicy().setMealNotEntitled(PolicyMode.OBSERVATION);
        policy.getPolicy().setOutsideMealTime(PolicyMode.OBSERVATION);
        naoAutorizado();

        service.process(faceEvent(), IP);

        verify(accessLogRepository).save(any(AccessLog.class));
        verify(attemptService).record(any(), any(), any(), any(), any(), any(), any(), any(),
                eq(AuthorizationResult.OBSERVATION), eq(DenialReason.MEAL_NOT_ENTITLED), any(), any());
    }

    @Test
    @DisplayName("usuario inativo: DENY -> 0 logs; OBSERVATION -> log + attempt")
    void politicaUserInactive() {
        when(userRepository.findByHikvisionEmployeeId(EMPLOYEE))
                .thenReturn(Optional.of(alunoInativo()));
        autorizado();

        policy.getPolicy().setUserInactive(PolicyMode.DENY);
        service.process(faceEvent(), IP);
        verify(accessLogRepository, never()).save(any());
        verify(attemptService).record(any(), any(), any(), any(), any(), any(), any(), any(),
                eq(AuthorizationResult.DENIED), eq(DenialReason.USER_INACTIVE), any(), any());

        org.mockito.Mockito.reset(accessLogRepository, attemptService);

        policy.getPolicy().setUserInactive(PolicyMode.OBSERVATION);
        service.process(faceEvent(), IP);
        verify(accessLogRepository).save(any(AccessLog.class));
        verify(attemptService).record(any(), any(), any(), any(), any(), any(), any(), any(),
                eq(AuthorizationResult.OBSERVATION), eq(DenialReason.USER_INACTIVE), any(), any());
    }

    // ───────────────── Escopo das regras por ponto ─────────────────

    @Test
    @DisplayName("SAIDA na cantina NAO avalia direito a refeicao")
    void saidaNaCantinaNaoAvaliaEntitlement() {
        when(doorMappingService.resolve(any(), any(), eq(IP)))
                .thenReturn(new DoorMappingService.ResolvedMapping("REFEI1", AccessAction.SAIDA, false));
        when(accessLogRepository.findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(
                anyString(), anyString(), any())).thenReturn(Optional.empty());

        service.process(faceEvent(), IP);

        verify(mealEntitlementService, never()).evaluate(anyString(), any());
        verify(accessLogRepository).save(any(AccessLog.class));
    }

    @Test
    @DisplayName("BIBLIO nao tem regra de refeicao nem de saida: grava log direto")
    void biblioNaoTemRegra() {
        when(doorMappingService.resolve(any(), any(), eq(IP)))
                .thenReturn(new DoorMappingService.ResolvedMapping("BIBLIO", AccessAction.ENTRADA, false));

        service.process(faceEvent(), IP);

        verify(mealEntitlementService, never()).evaluate(anyString(), any());
        verify(exitPermissionService, never()).evaluate(anyString(), any());
        verify(attemptService, never()).record(any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any());

        ArgumentCaptor<AccessLog> log = ArgumentCaptor.forClass(AccessLog.class);
        verify(accessLogRepository).save(log.capture());
        assertThat(log.getValue().getPointId()).isEqualTo("BIBLIO");
        assertThat(log.getValue().getFlag()).isNull();
    }

    @Test
    @DisplayName("ENFERM nao tem regra: grava log direto")
    void enfermNaoTemRegra() {
        when(doorMappingService.resolve(any(), any(), eq(IP)))
                .thenReturn(new DoorMappingService.ResolvedMapping("ENFERM", AccessAction.ENTRADA, false));

        service.process(faceEvent(), IP);

        verify(mealEntitlementService, never()).evaluate(anyString(), any());
        verify(accessLogRepository).save(any(AccessLog.class));
    }

    @Test
    @DisplayName("SAIDA no portao sem permissao (DENY) -> 0 logs, attempt EXIT_NOT_AUTHORIZED")
    void saidaNoPortaoSemPermissao() {
        policy.getPolicy().setExitNotAuthorized(PolicyMode.DENY);
        when(doorMappingService.resolve(any(), any(), eq(IP)))
                .thenReturn(new DoorMappingService.ResolvedMapping("PORT1", AccessAction.SAIDA, false));
        when(exitPermissionService.evaluate(anyString(), any()))
                .thenReturn(new ExitDecision(false, DenialReason.EXIT_NOT_AUTHORIZED, null, null));

        service.process(faceEvent(), IP);

        verify(accessLogRepository, never()).save(any());
        verify(attemptService).record(any(), any(), any(), any(), any(), any(), any(), any(),
                eq(AuthorizationResult.DENIED), eq(DenialReason.EXIT_NOT_AUTHORIZED), any(), any());
        verify(exitPermissionService, never()).consumeIfSingle(any());
    }

    // ───────────────── Fiacao (o que a reflexao nao cobre) ─────────────────

    /**
     * Guarda de FIACAO, complementar a EntryWindowRegressionTest.
     *
     * Aquela classe congela validateEntryWindow por reflexao — o que continua
     * verde mesmo se process() parar de chamar o metodo. Este teste dirige
     * process() de ponta a ponta e prova que o flag calculado chega ao
     * AccessLog gravado.
     */
    @Test
    @DisplayName("FIACAO: o flag FORA_HORARIO calculado chega ao AccessLog gravado")
    void flagForaHorarioChegaAoAccessLog() {
        policy.getPolicy().setOutsideMealTime(PolicyMode.OBSERVATION);
        autorizado();

        service.process(faceEvent(), IP);

        ArgumentCaptor<AccessLog> captor = ArgumentCaptor.forClass(AccessLog.class);
        verify(accessLogRepository).save(captor.capture());
        AccessLog salvo = captor.getValue();

        assertThat(salvo.getFlag()).isEqualTo("FORA_HORARIO");
        assertThat(salvo.getUserId()).isEqualTo(EMPLOYEE);
        assertThat(salvo.getPointId()).isEqualTo("REFEI1");
        assertThat(salvo.getAction()).isEqualTo(AccessAction.ENTRADA);
        assertThat(salvo.getAuthMethod()).isEqualTo(AuthMethod.FACE);
        assertThat(salvo.getHikvisionSubEventType()).isEqualTo(75);
    }

    @Test
    @DisplayName("o AccessLog usa a hora do SERVIDOR, ignorando o dateTime GMT+8 do payload")
    void usaHoraDoServidorNaoDoPayload() {
        autorizado();
        java.time.LocalDateTime antes = java.time.LocalDateTime.now();

        service.process(faceEvent(), IP);

        ArgumentCaptor<AccessLog> captor = ArgumentCaptor.forClass(AccessLog.class);
        verify(accessLogRepository).save(captor.capture());

        assertThat(captor.getValue().getTimestamp())
                .as("o payload traz dateTime em +08:00 (fuso de fabrica); o backend ignora")
                .isBetween(antes.minusSeconds(5), java.time.LocalDateTime.now().plusSeconds(5));
    }

    // ───────────────── Congelamento de comportamento sabidamente errado ─────────────────

    /**
     * CONGELAMENTO DE ACHADO — NAO e endosso do comportamento.
     *
     * Subtipos nao classificados (9, 21, 22, boot) caem no ramo
     * !isAccessCandidate e gravam DenialReason.DEVICE_DENIED, embora o
     * dispositivo nao tenha negado nada. O modelo forca isso:
     * AccessAttemptService lanca se denialReason==null e o enum DenialReason
     * nao tem UNKNOWN_EVENT.
     *
     * Por que importa: DEVICE_DENIED e o marcador de auditoria do bug da
     * refeicao falsa (subtipo 8). Misturar subtipos desconhecidos nele
     * super-reporta countByReasonSince e corrompe a metrica que prova que a
     * correcao da Fase B funciona.
     *
     * Este teste existe para que a mudanca desse valor seja uma DECISAO
     * explicita, e nao um acidente. Reportado ao Sam em 15/07/2026.
     */
    @Test
    @DisplayName("CONGELADO: subtipo desconhecido COM identidade grava DEVICE_DENIED (semanticamente errado)")
    void subtipoDesconhecidoGravaDeviceDeniedIndevidamente() {
        HikvisionEventDto.AccessControllerEvent evento = faceEvent();
        evento.setSubEventType(21); // porta abriu

        service.process(evento, IP);

        verify(accessLogRepository, never()).save(any());
        verify(attemptService).record(any(), eq(EMPLOYEE), any(), any(), any(), any(),
                eq(AuthMethod.UNKNOWN), eq(AuthResult.UNKNOWN),
                eq(AuthorizationResult.NOT_APPLICABLE),
                eq(DenialReason.DEVICE_DENIED), // <-- o achado: nao houve negacao do dispositivo
                eq(21), any());
    }

    @Test
    @DisplayName("subtipo 8 (negado pelo terminal) -> 0 logs, attempt DEVICE_DENIED")
    void subtipo8NuncaGravaLog() {
        HikvisionEventDto.AccessControllerEvent evento = faceEvent();
        evento.setSubEventType(8);

        service.process(evento, IP);

        verify(accessLogRepository, never()).save(any());
        verify(attemptService).record(eq(EMPLOYEE), eq(EMPLOYEE), any(), any(), any(), any(),
                any(), eq(AuthResult.DENIED),
                eq(AuthorizationResult.DENIED), eq(DenialReason.DEVICE_DENIED), eq(8), any());
    }

    @Test
    @DisplayName("usuario desconhecido -> attempt UNKNOWN_USER com userId null e raw preservado")
    void usuarioDesconhecido() {
        when(userRepository.findByHikvisionEmployeeId("8888888")).thenReturn(Optional.empty());
        HikvisionEventDto.AccessControllerEvent evento = faceEvent();
        evento.setEmployeeNoString("8888888");

        service.process(evento, IP);

        verify(accessLogRepository, never()).save(any());
        verify(attemptService).record(eq(null), eq("8888888"), any(), any(), any(), any(),
                any(), any(), eq(AuthorizationResult.DENIED), eq(DenialReason.UNKNOWN_USER), any(), any());
    }

    // ───────────────── Helpers ─────────────────

    private void emCantinaEntrada() {
        when(doorMappingService.resolve(any(), any(), eq(IP)))
                .thenReturn(new DoorMappingService.ResolvedMapping("REFEI1", AccessAction.ENTRADA, false));
    }

    private void autorizado() {
        when(mealEntitlementService.evaluate(eq(EMPLOYEE), any(LocalDate.class)))
                .thenReturn(new EntitlementDecision(EntitlementStatus.AUTHORIZED, true, null));
    }

    private void naoAutorizado() {
        when(mealEntitlementService.evaluate(eq(EMPLOYEE), any(LocalDate.class)))
                .thenReturn(new EntitlementDecision(EntitlementStatus.NOT_AUTHORIZED, false,
                        DenialReason.MEAL_NOT_ENTITLED));
    }

    private static HikvisionEventDto.AccessControllerEvent faceEvent() {
        HikvisionEventDto.AccessControllerEvent e = new HikvisionEventDto.AccessControllerEvent();
        e.setEmployeeNoString(EMPLOYEE);
        e.setName("Teste Piloto");
        e.setMajorEventType(5);
        e.setSubEventType(75);
        return e;
    }

    private static User aluno(String turma) {
        return User.builder()
                .id(EMPLOYEE).nome("Teste Piloto")
                .tipo(com.magbo.access.models.UserType.ALUNO)
                .turma(turma).ativo(true).hikvisionEmployeeId(EMPLOYEE)
                .build();
    }

    private static User alunoInativo() {
        User u = aluno(TURMA_SEM_REFEICAO);
        u.setAtivo(false);
        return u;
    }

    /** Horario 'N' (sem refeicao) em todos os dias uteis => FORA_HORARIO a qualquer hora. */
    private static ClassSchedule scheduleTodosDiasN() {
        return ClassSchedule.builder()
                .classe(TURMA_SEM_REFEICAO)
                .lunMidi("N").marMidi("N").merMidi("N").jeuMidi("N").venMidi("N")
                .build();
    }
}
