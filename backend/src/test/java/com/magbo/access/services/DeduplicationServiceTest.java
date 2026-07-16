package com.magbo.access.services;

import com.magbo.access.config.PolicyProperties;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.repositories.AccessLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DeduplicationServiceTest {

    @Mock
    private AccessLogRepository accessLogRepository;

    private PolicyProperties policyProperties;
    private DeduplicationService service;

    private static final String USER = "9999999";
    private static final String PONTO = "REFEI1";
    private static final LocalDateTime AGORA = LocalDateTime.of(2026, 7, 13, 12, 0);

    @BeforeEach
    void setUp() {
        policyProperties = new PolicyProperties();
        service = new DeduplicationService(accessLogRepository, policyProperties);
    }

    @Test
    @DisplayName("log dentro da janela -> duplicata")
    void logDentroDaJanelaEhDuplicata() {
        when(accessLogRepository.findByUserIdAndPointIdAndActionAndTimestampAfter(
                eq(USER), eq(PONTO), eq(AccessAction.ENTRADA), any()))
                .thenReturn(List.of(new AccessLog()));

        assertThat(service.isDuplicate(USER, PONTO, AccessAction.ENTRADA, AGORA)).isTrue();
    }

    @Test
    @DisplayName("nada dentro da janela -> nao e duplicata")
    void semLogDentroDaJanelaNaoEhDuplicata() {
        when(accessLogRepository.findByUserIdAndPointIdAndActionAndTimestampAfter(
                eq(USER), eq(PONTO), eq(AccessAction.ENTRADA), any()))
                .thenReturn(List.of());

        assertThat(service.isDuplicate(USER, PONTO, AccessAction.ENTRADA, AGORA)).isFalse();
    }

    @Test
    @DisplayName("a janela consultada e now - windowSeconds")
    void consultaUsaAJanelaConfigurada() {
        policyProperties.getDedup().setWindowSeconds(90);
        when(accessLogRepository.findByUserIdAndPointIdAndActionAndTimestampAfter(
                any(), any(), any(), any()))
                .thenReturn(List.of());

        service.isDuplicate(USER, PONTO, AccessAction.ENTRADA, AGORA);

        ArgumentCaptor<LocalDateTime> captor = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(accessLogRepository).findByUserIdAndPointIdAndActionAndTimestampAfter(
                eq(USER), eq(PONTO), eq(AccessAction.ENTRADA), captor.capture());

        assertThat(captor.getValue()).isEqualTo(AGORA.minusSeconds(90));
    }

    @Test
    @DisplayName("dedup desligado -> nunca duplicata, nem consulta o banco")
    void dedupDesligadoNuncaEhDuplicata() {
        policyProperties.getDedup().setEnabled(false);

        assertThat(service.isDuplicate(USER, PONTO, AccessAction.ENTRADA, AGORA)).isFalse();
        verify(accessLogRepository, never())
                .findByUserIdAndPointIdAndActionAndTimestampAfter(any(), any(), any(), any());
    }

    @Test
    @DisplayName("janela = 0 -> nunca duplicata, nem consulta o banco")
    void janelaZeroNuncaEhDuplicata() {
        policyProperties.getDedup().setWindowSeconds(0);

        assertThat(service.isDuplicate(USER, PONTO, AccessAction.ENTRADA, AGORA)).isFalse();
        verify(accessLogRepository, never())
                .findByUserIdAndPointIdAndActionAndTimestampAfter(any(), any(), any(), any());
    }

    @Test
    @DisplayName("janela negativa -> nunca duplicata")
    void janelaNegativaNuncaEhDuplicata() {
        policyProperties.getDedup().setWindowSeconds(-1);

        assertThat(service.isDuplicate(USER, PONTO, AccessAction.ENTRADA, AGORA)).isFalse();
        verify(accessLogRepository, never())
                .findByUserIdAndPointIdAndActionAndTimestampAfter(any(), any(), any(), any());
    }

    @Test
    @DisplayName("ponto diferente -> a consulta e por ponto, entao nao e duplicata")
    void pontoDiferenteNaoEhDuplicata() {
        when(accessLogRepository.findByUserIdAndPointIdAndActionAndTimestampAfter(
                eq(USER), eq("REFEI2"), eq(AccessAction.ENTRADA), any()))
                .thenReturn(List.of());

        assertThat(service.isDuplicate(USER, "REFEI2", AccessAction.ENTRADA, AGORA)).isFalse();
    }

    @Test
    @DisplayName("acao diferente -> a consulta e por acao, entao nao e duplicata")
    void acaoDiferenteNaoEhDuplicata() {
        when(accessLogRepository.findByUserIdAndPointIdAndActionAndTimestampAfter(
                eq(USER), eq(PONTO), eq(AccessAction.SAIDA), any()))
                .thenReturn(List.of());

        assertThat(service.isDuplicate(USER, PONTO, AccessAction.SAIDA, AGORA)).isFalse();
    }
}
