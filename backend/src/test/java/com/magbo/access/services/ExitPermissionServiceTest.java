package com.magbo.access.services;

import com.magbo.access.dto.ExitDecision;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.ExitPermissionStatus;
import com.magbo.access.models.ExitPermissionType;
import com.magbo.access.models.StudentExitPermission;
import com.magbo.access.repositories.StudentExitPermissionRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Regras de autorizacao de saida (Fase D).
 *
 * DETALHE ESTRUTURAL que molda todos os casos: evaluate() consulta
 * findByUserIdAndStatus(userId, ACTIVE). Permissoes REVOKED e USED nem chegam
 * ao servico — a lista volta vazia e o motivo e EXIT_NOT_AUTHORIZED, nao
 * OUTSIDE_EXIT_WINDOW.
 *
 * Logo, OUTSIDE_EXIT_WINDOW tem UM unico caminho alcancavel: uma permissao
 * ACTIVE que existe mas falha isValidNow (data fora, dia errado, hora fora).
 * A distincao entre os dois motivos e exigencia do cliente, e e assim que ela
 * precisa ser exercitada.
 */
@ExtendWith(MockitoExtension.class)
class ExitPermissionServiceTest {

    @Mock
    private StudentExitPermissionRepository permissionRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private ExitPermissionService service;

    private static final String USER = "9999999";
    /** Segunda-feira, 13/07/2026, 14h. ISO day-of-week = 1. */
    private static final LocalDateTime SEGUNDA_14H = LocalDateTime.of(2026, 7, 13, 14, 0);

    private void comPermissoesAtivas(StudentExitPermission... permissoes) {
        when(permissionRepository.findByUserIdAndStatus(eq(USER), eq(ExitPermissionStatus.ACTIVE)))
                .thenReturn(new java.util.ArrayList<>(List.of(permissoes)));
    }

    // ───────────────── Ausencia de permissao ─────────────────

    @Test
    @DisplayName("sem nenhuma permissao ativa -> EXIT_NOT_AUTHORIZED")
    void semPermissaoEhNaoAutorizado() {
        when(permissionRepository.findByUserIdAndStatus(eq(USER), eq(ExitPermissionStatus.ACTIVE)))
                .thenReturn(List.of());

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.EXIT_NOT_AUTHORIZED);
        assertThat(d.permissionId()).isNull();
        assertThat(d.permissionType()).isNull();
    }

    @Test
    @DisplayName("permissao REVOKED -> EXIT_NOT_AUTHORIZED (a query so busca ACTIVE)")
    void revogadaEhNaoAutorizado() {
        when(permissionRepository.findByUserIdAndStatus(eq(USER), eq(ExitPermissionStatus.ACTIVE)))
                .thenReturn(List.of());

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isFalse();
        assertThat(d.reason())
                .as("REVOKED nao chega ao isValidNow: a lista de ACTIVE volta vazia")
                .isEqualTo(DenialReason.EXIT_NOT_AUTHORIZED);
    }

    @Test
    @DisplayName("permissao SINGLE ja USED -> EXIT_NOT_AUTHORIZED (a query so busca ACTIVE)")
    void singleUsadaEhNaoAutorizado() {
        when(permissionRepository.findByUserIdAndStatus(eq(USER), eq(ExitPermissionStatus.ACTIVE)))
                .thenReturn(List.of());

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.EXIT_NOT_AUTHORIZED);
    }

    // ───────────────── PERMANENT ─────────────────

    @Test
    @DisplayName("PERMANENT ACTIVE -> valida")
    void permanenteAtivaEhValida() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.PERMANENT);
        comPermissoesAtivas(p);

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isTrue();
        assertThat(d.reason()).isNull();
        assertThat(d.permissionId()).isEqualTo(1L);
        assertThat(d.permissionType()).isEqualTo(ExitPermissionType.PERMANENT);
    }

    // ───────────────── DATE_RANGE ─────────────────

    @Test
    @DisplayName("DATE_RANGE dentro do periodo -> valida")
    void dateRangeDentroEhValida() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.DATE_RANGE);
        p.setValidFrom(LocalDate.of(2026, 7, 1));
        p.setValidUntil(LocalDate.of(2026, 7, 31));
        comPermissoesAtivas(p);

        assertThat(service.evaluate(USER, SEGUNDA_14H).allowed()).isTrue();
    }

    @Test
    @DisplayName("DATE_RANGE fora do periodo -> OUTSIDE_EXIT_WINDOW")
    void dateRangeForaEhForaDaJanela() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.DATE_RANGE);
        p.setValidFrom(LocalDate.of(2026, 8, 1));
        p.setValidUntil(LocalDate.of(2026, 8, 31));
        comPermissoesAtivas(p);

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isFalse();
        assertThat(d.reason())
                .as("existe permissao ACTIVE, mas nao vale hoje -> a distincao exigida pelo cliente")
                .isEqualTo(DenialReason.OUTSIDE_EXIT_WINDOW);
    }

    @Test
    @DisplayName("DATE_RANGE nos limites exatos (primeiro e ultimo dia) -> valida")
    void dateRangeNosLimitesEhValida() {
        StudentExitPermission primeiro = permissao(1L, ExitPermissionType.DATE_RANGE);
        primeiro.setValidFrom(SEGUNDA_14H.toLocalDate());
        primeiro.setValidUntil(SEGUNDA_14H.toLocalDate().plusDays(5));
        comPermissoesAtivas(primeiro);
        assertThat(service.evaluate(USER, SEGUNDA_14H).allowed())
                .as("hoje == validFrom deve valer").isTrue();

        StudentExitPermission ultimo = permissao(2L, ExitPermissionType.DATE_RANGE);
        ultimo.setValidFrom(SEGUNDA_14H.toLocalDate().minusDays(5));
        ultimo.setValidUntil(SEGUNDA_14H.toLocalDate());
        comPermissoesAtivas(ultimo);
        assertThat(service.evaluate(USER, SEGUNDA_14H).allowed())
                .as("hoje == validUntil deve valer").isTrue();
    }

    @Test
    @DisplayName("DATE_RANGE sem datas -> invalida (OUTSIDE_EXIT_WINDOW)")
    void dateRangeSemDatasEhInvalida() {
        comPermissoesAtivas(permissao(1L, ExitPermissionType.DATE_RANGE));

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.OUTSIDE_EXIT_WINDOW);
    }

    // ───────────────── RECURRING ─────────────────

    @Test
    @DisplayName("RECURRING no dia certo -> valida")
    void recurringNoDiaCertoEhValida() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.RECURRING);
        p.setDaysOfWeek("1,3,5"); // segunda, quarta, sexta
        comPermissoesAtivas(p);

        assertThat(service.evaluate(USER, SEGUNDA_14H).allowed())
                .as("13/07/2026 e segunda-feira (ISO 1)").isTrue();
    }

    @Test
    @DisplayName("RECURRING no dia errado -> OUTSIDE_EXIT_WINDOW")
    void recurringNoDiaErradoEhForaDaJanela() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.RECURRING);
        p.setDaysOfWeek("2,4"); // terca e quinta
        comPermissoesAtivas(p);

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.OUTSIDE_EXIT_WINDOW);
    }

    @Test
    @DisplayName("RECURRING sem daysOfWeek -> invalida")
    void recurringSemDiasEhInvalida() {
        comPermissoesAtivas(permissao(1L, ExitPermissionType.RECURRING));

        assertThat(service.evaluate(USER, SEGUNDA_14H).allowed()).isFalse();
    }

    @Test
    @DisplayName("RECURRING com daysOfWeek nao numerico -> invalida, sem lancar")
    void recurringComDiasInvalidosNaoLanca() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.RECURRING);
        p.setDaysOfWeek("seg,qua");
        comPermissoesAtivas(p);

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.OUTSIDE_EXIT_WINDOW);
    }

    @Test
    @DisplayName("RECURRING no dia certo mas com validUntil vencido -> invalida")
    void recurringComValidadeVencidaEhInvalida() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.RECURRING);
        p.setDaysOfWeek("1");
        p.setValidUntil(SEGUNDA_14H.toLocalDate().minusDays(1));
        comPermissoesAtivas(p);

        assertThat(service.evaluate(USER, SEGUNDA_14H).allowed()).isFalse();
    }

    // ───────────────── SINGLE ─────────────────

    @Test
    @DisplayName("SINGLE ainda nao usada -> valida")
    void singleNaoUsadaEhValida() {
        comPermissoesAtivas(permissao(1L, ExitPermissionType.SINGLE));

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isTrue();
        assertThat(d.permissionType()).isEqualTo(ExitPermissionType.SINGLE);
        assertThat(d.permissionId()).isEqualTo(1L);
    }

    // ───────────────── Janela horaria ─────────────────

    @Nested
    @DisplayName("Janela horaria (aplicada antes do tipo)")
    class JanelaHoraria {

        @Test
        @DisplayName("dentro da janela -> valida")
        void dentroDaJanela() {
            comPermissoesAtivas(comJanela(LocalTime.of(13, 0), LocalTime.of(15, 0)));

            assertThat(service.evaluate(USER, SEGUNDA_14H).allowed()).isTrue();
        }

        @Test
        @DisplayName("antes da janela -> OUTSIDE_EXIT_WINDOW")
        void antesDaJanela() {
            comPermissoesAtivas(comJanela(LocalTime.of(15, 0), LocalTime.of(16, 0)));

            ExitDecision d = service.evaluate(USER, SEGUNDA_14H);
            assertThat(d.allowed()).isFalse();
            assertThat(d.reason()).isEqualTo(DenialReason.OUTSIDE_EXIT_WINDOW);
        }

        @Test
        @DisplayName("depois da janela -> OUTSIDE_EXIT_WINDOW")
        void depoisDaJanela() {
            comPermissoesAtivas(comJanela(LocalTime.of(8, 0), LocalTime.of(12, 0)));

            ExitDecision d = service.evaluate(USER, SEGUNDA_14H);
            assertThat(d.allowed()).isFalse();
            assertThat(d.reason()).isEqualTo(DenialReason.OUTSIDE_EXIT_WINDOW);
        }

        @Test
        @DisplayName("exatamente no startTime -> valida (limite inclusivo)")
        void exatamenteNoInicio() {
            comPermissoesAtivas(comJanela(LocalTime.of(14, 0), LocalTime.of(16, 0)));

            assertThat(service.evaluate(USER, SEGUNDA_14H).allowed())
                    .as("isBefore(start) e falso quando now == start").isTrue();
        }

        @Test
        @DisplayName("exatamente no endTime -> valida (limite inclusivo)")
        void exatamenteNoFim() {
            comPermissoesAtivas(comJanela(LocalTime.of(12, 0), LocalTime.of(14, 0)));

            assertThat(service.evaluate(USER, SEGUNDA_14H).allowed())
                    .as("isAfter(end) e falso quando now == end").isTrue();
        }

        private StudentExitPermission comJanela(LocalTime inicio, LocalTime fim) {
            StudentExitPermission p = permissao(1L, ExitPermissionType.PERMANENT);
            p.setStartTime(inicio);
            p.setEndTime(fim);
            return p;
        }
    }

    // ───────────────── Multiplas permissoes ─────────────────

    @Test
    @DisplayName("varias ativas: usa a primeira valida, ordenada por id (deterministico)")
    void variasAtivasUsaAPrimeiraValida() {
        StudentExitPermission invalida = permissao(5L, ExitPermissionType.RECURRING);
        invalida.setDaysOfWeek("6,7"); // fim de semana: nao vale numa segunda
        StudentExitPermission valida = permissao(9L, ExitPermissionType.PERMANENT);
        comPermissoesAtivas(valida, invalida); // fora de ordem de proposito

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isTrue();
        assertThat(d.permissionId()).isEqualTo(9L);
    }

    @Test
    @DisplayName("varias ativas, nenhuma valida -> OUTSIDE_EXIT_WINDOW")
    void variasAtivasNenhumaValida() {
        StudentExitPermission a = permissao(1L, ExitPermissionType.RECURRING);
        a.setDaysOfWeek("6");
        StudentExitPermission b = permissao(2L, ExitPermissionType.DATE_RANGE);
        b.setValidFrom(LocalDate.of(2026, 1, 1));
        b.setValidUntil(LocalDate.of(2026, 1, 31));
        comPermissoesAtivas(a, b);

        ExitDecision d = service.evaluate(USER, SEGUNDA_14H);

        assertThat(d.allowed()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.OUTSIDE_EXIT_WINDOW);
    }

    // ───────────────── consumeIfSingle ─────────────────

    @Test
    @DisplayName("consumeIfSingle marca SINGLE ativa como USED e carimba usedAt")
    void consumeIfSingleMarcaComoUsada() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.SINGLE);
        when(permissionRepository.findById(1L)).thenReturn(java.util.Optional.of(p));

        service.consumeIfSingle(1L);

        assertThat(p.getStatus()).isEqualTo(ExitPermissionStatus.USED);
        assertThat(p.getUsedAt()).isNotNull();
        org.mockito.Mockito.verify(permissionRepository).save(p);
    }

    @Test
    @DisplayName("consumeIfSingle NAO consome permissao PERMANENT")
    void consumeIfSingleNaoConsomePermanente() {
        StudentExitPermission p = permissao(1L, ExitPermissionType.PERMANENT);
        when(permissionRepository.findById(1L)).thenReturn(java.util.Optional.of(p));

        service.consumeIfSingle(1L);

        assertThat(p.getStatus()).isEqualTo(ExitPermissionStatus.ACTIVE);
        assertThat(p.getUsedAt()).isNull();
        org.mockito.Mockito.verify(permissionRepository, org.mockito.Mockito.never())
                .save(org.mockito.ArgumentMatchers.any());
    }

    private static StudentExitPermission permissao(Long id, ExitPermissionType tipo) {
        return StudentExitPermission.builder()
                .id(id)
                .userId(USER)
                .permissionType(tipo)
                .status(ExitPermissionStatus.ACTIVE)
                .reason("Teste")
                .createdBy("fixture")
                .build();
    }
}
