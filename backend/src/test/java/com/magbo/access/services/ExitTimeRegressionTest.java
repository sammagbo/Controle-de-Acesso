package com.magbo.access.services;

import com.magbo.access.config.PolicyProperties;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.ClassScheduleRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * BLINDAGEM — congela a regra de tempo maximo na cantina (EXCEDEU_TEMPO),
 * validada com hardware. Ver o javadoc de EntryWindowRegressionTest para a
 * justificativa do uso de reflexao.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExitTimeRegressionTest {

    @Mock private DoorMappingService doorMappingService;
    @Mock private UserRepository userRepository;
    @Mock private ClassScheduleRepository classScheduleRepository;
    @Mock private AccessLogRepository accessLogRepository;
    @Mock private DeduplicationService dedupService;
    @Mock private AccessAttemptService attemptService;
    @Mock private MealEntitlementService mealEntitlementService;
    @Mock private ExitPermissionService exitPermissionService;

    private AccessDecisionService service;

    private static final String EXCEDEU = "EXCEDEU_TEMPO";
    private static final String USER = "9999999";
    private static final String PONTO = "REFEI1";
    private static final LocalDateTime AGORA = LocalDateTime.of(2026, 7, 13, 13, 0);

    @BeforeEach
    void setUp() {
        service = new AccessDecisionService(
                doorMappingService, userRepository, classScheduleRepository, accessLogRepository,
                new HikvisionEventClassifier(), dedupService, attemptService, new PolicyProperties(),
                mealEntitlementService, exitPermissionService);
    }

    private String validar() {
        return ReflectionTestUtils.invokeMethod(service, "validateExitTime", USER, PONTO, AGORA);
    }

    /** Registra a ultima ENTRADA como tendo ocorrido ha `duracao`. */
    private void ultimaEntradaHa(Duration duracao) {
        when(accessLogRepository.findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(
                eq(USER), eq(PONTO), eq(AccessAction.ENTRADA)))
                .thenReturn(Optional.of(AccessLog.builder()
                        .userId(USER).pointId(PONTO).action(AccessAction.ENTRADA)
                        .timestamp(AGORA.minus(duracao))
                        .build()));
    }

    @Test
    @DisplayName("sem ENTRADA anterior -> sem alerta")
    void semEntradaAnterior() {
        when(accessLogRepository.findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(
                eq(USER), eq(PONTO), eq(AccessAction.ENTRADA)))
                .thenReturn(Optional.empty());

        assertThat(validar())
                .as("saida sem entrada registrada nao e culpa do aluno — nao alerta")
                .isNull();
    }

    @Test
    @DisplayName("30 minutos dentro -> sem alerta")
    void trintaMinutos() {
        ultimaEntradaHa(Duration.ofMinutes(30));

        assertThat(validar()).isNull();
    }

    @Test
    @DisplayName("2 horas dentro -> EXCEDEU_TEMPO")
    void duasHoras() {
        ultimaEntradaHa(Duration.ofHours(2));

        assertThat(validar()).isEqualTo(EXCEDEU);
    }

    /**
     * LIMITE EXATO — este e o caso que a spec 13.2 exige explicitamente.
     * A comparacao e `inside.compareTo(MAX_CANTINA_TIME) > 0`: exatamente 1h da
     * 0, que nao e > 0, entao NAO alerta. Se alguem trocar por >=, este teste cai.
     */
    @Test
    @DisplayName("LIMITE: exatamente 1 hora -> sem alerta (compareTo > 0, nao >=)")
    void exatamenteUmaHora() {
        ultimaEntradaHa(Duration.ofHours(1));

        assertThat(validar())
                .as("1h cravada nao excede: a comparacao e estritamente maior")
                .isNull();
    }

    @Test
    @DisplayName("LIMITE: 1 hora e 1 segundo -> EXCEDEU_TEMPO")
    void umaHoraEUmSegundo() {
        ultimaEntradaHa(Duration.ofHours(1).plusSeconds(1));

        assertThat(validar()).isEqualTo(EXCEDEU);
    }

    @Test
    @DisplayName("LIMITE: 59 minutos e 59 segundos -> sem alerta")
    void quaseUmaHora() {
        ultimaEntradaHa(Duration.ofMinutes(59).plusSeconds(59));

        assertThat(validar()).isNull();
    }

    @Test
    @DisplayName("entrada no futuro (relogio do servidor mexido) -> sem alerta, sem lancar")
    void entradaNoFuturoNaoAlerta() {
        ultimaEntradaHa(Duration.ofHours(-1));

        assertThat(validar())
                .as("duracao negativa nao e > 1h — degrada em silencio")
                .isNull();
    }

    @Test
    @DisplayName("a consulta e feita pelo par (userId, pointId) e acao ENTRADA")
    void consultaEhPorUsuarioEPonto() {
        ultimaEntradaHa(Duration.ofMinutes(10));

        validar();

        org.mockito.Mockito.verify(accessLogRepository)
                .findTopByUserIdAndPointIdAndActionOrderByTimestampDesc(USER, PONTO, AccessAction.ENTRADA);
    }
}
