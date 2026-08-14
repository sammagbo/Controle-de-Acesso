package com.magbo.access.services;

import com.magbo.access.config.PolicyProperties;
import com.magbo.access.config.RegimeProperties;
import com.magbo.access.dto.ExitDecision;
import com.magbo.access.models.*;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.ClassScheduleRepository;
import com.magbo.access.repositories.StudentRegimeEventRepository;
import com.magbo.access.repositories.StudentRegimeRepository;
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
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * A FIACAO do régime de sortie no portao — e a promessa de que ela SO OBSERVA.
 *
 * O que este teste protege e a linha que separa este sistema de um que tranca
 * portas. O MAGBO e observacional (ADR-003): quando o regime diz "este aluno
 * nao deveria sair agora", a passagem continua sendo gravada, o portao continua
 * abrindo, e o que muda e que fica REGISTRADO que o sistema avisou.
 *
 * Se algum dia alguem trocar isso por um `return`, este teste fica vermelho — e
 * a diferenca entre avisar e barrar uma crianca no portao nao pode depender de
 * ninguem ter lembrado.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("Régime de sortie — fiação no portão")
class RegimeGateWiringTest {

    private static final String ALUNO = "0003535";
    private static final String IP_CAMERA = "172.20.40.167";
    private static final LocalDate DIA = LocalDate.of(2026, 8, 14);

    @Mock private DoorMappingService doorMappingService;
    @Mock private UserRepository userRepository;
    @Mock private ClassScheduleRepository classScheduleRepository;
    @Mock private AccessLogRepository accessLogRepository;
    @Mock private DeduplicationService dedupService;
    @Mock private AccessAttemptService attemptService;
    @Mock private MealEntitlementService mealEntitlementService;
    @Mock private ExitPermissionService exitPermissionService;
    @Mock private com.magbo.access.repositories.StudentExitPermissionRepository permissionRepository;
    @Mock private SamePassageService samePassageService;
    @Mock private StudentRegimeRepository regimeRepository;
    @Mock private StudentRegimeEventRepository regimeEventRepository;

    private RegimeProperties regimeProps;
    private AccessDecisionService service;

    @BeforeEach
    void setUp() {
        regimeProps = new RegimeProperties();
        regimeProps.setFimManha(LocalTime.of(12, 0));
        regimeProps.setFimDia(LocalTime.of(17, 0));
        regimeProps.setToleranciaMinutos(15);
        regimeProps.setDesconhecido("OBSERVATION");
        regimeProps.setHabilitado(true);

        RegimeSortieService regimeService = new RegimeSortieService(
                regimeRepository, regimeEventRepository, userRepository, classScheduleRepository,
                exitPermissionService, accessLogRepository, regimeProps, permissionRepository);

        service = new AccessDecisionService(
                doorMappingService, userRepository, classScheduleRepository, accessLogRepository,
                new HikvisionEventClassifier(), dedupService, attemptService, new PolicyProperties(),
                mealEntitlementService, exitPermissionService, samePassageService,
                new PostoFixoService(accessLogRepository),
                new PresencaAbertaService(accessLogRepository),
                regimeService);

        // Portao, SAIDA. E o cenario de todo teste desta classe salvo aviso.
        when(doorMappingService.resolve(any(), any(), anyString()))
                .thenReturn(new DoorMappingService.ResolvedMapping("PORT1", AccessAction.SAIDA, false));
        when(samePassageService.alreadyRegistered(any(), any(), any(), any())).thenReturn(false);
        when(exitPermissionService.evaluate(anyString(), any()))
                .thenReturn(new ExitDecision(false, DenialReason.EXIT_NOT_AUTHORIZED, null, null));
        when(regimeRepository.findVigente(anyString(), any())).thenReturn(Optional.empty());
    }

    private User pessoa(UserType tipo) {
        User u = User.builder().id(ALUNO).nome("Aurélie Gonçalves").tipo(tipo).ativo(true).build();
        when(userRepository.findById(ALUNO)).thenReturn(Optional.of(u));
        return u;
    }

    private void comRegime(RegimeSortie sortie, RegimeGeneral geral) {
        when(regimeRepository.findVigente(eq(ALUNO), any())).thenReturn(Optional.of(
                StudentRegime.builder().id(1L).userId(ALUNO)
                        .regimeSortie(sortie).regimeGeneral(geral)
                        .validFrom(DIA.minusMonths(1)).authorizedByFamily("Mme Gonçalves")
                        .createdBy("vie.scolaire").build()));
    }

    /** Passagem pela camera da portaria as 10h — meio da jornada. */
    private void saiPelaPortaria() {
        service.processCameraRecognition(pessoa(UserType.ALUNO), "0000000000003535",
                IP_CAMERA, LocalDateTime.of(DIA, LocalTime.of(10, 0)));
    }

    @Test
    @DisplayName("★★★ o regime é avaliado com a hora da PASSAGEM, nunca a do processamento")
    void regimeUsaAHoraDaPassagem() {
        // ⚠️ ESTE TESTE TRAVA UM CONTRATO, não um resultado — e a diferença é a
        // razão de ele existir assim.
        //
        // A primeira versão da fiação passava `now` (LocalDateTime.now()) ao
        // serviço. Durante o dia isso dá o mesmo veredicto que a hora do evento,
        // então TODOS os testes de veredicto passavam verdes. O defeito só
        // apareceu porque a suíte rodou às 18h45: depois do fim da jornada, o
        // regime 1 virava "saída normal" e o aviso sumia.
        //
        // Um teste que só reprova conforme a hora em que alguém o executa não é
        // prova de nada. Por isso aqui se captura o ARGUMENTO: seja qual for o
        // relógio de parede, o que chega ao serviço tem de ser o instante em que
        // a criança cruzou o portão.
        //
        // É a mesma armadilha do incidente de 03/08/2026 (fila offline de 33
        // eventos entrando toda às 14:51, gerando durações negativas) — só que
        // agora o que ela decide é se uma criança podia sair da escola.
        RegimeSortieService espiao = mock(RegimeSortieService.class);
        when(espiao.avaliar(anyString(), any()))
                .thenReturn(new com.magbo.access.dto.RegimeDecision(
                        RegimeVerdict.INCONNU, "regime.motivo.sem.regime", null, null, null, false));

        AccessDecisionService comEspiao = new AccessDecisionService(
                doorMappingService, userRepository, classScheduleRepository, accessLogRepository,
                new HikvisionEventClassifier(), dedupService, attemptService, new PolicyProperties(),
                mealEntitlementService, exitPermissionService, samePassageService,
                new PostoFixoService(accessLogRepository),
                new PresencaAbertaService(accessLogRepository),
                espiao);

        LocalDateTime horaDaPassagem = LocalDateTime.of(DIA, LocalTime.of(10, 0));
        comEspiao.processCameraRecognition(pessoa(UserType.ALUNO), "0000000000003535",
                IP_CAMERA, horaDaPassagem);

        ArgumentCaptor<LocalDateTime> quando = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(espiao).avaliar(eq(ALUNO), quando.capture());
        org.assertj.core.api.Assertions.assertThat(quando.getValue())
                .as("o regime tem de ser julgado pelo instante da passagem, não pelo do processamento")
                .isEqualTo(horaDaPassagem);
    }

    @Test
    @DisplayName("★★ regime 1 saindo às 10h: AVISA e MESMO ASSIM grava a passagem")
    void avisaMasNaoBarra() {
        comRegime(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);

        saiPelaPortaria();

        // 1. O aviso, como OBSERVATION — nunca DENIED.
        verify(attemptService).recordObservacaoIsolada(
                eq(ALUNO), anyString(), anyString(), eq("PORT1"), eq(AccessAction.SAIDA),
                anyString(), any(), any(),
                eq(AuthorizationResult.OBSERVATION), eq(DenialReason.REGIME_NOT_ALLOWED),
                any(), anyBoolean(), any());

        // 2. ★★ E A PASSAGEM CONTINUA GRAVADA. Esta e a linha que separa este
        //    sistema de um que tranca portas.
        verify(accessLogRepository).save(any(AccessLog.class));
    }

    @Test
    @DisplayName("★★★ a observacao ESTOURA no commit e a passagem sobrevive mesmo assim")
    void observacaoQueEstouraNaoApagaAPassagem() {
        // ⚠️ O que o mock lanca aqui e EXATAMENTE o que escapa do metodo real, e
        // que o try/catch interno dele nao alcanca: (a) UnexpectedRollbackException
        // — o INSERT falhou (CHECK da V015 ausente na VM), o save marcou a
        // transacao interna como rollback-only, o catch interno engoliu o erro do
        // save, e o COMMIT dela estourou DEPOIS, no interceptador; (b)
        // CannotCreateTransactionException — o pool de 10 nao tinha segunda
        // conexao e o interceptador lancou ANTES do corpo do metodo.
        // A primeira versao confiava so no catch interno; um painel de revisao
        // (leitor adversario, 14/08/2026) provou que essas duas falhas passavam
        // por cima dele e levavam o access_log junto. O guard agora e o catch no
        // CHAMADOR — e e ele que este teste executa.
        comRegime(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
        org.mockito.Mockito.doThrow(
                new org.springframework.transaction.UnexpectedRollbackException(
                        "Transaction silently rolled back because it has been marked as rollback-only"))
                .when(attemptService).recordObservacaoIsolada(
                        any(), any(), any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), anyBoolean(), any());

        saiPelaPortaria();

        // A observacao explodiu — e a passagem foi gravada mesmo assim.
        verify(accessLogRepository).save(any(AccessLog.class));

        // O mesmo para a falha que acontece ANTES do corpo do metodo.
        org.mockito.Mockito.reset(accessLogRepository);
        org.mockito.Mockito.doThrow(
                new org.springframework.transaction.CannotCreateTransactionException(
                        "Could not open JDBC Connection for transaction"))
                .when(attemptService).recordObservacaoIsolada(
                        any(), any(), any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), anyBoolean(), any());

        saiPelaPortaria();
        verify(accessLogRepository).save(any(AccessLog.class));
    }

    @Test
    @DisplayName("★★ sem regime cadastrado: NADA é registrado — 923 alunos no dia 1")
    void semRegimeNaoPoluiOFeed() {
        saiPelaPortaria();

        verify(attemptService, never()).recordObservacaoIsolada(
                any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), anyBoolean(), any());
        verify(accessLogRepository).save(any(AccessLog.class));
    }

    @Test
    @DisplayName("★ com a property em DENY, o mesmo aluno vira REGIME_UNKNOWN — motivo distinto")
    void denyDistingueOMotivo() {
        regimeProps.setDesconhecido("DENY");

        saiPelaPortaria();

        verify(attemptService).recordObservacaoIsolada(
                eq(ALUNO), anyString(), anyString(), eq("PORT1"), eq(AccessAction.SAIDA),
                anyString(), any(), any(),
                eq(AuthorizationResult.OBSERVATION), eq(DenialReason.REGIME_UNKNOWN),
                any(), anyBoolean(), any());
    }

    @Test
    @DisplayName("★★ professor saindo: nada registrado — regime é instituto de aluno")
    void servidorNaoGeraAviso() {
        service.processCameraRecognition(pessoa(UserType.PROFESSOR), "999",
                IP_CAMERA, LocalDateTime.of(DIA, LocalTime.of(10, 0)));

        verify(attemptService, never()).recordObservacaoIsolada(
                any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), anyBoolean(), any());
        verify(accessLogRepository).save(any(AccessLog.class));
    }

    @Test
    @DisplayName("★ ENTRADA no portão não é avaliada — o regime fala de SAÍDA")
    void entradaNaoEAvaliada() {
        when(doorMappingService.resolve(any(), any(), anyString()))
                .thenReturn(new DoorMappingService.ResolvedMapping("PORT1", AccessAction.ENTRADA, false));
        comRegime(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);

        saiPelaPortaria();

        verify(attemptService, never()).recordObservacaoIsolada(
                any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), anyBoolean(), any());
    }

    @Test
    @DisplayName("★ fora do portão (CDI) não é avaliado — a regra é do portão")
    void foraDoPortaoNaoEAvaliado() {
        when(doorMappingService.resolve(any(), any(), anyString()))
                .thenReturn(new DoorMappingService.ResolvedMapping("BIBLIO", AccessAction.SAIDA, false));
        comRegime(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);

        saiPelaPortaria();

        verify(attemptService, never()).recordObservacaoIsolada(
                any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), anyBoolean(), any());
    }

    @Test
    @DisplayName("★ leitura repetida em segundos não gera dois avisos no feed")
    void mesmaPassagemNaoRepeteOAviso() {
        comRegime(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
        when(samePassageService.alreadyRegistered(any(), any(), any(), any())).thenReturn(true);

        saiPelaPortaria();

        verify(attemptService, never()).recordObservacaoIsolada(
                any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), anyBoolean(), any());
        verify(accessLogRepository, never()).save(any(AccessLog.class));
    }

    @Test
    @DisplayName("★ regime 3 (libre) não gera aviso nenhum")
    void regime3NaoAvisa() {
        comRegime(RegimeSortie.REGIME_3, RegimeGeneral.EXTERNE);

        saiPelaPortaria();

        verify(attemptService, never()).recordObservacaoIsolada(
                any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), anyBoolean(), any());
    }

    @Test
    @DisplayName("★★★ regime 2 DEIXA RASTRO — como OBSERVAÇÃO, nunca como objeção")
    void regime2DeixaRastro() {
        // A primeira versão só gravava NON_AUTORISE, e A_VERIFIER — que o
        // javadoc do próprio RegimeVerdict chama de "o valor mais importante do
        // enum" — não existia em lugar nenhum: nem attempt, nem feed, nem
        // relatório. Um veredicto que ninguém consegue contar depois não pode
        // ser melhorado, e era justamente o do regime 2, metade dos casos
        // duvidosos.
        //
        // ⚠️ Motivo PRÓPRIO (REGIME_TO_VERIFY) e não REGIME_NOT_ALLOWED: o
        // MAGBO não discorda desta saída, ele não sabe. Contar estas linhas
        // junto com as recusas seria imputar ao aluno uma limitação do sistema.
        comRegime(RegimeSortie.REGIME_2, RegimeGeneral.EXTERNE);

        saiPelaPortaria();

        verify(attemptService).recordObservacaoIsolada(
                eq(ALUNO), anyString(), anyString(), eq("PORT1"), eq(AccessAction.SAIDA),
                anyString(), any(), any(),
                eq(AuthorizationResult.OBSERVATION), eq(DenialReason.REGIME_TO_VERIFY),
                any(), anyBoolean(), any());
        verify(accessLogRepository).save(any(AccessLog.class));
    }


}
