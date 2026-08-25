package com.magbo.access.services;

import com.magbo.access.models.*;
import com.magbo.access.repositories.MealSlotClassRepository;
import com.magbo.access.repositories.MealSlotRepository;
import com.magbo.access.repositories.MealSlotStudentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * A JANELA DA CANTINA, DEPOIS DE O PLANNING VIRAR CONFIGURACAO (V021).
 *
 * ⚠️ Cada teste aqui e uma forma de o sistema acusar uma crianca do que ele
 * nao sabe, ou de a deixar passar por engano. A afixacao da Vie Scolaire muda
 * todo ano; estas regras nao.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("MealSlotService — em que creneau esta pessoa come")
class MealSlotServiceTest {

    @Mock private MealSlotRepository slotRepository;
    @Mock private MealSlotClassRepository classRepository;
    @Mock private MealSlotStudentRepository studentRepository;

    private MealSlotService service;

    // Terca-feira, 25/08/2026 — o dia em que a afixacao poe 1E2 e 1E3 nos DOIS
    // passagens. Fixo: um teste que dependa do dia em que alguem o roda nao
    // prova nada.
    private static final LocalDateTime TERCA_1235 = LocalDateTime.of(2026, 8, 25, 12, 35);
    private static final short TERCA = 2;

    private static final MealSlot P1230 = MealSlot.builder()
            .id(1L).diaSemana(TERCA).hora(LocalTime.of(12, 30))
            .toleranciaAntesMinutos((short) 15).toleranciaDepoisMinutos((short) 45)
            .rotulo("12H30 — prioritaire").ordem((short) 1).ativo(true).build();

    private static final MealSlot P1300 = MealSlot.builder()
            .id(2L).diaSemana(TERCA).hora(LocalTime.of(13, 0))
            .toleranciaAntesMinutos((short) 15).toleranciaDepoisMinutos((short) 45)
            .rotulo("13H00 — secondaire").ordem((short) 2).ativo(true).build();

    @BeforeEach
    void setUp() {
        service = new MealSlotService(slotRepository, classRepository, studentRepository);
        when(slotRepository.findAllById(any())).thenAnswer(i -> {
            List<Long> ids = i.getArgument(0);
            return List.of(P1230, P1300).stream().filter(s -> ids.contains(s.getId())).toList();
        });
    }

    private User aluno(String id, String turma) {
        return User.builder().id(id).nome("Aluno " + id).tipo(UserType.ALUNO).turma(turma).build();
    }

    private void turmaNosSlots(String turma, Long... slotIds) {
        when(classRepository.doDia(eq(turma), eq(TERCA))).thenReturn(
                java.util.Arrays.stream(slotIds)
                        .map(sid -> MealSlotClass.builder().slotId(sid).turma(turma).build())
                        .toList());
    }

    @Nested
    @DisplayName("o creneau da turma")
    class PelaTurma {

        @Test
        @DisplayName("★★★ 12h35 com creneau das 12h30: DENTRO")
        void dentroDoCreneau() {
            turmaNosSlots("1E1", 1L);
            var r = service.resolver(aluno("0001", "1E1"), TERCA_1235);
            assertThat(r.dentro()).isTrue();
            assertThat(r.creneau().getId()).isEqualTo(1L);
        }

        @Test
        @DisplayName("★★★ UMA TURMA EM DOIS CRENEAUX NO MESMO DIA — o facto que ditou o modelo")
        void turmaEmDoisCreneaux() {
            // Terca-feira, afixacao 2026: a 1ere 2 esta nos DOIS passagens,
            // porque metade do grupo come as 12h30 e a outra metade as 13h00.
            // Basta UM casar. Exigir os dois negaria as duas metades ao mesmo
            // tempo; permitir so o primeiro negaria a segunda metade todos os
            // dias.
            turmaNosSlots("1E2", 1L, 2L);

            assertThat(service.resolver(aluno("0002", "1E2"),
                    LocalDateTime.of(2026, 8, 25, 12, 35)).dentro()).isTrue();
            assertThat(service.resolver(aluno("0002", "1E2"),
                    LocalDateTime.of(2026, 8, 25, 13, 10)).dentro()).isTrue();
        }

        @Test
        @DisplayName("★★ 10h00, muito antes de tudo: FORA — e diz de QUAL creneau se desviou")
        void foraDaJanela() {
            turmaNosSlots("1E1", 1L);
            var r = service.resolver(aluno("0001", "1E1"), LocalDateTime.of(2026, 8, 25, 10, 0));
            assertThat(r.veredicto()).isEqualTo(MealSlotService.Veredicto.FORA);
            assertThat(r.creneau())
                    .as("um alerta que nao diz de que horario se desviou obriga a ir ver a afixacao")
                    .isNotNull();
        }

        @Test
        @DisplayName("★★ a tolerancia vale dos DOIS lados, e vem do creneau")
        void tolerancia() {
            turmaNosSlots("1E1", 1L);   // 12:30, -15min / +45min
            // 12:15 = exatamente o limite de tras
            assertThat(service.resolver(aluno("0001", "1E1"),
                    LocalDateTime.of(2026, 8, 25, 12, 15)).dentro()).isTrue();
            // 12:14 = um minuto cedo demais
            assertThat(service.resolver(aluno("0001", "1E1"),
                    LocalDateTime.of(2026, 8, 25, 12, 14)).dentro()).isFalse();
            // 13:15 = exatamente o limite da frente
            assertThat(service.resolver(aluno("0001", "1E1"),
                    LocalDateTime.of(2026, 8, 25, 13, 15)).dentro()).isTrue();
            // 13:16 = um minuto tarde demais
            assertThat(service.resolver(aluno("0001", "1E1"),
                    LocalDateTime.of(2026, 8, 25, 13, 16)).dentro()).isFalse();
        }

        @Test
        @DisplayName("★★ um creneau DESATIVADO nao conta")
        void creneauDesativado() {
            MealSlot off = MealSlot.builder().id(9L).diaSemana(TERCA)
                    .hora(LocalTime.of(12, 30)).toleranciaAntesMinutos((short) 15)
                    .toleranciaDepoisMinutos((short) 45).ativo(false).build();
            // ⚠️ doReturn e nao when(...): `when(mock.metodo(any()))` INVOCA o
            // stub anterior do setUp, que aqui recebe null e estoura. O erro
            // seria do andaime, nao do codigo.
            org.mockito.Mockito.doReturn(List.of(off)).when(slotRepository).findAllById(any());
            turmaNosSlots("1E1", 9L);

            assertThat(service.resolver(aluno("0001", "1E1"), TERCA_1235).naoConfigurado())
                    .as("desativar o creneau nao pode passar a acusar quem chega na hora")
                    .isTrue();
        }
    }

    @Nested
    @DisplayName("a excecao do aluno")
    class PorExcecao {

        @Test
        @DisplayName("★★★ A EXCECAO SUBSTITUI A TURMA, e nao se soma a ela")
        void excecaoSubstitui() {
            // O aluno de Terminale movido para o segundo passagem DEIXOU de
            // pertencer ao primeiro. Somar as duas janelas deixaria a janela
            // mais larga do que qualquer humano escreveu, e a excecao passaria
            // a nao restringir nada — que e o contrario do que ela e.
            turmaNosSlots("T1", 1L);    // a turma come as 12h30
            when(studentRepository.doDia(eq("0003"), eq(TERCA))).thenReturn(
                    List.of(MealSlotStudent.builder().userId("0003").slotId(2L)
                            .createdBy("vie.scolaire").build()));   // ele, as 13h00

            assertThat(service.resolver(aluno("0003", "T1"),
                    LocalDateTime.of(2026, 8, 25, 13, 10)).dentro())
                    .as("a excecao vale").isTrue();

            var noHorarioDaTurma = service.resolver(aluno("0003", "T1"),
                    LocalDateTime.of(2026, 8, 25, 12, 35));
            assertThat(noHorarioDaTurma.dentro())
                    .as("a janela da TURMA ja nao vale para ele")
                    .isFalse();
            assertThat(noHorarioDaTurma.porExcecao()).isTrue();
        }

        @Test
        @DisplayName("★★ sem excecao nesse dia, vale a turma")
        void semExcecaoValeATurma() {
            turmaNosSlots("T1", 1L);
            when(studentRepository.doDia(eq("0003"), eq(TERCA))).thenReturn(List.of());
            var r = service.resolver(aluno("0003", "T1"), TERCA_1235);
            assertThat(r.dentro()).isTrue();
            assertThat(r.porExcecao()).isFalse();
        }
    }

    @Nested
    @DisplayName("nao configurado — a pergunta ao adulto, nunca a sancao a crianca")
    class NaoConfigurado {

        @Test
        @DisplayName("★★★ turma sem creneau: NAO_CONFIGURADO, jamais FORA")
        void turmaSemCreneau() {
            when(classRepository.doDia(any(), any())).thenReturn(List.of());
            var r = service.resolver(aluno("0009", "TURMA-NOVA"), TERCA_1235);
            assertThat(r.naoConfigurado()).isTrue();
            assertThat(r.veredicto())
                    .as("confundir «nao sei» com «nao pode» transforma ignorancia em sancao")
                    .isNotEqualTo(MealSlotService.Veredicto.FORA);
        }

        @Test
        @DisplayName("★★★ NAO E ALUNO: NAO_APLICAVEL, e nem sequer uma pergunta")
        void servidorNaoEntraNaGrade() {
            // ⚠️ ~200 servidores × 2 refeicoes = 400 linhas/dia a dizer que
            // falta configurar uma coisa que nao existe. E a licao do INCONNU
            // do regime: o rasto que afoga e pior do que rasto nenhum.
            for (UserType t : List.of(UserType.FUNCIONARIO, UserType.PROFESSOR)) {
                User servidor = User.builder().id("FUNC-001").nome("X").tipo(t).build();
                var r = service.resolver(servidor, TERCA_1235);
                assertThat(r.naoAplicavel()).as("tipo %s", t).isTrue();
                assertThat(r.naoConfigurado()).as("tipo %s nao gera pergunta", t).isFalse();
            }
        }

        @Test
        @DisplayName("★★ aluno SEM turma: NAO_APLICAVEL (cadastro incompleto, nao planning por preencher)")
        void alunoSemTurma() {
            assertThat(service.resolver(aluno("0010", null), TERCA_1235).naoAplicavel()).isTrue();
            assertThat(service.resolver(aluno("0010", "  "), TERCA_1235).naoAplicavel()).isTrue();
        }

        @Test
        @DisplayName("★ user ou hora nulos nao estouram")
        void nulos() {
            assertThat(service.resolver(null, TERCA_1235).naoAplicavel()).isTrue();
            assertThat(service.resolver(aluno("0001", "1E1"), null).naoAplicavel()).isTrue();
        }
    }

    @Nested
    @DisplayName("o relogio")
    class Relogio {

        @Test
        @DisplayName("★★★ o DIA vem da hora recebida — uma fila esvaziada noutro dia nao muda de creneau")
        void diaVemDaHoraRecebida() {
            // Segunda-feira, mesma hora. Se o servico usasse `now`, uma
            // passagem de segunda processada na terca seria julgada pela grade
            // de terca — e a afixacao e DIFERENTE em cada dia.
            turmaNosSlots("1E1", 1L);
            when(classRepository.doDia(eq("1E1"), eq((short) 1))).thenReturn(List.of());

            var segunda = service.resolver(aluno("0001", "1E1"),
                    LocalDateTime.of(2026, 8, 24, 12, 35));
            assertThat(segunda.naoConfigurado())
                    .as("o dia da semana tem de sair da hora do EVENTO")
                    .isTrue();
        }
    }
}
