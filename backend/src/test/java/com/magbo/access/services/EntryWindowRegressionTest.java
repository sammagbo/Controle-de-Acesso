package com.magbo.access.services;

import com.magbo.access.config.PolicyProperties;
import com.magbo.access.models.ClassSchedule;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.ClassScheduleRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * BLINDAGEM — congela a janela de entrada da cantina, validada com hardware
 * ao longo de 4 dias de testes e movida na Fase B. Se algum caso aqui mudar,
 * a mudanca precisa ser uma DECISAO, nao um efeito colateral.
 *
 * POR QUE REFLEXAO: validateEntryWindow e parseHour sao private e a Fase I nao
 * pode alterar codigo de producao. Dirigir por process() nao serve: o unico
 * observavel de fora e o campo `flag`, e tres comportamentos distintos
 * (sem schedule / hora nao-parseavel / dentro da janela) colapsam todos em
 * flag==null — indistinguiveis. A spec 13.2 exige parseHour("11H00")->11:00 e
 * hora invalida->null, que so sao expressaveis por dentro.
 *
 * LIMITE ASSUMIDO: reflexao congela a FUNCAO, nao a FIACAO — continuaria verde
 * se process() parasse de chamar o metodo. Essa lacuna e coberta por
 * AccessDecisionServiceTest#flagForaHorarioChegaAoAccessLog.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EntryWindowRegressionTest {

    @Mock private DoorMappingService doorMappingService;
    @Mock private UserRepository userRepository;
    @Mock private ClassScheduleRepository classScheduleRepository;
    @Mock private AccessLogRepository accessLogRepository;
    @Mock private DeduplicationService dedupService;
    @Mock private AccessAttemptService attemptService;
    @Mock private MealEntitlementService mealEntitlementService;
    @Mock private ExitPermissionService exitPermissionService;

    private AccessDecisionService service;

    private static final String FORA_HORARIO = "FORA_HORARIO";
    /** 13/07/2026 e uma SEGUNDA-feira — o dia usa lun_midi. */
    private static final LocalDate SEGUNDA = LocalDate.of(2026, 7, 13);

    @BeforeEach
    void setUp() {
        service = new AccessDecisionService(
                doorMappingService, userRepository, classScheduleRepository, accessLogRepository,
                new HikvisionEventClassifier(), dedupService, attemptService, new PolicyProperties(),
                mealEntitlementService, exitPermissionService);
    }

    private String validar(User user, LocalTime hora) {
        return ReflectionTestUtils.invokeMethod(
                service, "validateEntryWindow", user, LocalDateTime.of(SEGUNDA, hora));
    }

    // ───────────────── Turmas Lycee: janela fixa 11h-15h ─────────────────

    @ParameterizedTest
    @ValueSource(strings = {"T1", "T2", "1E1", "1E2", "1E3", "2E1", "2E2", "2E3"})
    @DisplayName("Lycee ao meio-dia -> sem alerta (todas as 8 turmas)")
    void lyceeDentroDaJanela(String turma) {
        assertThat(validar(aluno(turma), LocalTime.of(12, 0))).isNull();
    }

    @Test
    @DisplayName("Lycee as 10h59 -> FORA_HORARIO")
    void lyceeAntesDas11() {
        assertThat(validar(aluno("T1"), LocalTime.of(10, 59))).isEqualTo(FORA_HORARIO);
    }

    @Test
    @DisplayName("Lycee as 15h01 -> FORA_HORARIO")
    void lyceeDepoisDas15() {
        assertThat(validar(aluno("T1"), LocalTime.of(15, 1))).isEqualTo(FORA_HORARIO);
    }

    @Test
    @DisplayName("LIMITE: Lycee exatamente as 11h00 -> sem alerta (inicio inclusivo)")
    void lyceeExatamenteAs11() {
        assertThat(validar(aluno("T1"), LocalTime.of(11, 0)))
                .as("isBefore(11:00) e falso as 11:00 — o limite entra na janela")
                .isNull();
    }

    @Test
    @DisplayName("LIMITE: Lycee exatamente as 15h00 -> sem alerta (fim inclusivo)")
    void lyceeExatamenteAs15() {
        assertThat(validar(aluno("T1"), LocalTime.of(15, 0)))
                .as("isAfter(15:00) e falso as 15:00 — o limite entra na janela")
                .isNull();
    }

    @Test
    @DisplayName("Lycee ignora class_schedule: a janela fixa vence")
    void lyceeIgnoraSchedule() {
        when(classScheduleRepository.findById("T1"))
                .thenReturn(Optional.of(schedule("T1", "N")));

        assertThat(validar(aluno("T1"), LocalTime.of(12, 0)))
                .as("turma Lycee nem consulta o schedule")
                .isNull();
    }

    // ───────────────── Outras turmas: horario da turma + 1h ─────────────────

    @Test
    @DisplayName("turma com 'N' no dia -> FORA_HORARIO (dia sem refeicao)")
    void turmaComDiaSemRefeicao() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "N")));

        assertThat(validar(aluno("6A"), LocalTime.of(12, 0))).isEqualTo(FORA_HORARIO);
    }

    @Test
    @DisplayName("turma com 'n' minusculo -> FORA_HORARIO (comparacao ignora caixa)")
    void turmaComDiaSemRefeicaoMinusculo() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "n")));

        assertThat(validar(aluno("6A"), LocalTime.of(12, 0))).isEqualTo(FORA_HORARIO);
    }

    @Test
    @DisplayName("turma com horario vazio no dia -> FORA_HORARIO")
    void turmaComHorarioVazio() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "")));

        assertThat(validar(aluno("6A"), LocalTime.of(12, 0))).isEqualTo(FORA_HORARIO);
    }

    @Test
    @DisplayName("turma SEM schedule cadastrado -> sem alerta (nao alerta o que nao conhece)")
    void turmaSemSchedule() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.empty());

        assertThat(validar(aluno("6A"), LocalTime.of(3, 0)))
                .as("sem horario definido, nem as 3h da manha alerta")
                .isNull();
    }

    @Test
    @DisplayName("aluno sem turma -> sem alerta")
    void alunoSemTurma() {
        assertThat(validar(aluno(null), LocalTime.of(3, 0))).isNull();
    }

    // ───────────────── Janela = hora da turma + 1h ─────────────────

    @Test
    @DisplayName("turma 11H00, chegada 11h30 -> dentro da janela")
    void dentroDaJanelaDaTurma() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "11H00")));

        assertThat(validar(aluno("6A"), LocalTime.of(11, 30))).isNull();
    }

    @Test
    @DisplayName("LIMITE: turma 11H00, chegada exatamente 11h00 -> dentro (inicio inclusivo)")
    void exatamenteNoInicioDaJanelaDaTurma() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "11H00")));

        assertThat(validar(aluno("6A"), LocalTime.of(11, 0))).isNull();
    }

    @Test
    @DisplayName("LIMITE: turma 11H00, chegada exatamente 12h00 -> dentro (janela = hora + 1h, fim inclusivo)")
    void exatamenteNoFimDaJanelaDaTurma() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "11H00")));

        assertThat(validar(aluno("6A"), LocalTime.of(12, 0)))
                .as("windowEnd = 11:00 + 1h = 12:00; isAfter(12:00) e falso as 12:00")
                .isNull();
    }

    @Test
    @DisplayName("turma 11H00, chegada 12h01 -> FORA_HORARIO (1 minuto depois do fim)")
    void umMinutoDepoisDoFim() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "11H00")));

        assertThat(validar(aluno("6A"), LocalTime.of(12, 1))).isEqualTo(FORA_HORARIO);
    }

    @Test
    @DisplayName("turma 11H00, chegada 10h59 -> FORA_HORARIO (1 minuto antes do inicio)")
    void umMinutoAntesDoInicio() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "11H00")));

        assertThat(validar(aluno("6A"), LocalTime.of(10, 59))).isEqualTo(FORA_HORARIO);
    }

    @Test
    @DisplayName("turma 12H30, chegada 13h00 -> dentro (meia hora tambem e respeitada)")
    void turmaComMeiaHora() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "12H30")));

        assertThat(validar(aluno("6A"), LocalTime.of(13, 0))).isNull();
        assertThat(validar(aluno("6A"), LocalTime.of(13, 31))).isEqualTo(FORA_HORARIO);
    }

    @Test
    @DisplayName("hora invalida no schedule -> sem alerta (nao lanca, degrada em silencio)")
    void horaInvalidaNaoAlerta() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "XX:YY")));

        assertThat(validar(aluno("6A"), LocalTime.of(3, 0)))
                .as("parseHour devolve null e a regra desiste de alertar, sem quebrar o webhook")
                .isNull();
    }

    // ───────────────── Dia da semana ─────────────────

    @Test
    @DisplayName("cada dia util le a sua propria coluna do schedule")
    void cadaDiaLeSuaColuna() {
        ClassSchedule s = ClassSchedule.builder()
                .classe("6A")
                .lunMidi("11H00")   // segunda: com refeicao
                .marMidi("N")       // terca: sem
                .merMidi("11H00")
                .jeuMidi("N")
                .venMidi("11H00")
                .build();
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(s));

        // 13/07/2026 = segunda ... 17/07/2026 = sexta
        assertThat(emDia(LocalDate.of(2026, 7, 13))).as("segunda (lun=11H00)").isNull();
        assertThat(emDia(LocalDate.of(2026, 7, 14))).as("terca (mar=N)").isEqualTo(FORA_HORARIO);
        assertThat(emDia(LocalDate.of(2026, 7, 15))).as("quarta (mer=11H00)").isNull();
        assertThat(emDia(LocalDate.of(2026, 7, 16))).as("quinta (jeu=N)").isEqualTo(FORA_HORARIO);
        assertThat(emDia(LocalDate.of(2026, 7, 17))).as("sexta (ven=11H00)").isNull();
    }

    @Test
    @DisplayName("fim de semana -> FORA_HORARIO (nao ha coluna de sabado/domingo)")
    void fimDeSemanaAlerta() {
        when(classScheduleRepository.findById("6A")).thenReturn(Optional.of(schedule("6A", "11H00")));

        assertThat(emDia(LocalDate.of(2026, 7, 18))).as("sabado").isEqualTo(FORA_HORARIO);
        assertThat(emDia(LocalDate.of(2026, 7, 19))).as("domingo").isEqualTo(FORA_HORARIO);
    }

    private String emDia(LocalDate dia) {
        return ReflectionTestUtils.invokeMethod(
                service, "validateEntryWindow", aluno("6A"), LocalDateTime.of(dia, LocalTime.of(11, 30)));
    }

    // ───────────────── parseHour ─────────────────

    @ParameterizedTest
    @CsvSource({
            "11H00, 11, 0",
            "12H30, 12, 30",
            "13H00, 13, 0",
            "11h00, 11, 0",
            "09H15, 9, 15"
    })
    @DisplayName("parseHour aceita o formato 'HHhMM' do Pronote")
    void parseHourAceitaFormatoDaEscola(String entrada, int hora, int minuto) {
        LocalTime r = ReflectionTestUtils.invokeMethod(service, "parseHour", entrada);

        assertThat(r).isEqualTo(LocalTime.of(hora, minuto));
    }

    @ParameterizedTest
    @ValueSource(strings = {"XX:YY", "25H00", "abc", "11", "H", "11H60"})
    @DisplayName("parseHour devolve null para entrada invalida, sem lancar")
    void parseHourInvalidoDevolveNull(String entrada) {
        assertThat((LocalTime) ReflectionTestUtils.invokeMethod(service, "parseHour", entrada)).isNull();
    }

    @Test
    @DisplayName("parseHour de vazio -> null")
    void parseHourVazio() {
        assertThat((LocalTime) ReflectionTestUtils.invokeMethod(service, "parseHour", "")).isNull();
    }

    // ───────────────── Helpers ─────────────────

    private static User aluno(String turma) {
        return User.builder()
                .id("9999999").nome("Teste").tipo(UserType.ALUNO)
                .turma(turma).ativo(true).hikvisionEmployeeId("9999999")
                .build();
    }

    /** Schedule com o mesmo valor em todos os dias uteis. */
    private static ClassSchedule schedule(String classe, String valor) {
        return ClassSchedule.builder()
                .classe(classe)
                .lunMidi(valor).marMidi(valor).merMidi(valor).jeuMidi(valor).venMidi(valor)
                .build();
    }
}
