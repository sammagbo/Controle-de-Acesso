package com.magbo.access.services;

import com.magbo.access.dto.EventClassification;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Congela a tabela de subEventTypes confirmada com hardware
 * (DS-K1T344MX-E1, fw V4.13.0, 13-14/07/2026).
 *
 * O subtipo 8 e o motivo desta classe existir: o terminal NEGA o acesso mas
 * envia o evento COM employeeNoString. Se 8 voltar a classificar como
 * candidato a acesso, a refeicao falsa volta.
 */
class HikvisionEventClassifierTest {

    private final HikvisionEventClassifier classifier = new HikvisionEventClassifier();

    @Test
    @DisplayName("75 = face aprovada -> (FACE, SUCCESS, candidato)")
    void subtipo75ehFaceAprovada() {
        EventClassification c = classifier.classify(75);

        assertThat(c.method()).isEqualTo(AuthMethod.FACE);
        assertThat(c.result()).isEqualTo(AuthResult.SUCCESS);
        assertThat(c.isAccessCandidate()).isTrue();
    }

    @Test
    @DisplayName("1 = cartao aprovado -> (CARD, SUCCESS, candidato)")
    void subtipo1ehCartaoAprovado() {
        EventClassification c = classifier.classify(1);

        assertThat(c.method()).isEqualTo(AuthMethod.CARD);
        assertThat(c.result()).isEqualTo(AuthResult.SUCCESS);
        assertThat(c.isAccessCandidate()).isTrue();
    }

    @Test
    @DisplayName("8 = NEGADO pelo terminal -> (UNKNOWN, DENIED, NAO candidato)")
    void subtipo8ehNegadoPeloTerminal() {
        EventClassification c = classifier.classify(8);

        assertThat(c.method()).isEqualTo(AuthMethod.UNKNOWN);
        assertThat(c.result()).isEqualTo(AuthResult.DENIED);
        assertThat(c.isAccessCandidate())
                .as("subtipo 8 traz employeeNoString mas NUNCA pode virar access_log")
                .isFalse();
    }

    @Test
    @DisplayName("21 = porta abriu -> (UNKNOWN, UNKNOWN, NAO candidato)")
    void subtipo21ehEventoDePorta() {
        EventClassification c = classifier.classify(21);

        assertThat(c.method()).isEqualTo(AuthMethod.UNKNOWN);
        assertThat(c.result()).isEqualTo(AuthResult.UNKNOWN);
        assertThat(c.isAccessCandidate()).isFalse();
    }

    @Test
    @DisplayName("null -> (UNKNOWN, UNKNOWN, NAO candidato), sem lancar")
    void subtipoNuloNaoLanca() {
        EventClassification c = classifier.classify(null);

        assertThat(c.method()).isEqualTo(AuthMethod.UNKNOWN);
        assertThat(c.result()).isEqualTo(AuthResult.UNKNOWN);
        assertThat(c.isAccessCandidate()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(ints = {999, 9, 22, 1024, 1028, 1031, 39, 80, 112})
    @DisplayName("subtipo arbitrario ou de dispositivo -> nunca candidato a acesso")
    void subtipoDesconhecidoNuncaEhCandidato(int subType) {
        EventClassification c = classifier.classify(subType);

        assertThat(c.method()).isEqualTo(AuthMethod.UNKNOWN);
        assertThat(c.result()).isEqualTo(AuthResult.UNKNOWN);
        assertThat(c.isAccessCandidate()).isFalse();
    }
}
