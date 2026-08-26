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
 *
 * ⚠️ O TETO MUDOU DE 1 HORA PARA 30 MINUTOS EM 24/08/2026, por decisao do Sam.
 * Uma hora e mais do que o servico inteiro de uma turma: o alerta quase nunca
 * disparava, e a coluna «Doit sortir» so se enchia de quem sai sem ser lido.
 *
 * ⚠️ O QUE ESTA BLINDAGEM PROTEGE NAO E O NUMERO — e a FORMA da regra, e ela
 * nao mudou:
 *   • a comparacao e estritamente MAIOR (`compareTo(...) > 0`): o valor exato
 *     do teto NAO alerta;
 *   • saida sem entrada registada nunca alerta (nao e culpa de quem passou);
 *   • duracao negativa degrada em silencio;
 *   • a consulta e pelo par (userId, pointId) com acao ENTRADA.
 * Por isso os casos-limite abaixo passaram a ser escritos CONTRA A PROPERTY e
 * nao contra um literal: se o teto voltar a mudar, eles continuam a provar a
 * mesma coisa em vez de terem de ser reescritos — e ha um teste dedicado a
 * provar que o valor vem mesmo da configuracao.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExitTimeRegressionTest {

    /** Régime de sortie desligado — ver o construtor do service no setUp. */
    private static final com.magbo.access.config.RegimeProperties REGIME_DESLIGADO =
            new com.magbo.access.config.RegimeProperties();
    static { REGIME_DESLIGADO.setHabilitado(false); }

    /**
     * Horarios e duracoes da cantina, com os defaults do application.properties.
     *
     * Cada teste que precise de outro numero muda-o AQUI, no seu proprio
     * setUp — que e o ponto de os ter tirado de `static final`: ate 24/08/2026
     * o teto de permanencia era uma constante compilada e nenhum teste podia
     * exercer outro valor sem reescrever o service.
     */
    private final com.magbo.access.config.CantineProperties cantineProperties =
            new com.magbo.access.config.CantineProperties();

    @Mock private DoorMappingService doorMappingService;
    @Mock private UserRepository userRepository;
    @Mock private ClassScheduleRepository classScheduleRepository;
    @Mock private AccessLogRepository accessLogRepository;
    @Mock private DeduplicationService dedupService;
    @Mock private AccessAttemptService attemptService;
    @Mock private MealEntitlementService mealEntitlementService;
    @Mock private ExitPermissionService exitPermissionService;
    @Mock private SamePassageService samePassageService;

    /**
     * ⚠️ A janela da cantina saiu daqui para o `MealSlotService` (V021).
     *
     * O default do mock e DENTRO — nao por comodidade, mas porque e o que
     * PRESERVA o que estes testes provavam: no comportamento antigo, uma turma
     * sem grade devolvia `null` (sem flag, sem tentativa registada), que e
     * exatamente o efeito de DENTRO. Um mock a devolver `null` faria
     * `janela.naoConfigurado()` estourar em NullPointerException e trocaria
     * dezenas de falhas verdadeiras por uma falha de andaime.
     *
     * Quem prova a REGRA nova e o `MealSlotServiceTest` e o `MealSlotWiringTest`.
     */
    @Mock private MealSlotService mealSlotService;

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
                mealEntitlementService, exitPermissionService, samePassageService,
                new PostoFixoService(accessLogRepository),
                // Real sobre repositorio mock, como o PostoFixoService: nestes
                // cenarios nao ha log anterior, entao ele devolve null sem
                // decidir nada — e o teste passa a cobrir tambem esse caminho.
                new PresencaAbertaService(accessLogRepository),
                // Régime de sortie DESLIGADO nestes cenarios, de proposito.
                // Estes testes sao anteriores a regra e provam OUTRA coisa; com
                // habilitado=false o servico retorna na primeira linha sem tocar
                // dependencia nenhuma (por isso os nulos), e o que eles provavam
                // continua provado sem ruido novo. A fiacao do regime tem teste
                // proprio: RegimeGateWiringTest.
                new RegimeSortieService(null, null, null, null, null, null, REGIME_DESLIGADO, null),
                cantineProperties, mealSlotService);
        // Ver o javadoc do campo: DENTRO preserva o efeito do comportamento antigo.
        org.mockito.Mockito.lenient().when(mealSlotService.resolver(
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new MealSlotService.Resultado(
                        MealSlotService.Veredicto.DENTRO, null, java.util.List.of(), false));
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
    @DisplayName("20 minutos dentro -> sem alerta (uma refeicao normal)")
    void vinteMinutos() {
        ultimaEntradaHa(Duration.ofMinutes(20));

        assertThat(validar()).isNull();
    }

    @Test
    @DisplayName("★★★ 40 minutos dentro -> EXCEDEU_TEMPO (com o teto antigo de 1h, nao alertava)")
    void quarentaMinutos() {
        // O caso que motivou a mudanca: 40 minutos no refeitorio passavam
        // despercebidos porque o teto era uma hora.
        ultimaEntradaHa(Duration.ofMinutes(40));

        assertThat(validar()).isEqualTo(EXCEDEU);
    }

    @Test
    @DisplayName("2 horas dentro -> EXCEDEU_TEMPO")
    void duasHoras() {
        ultimaEntradaHa(Duration.ofHours(2));

        assertThat(validar()).isEqualTo(EXCEDEU);
    }

    /**
     * LIMITE EXATO — o caso que a spec 13.2 exige explicitamente.
     * A comparacao e `inside.compareTo(...) > 0`: o teto cravado da 0, que nao
     * e > 0, entao NAO alerta. Se alguem trocar por >=, este teste cai.
     *
     * Escrito contra a property e nao contra um literal: o que se blinda e a
     * comparacao estrita, que vale seja qual for o teto configurado.
     */
    @Test
    @DisplayName("LIMITE: exatamente o teto -> sem alerta (compareTo > 0, nao >=)")
    void exatamenteNoTeto() {
        ultimaEntradaHa(cantineProperties.duracaoMaxima());

        assertThat(validar())
                .as("o teto cravado nao excede: a comparacao e estritamente maior")
                .isNull();
    }

    @Test
    @DisplayName("LIMITE: o teto mais um segundo -> EXCEDEU_TEMPO")
    void tetoMaisUmSegundo() {
        ultimaEntradaHa(cantineProperties.duracaoMaxima().plusSeconds(1));

        assertThat(validar()).isEqualTo(EXCEDEU);
    }

    @Test
    @DisplayName("LIMITE: um segundo antes do teto -> sem alerta")
    void umSegundoAntesDoTeto() {
        ultimaEntradaHa(cantineProperties.duracaoMaxima().minusSeconds(1));

        assertThat(validar()).isNull();
    }

    /**
     * ⚠️ O TESTE QUE PROVA QUE O NUMERO VEM MESMO DA CONFIGURACAO.
     *
     * Sem ele, `duracaoMaxima()` podia devolver um valor fixo e todos os
     * limites acima continuariam verdes — provariam a forma da comparacao e
     * nada sobre a origem do numero, que e exatamente o que esta entrega mudou.
     */
    @Test
    @DisplayName("★★★ o teto vem da property: com 45 min configurados, 46 alerta e 45 nao")
    void oTetoVemDaProperty() {
        cantineProperties.setDuracaoMaximaMinutos(45);

        ultimaEntradaHa(Duration.ofMinutes(45));
        assertThat(validar())
                .as("45 min com o teto em 45: nao excede")
                .isNull();

        ultimaEntradaHa(Duration.ofMinutes(46));
        assertThat(validar())
                .as("46 min com o teto em 45: excede — o numero NAO esta compilado")
                .isEqualTo(EXCEDEU);
    }

    @Test
    @DisplayName("★★ o default do service e o default do application.properties: 30 min")
    void defaultSaoTrintaMinutos() {
        // Espelho vivo do que esta em application.properties. Se alguem mudar
        // um sem o outro, isto cai — e a alternativa era descobri-lo em
        // producao, com a coluna cheia ou vazia sem explicacao.
        assertThat(cantineProperties.duracaoMaxima()).isEqualTo(Duration.ofMinutes(30));
    }

    @Test
    @DisplayName("entrada no futuro (relogio do servidor mexido) -> sem alerta, sem lancar")
    void entradaNoFuturoNaoAlerta() {
        ultimaEntradaHa(Duration.ofHours(-1));

        assertThat(validar())
                .as("duracao negativa nao excede teto nenhum — degrada em silencio")
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
