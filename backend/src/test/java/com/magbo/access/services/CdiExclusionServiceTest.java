package com.magbo.access.services;

import com.magbo.access.models.CdiExclusion;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.CdiExclusionRepository;
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

import java.time.*;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * LES EXCLUSIONS DU CDI — prévenir, jamais empêcher.
 *
 * ⚠️ Chaque test ici est une façon d'accuser un enfant à tort, ou de laisser
 * un adulte sans l'information dont il a besoin au moment où l'enfant est
 * devant lui.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("CdiExclusionService — qui est exclu, et jusqu'à quand")
class CdiExclusionServiceTest {

    @Mock private CdiExclusionRepository repository;

    private CdiExclusionService service;

    private static final ZoneId ZONA = ZoneId.of("America/Sao_Paulo");
    private static final LocalDate HOJE = LocalDate.of(2026, 8, 27);
    private static final LocalDateTime MEIODIA = HOJE.atTime(12, 0);

    @BeforeEach
    void setUp() {
        service = new CdiExclusionService(repository);
        ReflectionTestUtils.setField(service, "clock",
                Clock.fixed(MEIODIA.atZone(ZONA).toInstant(), ZONA));
        when(repository.save(any(CdiExclusion.class))).thenAnswer(i -> i.getArgument(0));
    }

    private static User aluno(String id, String turma) {
        return User.builder().id(id).nome("A " + id).tipo(UserType.ALUNO).turma(turma).build();
    }

    private static CdiExclusion excl(String userId, String turma, LocalDate ate) {
        return CdiExclusion.builder().id(1L).userId(userId).turma(turma).ate(ate)
                .criadoPor("cdi").criadoEm(MEIODIA.minusDays(1)).build();
    }

    @Nested
    @DisplayName("le verdict")
    class Verdict {

        @Test
        @DisplayName("★★★ élève exclu sans date de fin : exclu aujourd'hui, et demain")
        void semDataDeFim() {
            when(repository.findByRevogadoEmIsNull()).thenReturn(List.of(excl("0001", null, null)));
            assertThat(service.avaliar(aluno("0001", "6E1"), MEIODIA).excluido()).isTrue();
            assertThat(service.avaliar(aluno("0001", "6E1"), MEIODIA.plusDays(30)).excluido()).isTrue();
        }

        @Test
        @DisplayName("★★★ `ate` est INCLUSIF — «jusqu'à vendredi» inclut vendredi")
        void ateEInclusivo() {
            // Une borne exclusive ferait finir l'exclusion un jour avant ce que
            // l'adulte qui l'a écrite avait en tête, et personne ne le verrait.
            when(repository.findByRevogadoEmIsNull()).thenReturn(List.of(excl("0001", null, HOJE)));
            assertThat(service.avaliar(aluno("0001", "6E1"), MEIODIA).excluido())
                    .as("le dernier jour compte encore").isTrue();
            assertThat(service.avaliar(aluno("0001", "6E1"), MEIODIA.plusDays(1)).excluido()).isFalse();
        }

        @Test
        @DisplayName("★★★ exclusion de TURMA : tous ses élèves, et le verdict le DIT")
        void exclusaoDeTurma() {
            when(repository.findByRevogadoEmIsNull()).thenReturn(List.of(excl(null, "6E1", null)));
            var v = service.avaliar(aluno("0009", "6E1"), MEIODIA);
            assertThat(v.excluido()).isTrue();
            assertThat(v.porTurma())
                    .as("l'adulte doit savoir si c'est cet enfant ou toute la classe — "
                            + "la conversation qu'il va avoir n'est pas la même")
                    .isTrue();
            assertThat(service.avaliar(aluno("0009", "6E2"), MEIODIA).excluido()).isFalse();
        }

        @Test
        @DisplayName("★★ l'individuelle passe AVANT celle de la classe")
        void individualVenceATurma() {
            when(repository.findByRevogadoEmIsNull()).thenReturn(List.of(
                    excl(null, "6E1", null), excl("0001", null, null)));
            assertThat(service.avaliar(aluno("0001", "6E1"), MEIODIA).porTurma()).isFalse();
        }

        @Test
        @DisplayName("★★★ LEVÉE = plus jamais exclu, même le jour même")
        void levantadaNaoConta() {
            CdiExclusion e = excl("0001", null, null);
            e.setRevogadoEm(MEIODIA.minusHours(1));
            // findByRevogadoEmIsNull ne devrait même pas la rendre ; la garde
            // dans ativaEm est la ceinture par-dessus les bretelles.
            when(repository.findByRevogadoEmIsNull()).thenReturn(List.of(e));
            assertThat(service.avaliar(aluno("0001", "6E1"), MEIODIA).excluido()).isFalse();
        }

        @Test
        @DisplayName("★★★ le verdict suit l'heure de l'ÉVÉNEMENT, pas celle du traitement")
        void relogioDoEvento() {
            // File offline vidée à 18h contenant des passages de midi : jugée
            // par `now`, une exclusion terminée aujourd'hui ferait paraître
            // permis un passage d'hier. Quatrième défaut d'horloge évité.
            when(repository.findByRevogadoEmIsNull())
                    .thenReturn(List.of(excl("0001", null, HOJE.minusDays(1))));
            assertThat(service.avaliar(aluno("0001", "6E1"), MEIODIA.minusDays(2)).excluido())
                    .as("le passage d'avant-hier tombait dans l'exclusion")
                    .isTrue();
            assertThat(service.avaliar(aluno("0001", "6E1"), MEIODIA).excluido()).isFalse();
        }

        @Test
        @DisplayName("★ personne sans turma, ou nulle : jamais exclue par erreur")
        void semTurma() {
            when(repository.findByRevogadoEmIsNull()).thenReturn(List.of(excl(null, "6E1", null)));
            assertThat(service.avaliar(aluno("0001", null), MEIODIA).excluido()).isFalse();
            assertThat(service.avaliar(aluno("0001", "  "), MEIODIA).excluido()).isFalse();
            assertThat(service.avaliar(null, MEIODIA).excluido()).isFalse();
        }

        @Test
        @DisplayName("★ la turma est comparée sans casse ni espaces")
        void turmaNormalizada() {
            when(repository.findByRevogadoEmIsNull()).thenReturn(List.of(excl(null, "TPS/PS A", null)));
            assertThat(service.avaliar(aluno("0001", " tps/ps a "), MEIODIA).excluido()).isTrue();
        }
    }

    @Nested
    @DisplayName("créer et lever")
    class Escrita {

        @Test
        @DisplayName("★★★ UN élève OU UNE turma — jamais les deux, jamais aucun")
        void umOuOutro() {
            assertThatThrownBy(() -> service.criar("0001", "6E1", null, null, "cdi"))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> service.criar(null, null, null, null, "cdi"))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThat(service.criar("0001", null, null, null, "cdi").getUserId()).isEqualTo("0001");
            assertThat(service.criar(null, "6e1", null, null, "cdi").getTurma()).isEqualTo("6E1");
        }

        @Test
        @DisplayName("★★★ une exclusion qui naît EXPIRÉE est refusée")
        void naoNasceExpirada() {
            // Elle n'avertirait jamais personne : c'est presque à coup sûr une
            // faute de frappe, et la refuser est plus utile que l'enregistrer
            // inerte.
            assertThatThrownBy(() -> service.criar("0001", null, null, HOJE.minusDays(1), "cdi"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("ja passou");
            // Aujourd'hui même reste valide (le jour compte).
            assertThat(service.criar("0001", null, null, HOJE, "cdi")).isNotNull();
        }

        @Test
        @DisplayName("★★ le motif est FACULTATIF, et coupé au plafond de la colonne")
        void motivoFacultativo() {
            assertThat(service.criar("0001", null, null, null, "cdi").getMotivo()).isNull();
            assertThat(service.criar("0001", null, "  ", null, "cdi").getMotivo()).isNull();
            assertThat(service.criar("0001", null, "x".repeat(400), null, "cdi").getMotivo())
                    .hasSize(255);
        }

        @Test
        @DisplayName("★★★ lever est SOFT : la ligne reste, l'auteur de la création reste")
        void levantarESoft() {
            CdiExclusion viva = excl("0001", null, null);
            viva.setCriadoPor("bibliothecaire");
            when(repository.findById(1L)).thenReturn(java.util.Optional.of(viva));

            service.levantar(1L, "cpe");

            verify(repository, never()).delete(any());
            verify(repository, never()).deleteById(any());
            assertThat(viva.getRevogadoPor()).isEqualTo("cpe");
            assertThat(viva.getRevogadoEm()).isEqualTo(MEIODIA);
            assertThat(viva.getCriadoPor())
                    .as("une mesure prise sur un enfant est une preuve : lever ne l'efface pas")
                    .isEqualTo("bibliothecaire");
        }

        @Test
        @DisplayName("★★ lever deux fois : idempotent, le premier reste l'auteur")
        void levantarDuasVezes() {
            CdiExclusion ja = excl("0001", null, null);
            ja.setRevogadoEm(MEIODIA.minusHours(2));
            ja.setRevogadoPor("primeiro");
            when(repository.findById(1L)).thenReturn(java.util.Optional.of(ja));
            service.levantar(1L, "segundo");
            assertThat(ja.getRevogadoPor()).isEqualTo("primeiro");
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("★ auteur en blanc refusé — une sanction sans auteur n'existe pas")
        void autorObrigatorio() {
            assertThatThrownBy(() -> service.criar("0001", null, null, null, " "))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> service.levantar(1L, null))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
