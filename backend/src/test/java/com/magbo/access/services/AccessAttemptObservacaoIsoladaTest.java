package com.magbo.access.services;

import com.magbo.access.models.*;
import com.magbo.access.repositories.AccessAttemptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * UM REGISTRO DE APOIO NAO PODE APAGAR A PROVA.
 *
 * O aviso do regime de sortie e OBSERVACIONAL: ele nao nega ninguem, nao muda o
 * que a porta faz, e existe para que a Vie Scolaire saiba depois. Mas ele era
 * gravado dentro da MESMA transacao que grava a passagem — e o caso concreto nao
 * e hipotetico: se a V015 nao tiver sido aplicada na VM, o CHECK de
 * denial_reason nao conhece REGIME_NOT_ALLOWED, o INSERT estoura, e a transacao
 * inteira cai levando junto o `access_log` da crianca cruzando o portao.
 *
 * A prova de que ela passou desapareceria por causa do aviso sobre ela ter
 * passado. Apanhado pelo painel de revisao (chef d'etablissement e CPE,
 * 14/08/2026), que recusou a defesa entregue — um comentario na property e uma
 * ordem no README — com o argumento certo: a prova nao pode depender de alguem
 * ter lido o README.
 *
 * ⚠️ O try/catch tem de viver AQUI, e nao no chamador: em Spring, uma excecao
 * de persistencia ja marcou a transacao como rollback-only, e capturar la fora
 * nao a despoluí. Dai o REQUIRES_NEW no metodo real — a observacao vive e morre
 * na propria transacao.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AccessAttemptService — a observação isolada")
class AccessAttemptObservacaoIsoladaTest {

    @Mock private AccessAttemptRepository accessAttemptRepository;
    @Mock private SamePassageService samePassageService;

    private AccessAttemptService service;

    @BeforeEach
    void setUp() {
        service = new AccessAttemptService(accessAttemptRepository, samePassageService);
        when(samePassageService.alreadyAttempted(any(), any(), any(), any(), any(), any()))
                .thenReturn(false);
    }

    private void gravar() {
        service.recordObservacaoIsolada(
                "0003535", "0000000000003535", "Aurélie Gonçalves",
                "PORT1", AccessAction.SAIDA, "172.20.40.167",
                AuthMethod.FACE, AuthResult.SUCCESS,
                AuthorizationResult.OBSERVATION, DenialReason.REGIME_NOT_ALLOWED,
                null, false, LocalDateTime.now());
    }

    @Test
    @DisplayName("★★★ o INSERT falha e NADA sobe — a passagem do chamador sobrevive")
    void falhaNaoSobe() {
        // O caso real: CHECK de denial_reason sem o motivo novo (V015 fora).
        when(accessAttemptRepository.save(any()))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException(
                        "new row violates check constraint access_attempts_denial_reason_check"));

        assertThatCode(this::gravar)
                .as("o aviso se perde; o access_log da criança fica — é a troca certa")
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("★★ qualquer falha inesperada também é contida, não só a do CHECK")
    void qualquerFalhaEContida() {
        when(accessAttemptRepository.save(any()))
                .thenThrow(new IllegalStateException("conexão perdida"));

        assertThatCode(this::gravar).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("★★ no caminho normal, a observação É gravada")
    void caminhoNormalGrava() {
        when(accessAttemptRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        gravar();

        verify(accessAttemptRepository).save(any(AccessAttempt.class));
    }

    @Test
    @DisplayName("★ o método real é anotado REQUIRES_NEW — try/catch sozinho não bastaria")
    void temTransacaoPropria() throws Exception {
        // Sem REQUIRES_NEW, capturar a exceção não adianta: em Spring a
        // transação do chamador já está marcada rollback-only quando a
        // persistência falha, e o commit da passagem falharia mesmo assim.
        var m = AccessAttemptService.class.getMethod("recordObservacaoIsolada",
                String.class, String.class, String.class, String.class,
                AccessAction.class, String.class, AuthMethod.class, AuthResult.class,
                AuthorizationResult.class, DenialReason.class,
                Integer.class, boolean.class, LocalDateTime.class);
        var tx = m.getAnnotation(org.springframework.transaction.annotation.Transactional.class);

        org.assertj.core.api.Assertions.assertThat(tx).isNotNull();
        org.assertj.core.api.Assertions.assertThat(tx.propagation())
                .isEqualTo(org.springframework.transaction.annotation.Propagation.REQUIRES_NEW);
    }
}
