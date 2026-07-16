package com.magbo.access.services;

import com.magbo.access.dto.EntitlementDecision;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.MealEntitlement;
import com.magbo.access.models.MealEntitlementEvent;
import com.magbo.access.repositories.MealEntitlementEventRepository;
import com.magbo.access.repositories.MealEntitlementRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Regras de direito a refeicao (Fase C).
 *
 * Nota: importBulk nao e testado aqui. Ele usa o campo self-injetado
 * (@Lazy @Autowired MealEntitlementService self) para conseguir REQUIRES_NEW
 * por linha; com @InjectMocks esse campo fica null e o metodo lanca NPE.
 * A transacao por linha e coberta por BulkEntitlementIT, com contexto real.
 */
@ExtendWith(MockitoExtension.class)
class MealEntitlementServiceTest {

    @Mock
    private MealEntitlementRepository mealEntitlementRepository;

    @Mock
    private MealEntitlementEventRepository mealEntitlementEventRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private MealEntitlementService service;

    private static final String USER = "9999999";
    private static final LocalDate HOJE = LocalDate.of(2026, 7, 13);

    @Test
    @DisplayName("sem linha de entitlement -> PENDING, sem direito, sem motivo")
    void semLinhaEhPending() {
        when(mealEntitlementRepository.findById(USER)).thenReturn(Optional.empty());

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.effectiveStatus()).isEqualTo(EntitlementStatus.PENDING);
        assertThat(d.entitled()).isFalse();
        assertThat(d.reason()).isNull();
    }

    @Test
    @DisplayName("AUTHORIZED sem datas -> tem direito")
    void authorizedSemDatasTemDireito() {
        when(mealEntitlementRepository.findById(USER))
                .thenReturn(Optional.of(entitlement(EntitlementStatus.AUTHORIZED, null, null)));

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.effectiveStatus()).isEqualTo(EntitlementStatus.AUTHORIZED);
        assertThat(d.entitled()).isTrue();
        assertThat(d.reason()).isNull();
    }

    @Test
    @DisplayName("AUTHORIZED dentro da vigencia -> tem direito")
    void authorizedVigenteTemDireito() {
        when(mealEntitlementRepository.findById(USER))
                .thenReturn(Optional.of(entitlement(EntitlementStatus.AUTHORIZED,
                        HOJE.minusDays(10), HOJE.plusDays(10))));

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.entitled()).isTrue();
        assertThat(d.reason()).isNull();
    }

    @Test
    @DisplayName("AUTHORIZED com validUntil no passado -> MEAL_NOT_ENTITLED")
    void authorizedExpiradoNaoTemDireito() {
        when(mealEntitlementRepository.findById(USER))
                .thenReturn(Optional.of(entitlement(EntitlementStatus.AUTHORIZED,
                        HOJE.minusDays(30), HOJE.minusDays(1))));

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.effectiveStatus()).isEqualTo(EntitlementStatus.AUTHORIZED);
        assertThat(d.entitled()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.MEAL_NOT_ENTITLED);
    }

    @Test
    @DisplayName("AUTHORIZED com validFrom no futuro -> MEAL_NOT_ENTITLED")
    void authorizedAindaNaoVigenteNaoTemDireito() {
        when(mealEntitlementRepository.findById(USER))
                .thenReturn(Optional.of(entitlement(EntitlementStatus.AUTHORIZED,
                        HOJE.plusDays(1), HOJE.plusDays(30))));

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.entitled()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.MEAL_NOT_ENTITLED);
    }

    @Test
    @DisplayName("limites de vigencia sao INCLUSIVOS nos dois extremos")
    void limitesDeVigenciaSaoInclusivos() {
        when(mealEntitlementRepository.findById(USER))
                .thenReturn(Optional.of(entitlement(EntitlementStatus.AUTHORIZED, HOJE, HOJE)));

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.entitled())
                .as("date == validFrom == validUntil deve ter direito (isBefore/isAfter, nao <=)")
                .isTrue();
    }

    @Test
    @DisplayName("NOT_AUTHORIZED -> MEAL_NOT_ENTITLED")
    void notAuthorizedNaoTemDireito() {
        when(mealEntitlementRepository.findById(USER))
                .thenReturn(Optional.of(entitlement(EntitlementStatus.NOT_AUTHORIZED, null, null)));

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.effectiveStatus()).isEqualTo(EntitlementStatus.NOT_AUTHORIZED);
        assertThat(d.entitled()).isFalse();
        assertThat(d.reason()).isEqualTo(DenialReason.MEAL_NOT_ENTITLED);
    }

    @Test
    @DisplayName("PENDING explicito -> sem direito, sem motivo")
    void pendingExplicitoNaoTemDireito() {
        when(mealEntitlementRepository.findById(USER))
                .thenReturn(Optional.of(entitlement(EntitlementStatus.PENDING, null, null)));

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.effectiveStatus()).isEqualTo(EntitlementStatus.PENDING);
        assertThat(d.entitled()).isFalse();
        assertThat(d.reason()).isNull();
    }

    /**
     * days_of_week e meal_type sao colunas RESERVADAS para evolucao futura.
     * A regra atual precisa ignora-las. Se este teste falhar, alguem comecou a
     * usar campos que a direcao da escola ainda nao decidiu.
     */
    @Test
    @DisplayName("daysOfWeek e mealType preenchidos sao IGNORADOS pela regra")
    void camposReservadosSaoIgnorados() {
        MealEntitlement e = entitlement(EntitlementStatus.AUTHORIZED, null, null);
        e.setDaysOfWeek("6,7");              // fim de semana: se fosse lido, hoje (segunda) negaria
        e.setMealType("DINNER");             // se fosse lido, almoco negaria
        when(mealEntitlementRepository.findById(USER)).thenReturn(Optional.of(e));

        EntitlementDecision d = service.evaluate(USER, HOJE);

        assertThat(d.entitled())
                .as("campos reservados nao podem afetar a decisao nesta fase")
                .isTrue();
        assertThat(d.reason()).isNull();
    }

    @Test
    @DisplayName("upsert grava o evento de historico com o estado anterior e o novo")
    void upsertGravaHistorico() {
        MealEntitlement anterior = entitlement(EntitlementStatus.PENDING, null, null);
        when(userRepository.existsById(USER)).thenReturn(true);
        when(mealEntitlementRepository.findById(USER)).thenReturn(Optional.of(anterior));
        when(mealEntitlementRepository.save(any(MealEntitlement.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        service.upsert(USER, EntitlementStatus.AUTHORIZED, HOJE, HOJE.plusDays(30),
                "liberado pela direcao", "sam", "MANUAL");

        ArgumentCaptor<MealEntitlementEvent> captor = ArgumentCaptor.forClass(MealEntitlementEvent.class);
        verify(mealEntitlementEventRepository).save(captor.capture());
        MealEntitlementEvent ev = captor.getValue();

        assertThat(ev.getUserId()).isEqualTo(USER);
        assertThat(ev.getOldStatus()).isEqualTo(EntitlementStatus.PENDING);
        assertThat(ev.getNewStatus()).isEqualTo(EntitlementStatus.AUTHORIZED);
        assertThat(ev.getNewValidFrom()).isEqualTo(HOJE);
        assertThat(ev.getNewValidUntil()).isEqualTo(HOJE.plusDays(30));
        assertThat(ev.getChangedBy()).isEqualTo("sam");
        assertThat(ev.getSource()).isEqualTo("MANUAL");
    }

    @Test
    @DisplayName("upsert de linha nova registra oldStatus=null no historico")
    void upsertDeLinhaNovaTemOldStatusNulo() {
        when(userRepository.existsById(USER)).thenReturn(true);
        when(mealEntitlementRepository.findById(USER)).thenReturn(Optional.empty());
        when(mealEntitlementRepository.save(any(MealEntitlement.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        service.upsert(USER, EntitlementStatus.AUTHORIZED, null, null, null, "sam", "MANUAL");

        ArgumentCaptor<MealEntitlementEvent> captor = ArgumentCaptor.forClass(MealEntitlementEvent.class);
        verify(mealEntitlementEventRepository).save(captor.capture());

        assertThat(captor.getValue().getOldStatus()).isNull();
        assertThat(captor.getValue().getNewStatus()).isEqualTo(EntitlementStatus.AUTHORIZED);
    }

    @Test
    @DisplayName("upsert de aluno inexistente lanca e nao grava nada")
    void upsertDeAlunoInexistenteLanca() {
        when(userRepository.existsById(USER)).thenReturn(false);

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> service.upsert(USER, EntitlementStatus.AUTHORIZED, null, null, null, "sam", "MANUAL"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("não encontrado");
    }

    @Test
    @DisplayName("upsert com validFrom depois de validUntil lanca")
    void upsertComDatasInvertidasLanca() {
        when(userRepository.existsById(USER)).thenReturn(true);

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> service.upsert(USER, EntitlementStatus.AUTHORIZED,
                                HOJE.plusDays(10), HOJE, null, "sam", "MANUAL"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private MealEntitlement entitlement(EntitlementStatus status, LocalDate from, LocalDate until) {
        return MealEntitlement.builder()
                .userId(USER)
                .status(status)
                .validFrom(from)
                .validUntil(until)
                .build();
    }
}
