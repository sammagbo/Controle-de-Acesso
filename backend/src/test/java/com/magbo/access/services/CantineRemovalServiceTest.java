package com.magbo.access.services;

import com.magbo.access.models.CantineRemoval;
import com.magbo.access.repositories.CantineRemovalRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * RETIRAR UMA LINHA DO MONITEUR CANTINE — e nao mais do que isso.
 *
 * ⚠️ O relogio e FIXO. Um teste cujo resultado depende da hora a que alguem o
 * roda nao prova nada — a licao ja foi paga neste projeto pelo
 * `RegimeGateWiringTest`, que passava verde o dia inteiro e so quebrou porque
 * a suite correu as 18h45.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("CantineRemovalService — um gesto de ecra, com autor e hora")
class CantineRemovalServiceTest {

    @Mock private CantineRemovalRepository repository;

    private CantineRemovalService service;

    private static final ZoneId ZONA = ZoneId.of("America/Sao_Paulo");
    private static final LocalDateTime MEIODIA = LocalDateTime.of(2026, 8, 25, 12, 0, 0);
    private static final LocalDate HOJE = MEIODIA.toLocalDate();

    @BeforeEach
    void setUp() {
        service = new CantineRemovalService(repository);
        ReflectionTestUtils.setField(service, "clock",
                Clock.fixed(MEIODIA.atZone(ZONA).toInstant(), ZONA));
        when(repository.save(any(CantineRemoval.class))).thenAnswer(i -> i.getArgument(0));
    }

    private CantineRemoval retirar() {
        return service.retirar("0003535", "REFEI1", "sortie non lue", "vie.scolaire");
    }

    @Nested
    @DisplayName("o registo")
    class Registo {

        @Test
        @DisplayName("★★★ grava QUEM e QUANDO — sem isso a retirada e indistinguivel de um defeito")
        void gravaAutorEHora() {
            // O sistema ja perdeu 95 entradas num dia sem ninguem perceber. Uma
            // linha que some do ecra sem deixar autor faz a pergunta de amanha
            // ("porque e que esta pessoa nao esta aqui?") ficar sem resposta.
            when(repository.findByUserIdAndPointIdAndDia(any(), any(), any())).thenReturn(Optional.empty());

            CantineRemoval r = retirar();

            assertThat(r.getRemovidoPor()).isEqualTo("vie.scolaire");
            assertThat(r.getRemovidoEm()).isEqualTo(MEIODIA);
            assertThat(r.getUserId()).isEqualTo("0003535");
            assertThat(r.getPointId()).isEqualTo("REFEI1");
            assertThat(r.getDia()).isEqualTo(HOJE);
            assertThat(r.getMotivo()).isEqualTo("sortie non lue");
            assertThat(r.isAtiva()).isTrue();
        }

        @Test
        @DisplayName("★★ o motivo e opcional; vazio vira null e nao string em branco")
        void motivoOpcional() {
            when(repository.findByUserIdAndPointIdAndDia(any(), any(), any())).thenReturn(Optional.empty());

            assertThat(service.retirar("0001", "REFEI1", null, "op").getMotivo()).isNull();
            assertThat(service.retirar("0001", "REFEI1", "   ", "op").getMotivo()).isNull();
        }

        @Test
        @DisplayName("★ motivo enorme e cortado no teto da coluna, nao rejeitado")
        void motivoCabeNaColuna() {
            // A coluna e VARCHAR(255). Rejeitar faria o operador perder o gesto
            // por causa de um texto; cortar preserva o que ele quis dizer.
            when(repository.findByUserIdAndPointIdAndDia(any(), any(), any())).thenReturn(Optional.empty());
            String enorme = "x".repeat(400);

            assertThat(service.retirar("0001", "REFEI1", enorme, "op").getMotivo()).hasSize(255);
        }

        @Test
        @DisplayName("★★ retirar DUAS VEZES reutiliza a linha — a UNIQUE garante uma so por pessoa/ponto/dia")
        void segundaRetiradaReutilizaALinha() {
            CantineRemoval existente = CantineRemoval.builder()
                    .id(7L).userId("0003535").pointId("REFEI1").dia(HOJE)
                    .removidoEm(MEIODIA.minusHours(1)).removidoPor("outro")
                    .build();
            when(repository.findByUserIdAndPointIdAndDia("0003535", "REFEI1", HOJE))
                    .thenReturn(Optional.of(existente));

            CantineRemoval r = retirar();

            assertThat(r.getId()).as("mesma linha, nao uma segunda").isEqualTo(7L);
            assertThat(r.getRemovidoPor()).isEqualTo("vie.scolaire");
            assertThat(r.getRemovidoEm()).isEqualTo(MEIODIA);
        }

        @Test
        @DisplayName("★★★ retirar de novo REABRE uma retirada desfeita")
        void retirarDepoisDeDesfazerReabre() {
            // Sem isto a retirada nova nasceria ja desfeita — o operador
            // carregava no ×, a linha continuava la, e nada explicava porque.
            CantineRemoval desfeita = CantineRemoval.builder()
                    .id(9L).userId("0003535").pointId("REFEI1").dia(HOJE)
                    .removidoEm(MEIODIA.minusHours(2)).removidoPor("op")
                    .desfeitoEm(MEIODIA.minusHours(1)).desfeitoPor("op")
                    .build();
            when(repository.findByUserIdAndPointIdAndDia("0003535", "REFEI1", HOJE))
                    .thenReturn(Optional.of(desfeita));

            CantineRemoval r = retirar();

            assertThat(r.getDesfeitoEm()).isNull();
            assertThat(r.getDesfeitoPor()).isNull();
            assertThat(r.isAtiva()).isTrue();
        }
    }

    @Nested
    @DisplayName("desfazer")
    class Desfazer {

        @Test
        @DisplayName("★★ marca quem desfez e quando, SEM apagar a linha")
        void desfazerESoft() {
            CantineRemoval ativa = CantineRemoval.builder()
                    .id(3L).userId("0001").pointId("REFEI1").dia(HOJE)
                    .removidoEm(MEIODIA.minusMinutes(10)).removidoPor("op1")
                    .build();
            when(repository.findByUserIdAndPointIdAndDia("0001", "REFEI1", HOJE))
                    .thenReturn(Optional.of(ativa));

            service.desfazer("0001", "REFEI1", "op2");

            ArgumentCaptor<CantineRemoval> cap = ArgumentCaptor.forClass(CantineRemoval.class);
            verify(repository).save(cap.capture());
            assertThat(cap.getValue().getDesfeitoPor()).isEqualTo("op2");
            assertThat(cap.getValue().getDesfeitoEm()).isEqualTo(MEIODIA);
            assertThat(cap.getValue().isAtiva()).isFalse();
            assertThat(cap.getValue().getRemovidoPor())
                    .as("quem retirou continua registado — desfazer nao apaga o gesto anterior")
                    .isEqualTo("op1");
            verify(repository, never()).delete(any());
        }

        @Test
        @DisplayName("★★ IDEMPOTENTE: desfazer o que ja estava desfeito nao regrava nem estoura")
        void desfazerDuasVezes() {
            // Dois operadores carregam no mesmo botao. O segundo nao pode ver
            // um erro por ter chegado tarde.
            CantineRemoval jaDesfeita = CantineRemoval.builder()
                    .id(3L).userId("0001").pointId("REFEI1").dia(HOJE)
                    .removidoEm(MEIODIA.minusMinutes(10)).removidoPor("op1")
                    .desfeitoEm(MEIODIA.minusMinutes(5)).desfeitoPor("op2")
                    .build();
            when(repository.findByUserIdAndPointIdAndDia("0001", "REFEI1", HOJE))
                    .thenReturn(Optional.of(jaDesfeita));

            service.desfazer("0001", "REFEI1", "op3");

            verify(repository, never()).save(any());
            assertThat(jaDesfeita.getDesfeitoPor())
                    .as("o primeiro a desfazer continua sendo o autor")
                    .isEqualTo("op2");
        }

        @Test
        @DisplayName("★ desfazer o que nunca existiu nao estoura")
        void desfazerInexistente() {
            when(repository.findByUserIdAndPointIdAndDia(any(), any(), any())).thenReturn(Optional.empty());
            assertThat(service.desfazer("0001", "REFEI1", "op")).isEmpty();
            verify(repository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("a guarda do ponto — a terceira metade da autorizacao")
    class GuardaDoPonto {

        @Test
        @DisplayName("★★★ um ponto FORA da cantina e RECUSADO, mesmo vindo de um ADMIN")
        void pontoForaDaCantinaERecusado() {
            // O @PreAuthorize autoriza a PESSOA (permissao + area do ponto). Um
            // ADMIN passa em qualquer area do sistema, e sem esta guarda
            // gravaria a retirada de uma linha do CDI numa tabela que o CDI nao
            // le: um registo sem efeito nenhum, que engana quem o for ler.
            for (String fora : List.of("BIBLIO", "PORT1", "ENFERM", "INVENTADO")) {
                assertThatThrownBy(() -> service.retirar("0001", fora, null, "admin"))
                        .isInstanceOf(IllegalArgumentException.class)
                        .hasMessageContaining("fora da cantina");
            }
            verify(repository, never()).save(any());
        }

        @Test
        @DisplayName("★★ os TRES pontos de refeitorio da tela sao aceites")
        void pontosDaCantinaSaoAceites() {
            // Os mesmos que o /logs/refectory devolve. Se um dia um quarto
            // ponto entrar la e nao aqui, o × deixaria de funcionar so nele.
            when(repository.findByUserIdAndPointIdAndDia(any(), any(), any())).thenReturn(Optional.empty());
            for (String ponto : List.of("REFEI1", "REFEI2", "CANTINA1")) {
                assertThat(service.retirar("0001", ponto, null, "op").getPointId()).isEqualTo(ponto);
            }
        }

        @Test
        @DisplayName("★ o ponto e normalizado para MAIUSCULAS — 'refei1' e o mesmo ponto")
        void pontoNormalizado() {
            when(repository.findByUserIdAndPointIdAndDia(any(), any(), any())).thenReturn(Optional.empty());
            assertThat(service.retirar("0001", " refei1 ", null, "op").getPointId()).isEqualTo("REFEI1");
        }

        @Test
        @DisplayName("★★ campo obrigatorio em branco e recusado — nunca gravado como vazio")
        void camposObrigatorios() {
            assertThatThrownBy(() -> service.retirar(null, "REFEI1", null, "op"))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> service.retirar("  ", "REFEI1", null, "op"))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> service.retirar("0001", null, null, "op"))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> service.retirar("0001", "REFEI1", null, "  "))
                    .isInstanceOf(IllegalArgumentException.class);
            verify(repository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("o relogio")
    class Relogio {

        @Test
        @DisplayName("★★★ o relogio e o DA ESCOLA (America/Sao_Paulo), nao o do container")
        void relogioEDaEscola() {
            // ⚠️ MEDIDO EM 25/08/2026: o container do backend sobe SEM `TZ` no
            // deploy/docker-compose.yml, logo em UTC. Com
            // `Clock.systemDefaultZone()`, uma retirada feita as 14h26 de
            // Brasilia ficava gravada as 17h26 — tres horas no FUTURO em
            // relacao as passagens, que o EventTimeResolver grava em
            // America/Sao_Paulo. E `removidoEm` decide o que fica escondido:
            // adiantado tres horas, o × calava a pessoa pelas tres horas
            // seguintes, inclusive entradas que ainda nao tinham acontecido.
            //
            // ⚠️ O QUE ESTE TESTE NAO APANHA: numa estacao ja configurada em
            // horario de Brasilia, `systemDefaultZone()` devolve a mesma zona e
            // um retrocesso passaria verde AQUI. Ele morde onde o defeito vive
            // — no container UTC. E a razao de a asercao ser sobre a ZONA e nao
            // sobre um instante: um instante so difere onde os fusos diferem.
            Clock relogio = (Clock) ReflectionTestUtils.getField(
                    new CantineRemovalService(repository), "clock");
            assertThat(relogio).isNotNull();
            assertThat(relogio.getZone())
                    .as("o carimbo tem de ser comparavel com access_logs.timestamp, que e BRT")
                    .isEqualTo(EventTimeResolver.ZONA_ESCOLA);
            assertThat(EventTimeResolver.ZONA_ESCOLA.getId()).isEqualTo("America/Sao_Paulo");
        }
    }

    @Nested
    @DisplayName("o que a tela le")
    class Leitura {

        @Test
        @DisplayName("★★★ so as ATIVAS de HOJE, e o filtro esta na CONSULTA")
        void ativasDeHoje() {
            // Filtrar em Java significaria que um unico ponto de uso que se
            // esquecesse do filtro esconderia uma crianca do ecra que diz quem
            // esta no refeitorio.
            service.ativasDeHoje();
            verify(repository).findByDiaAndDesfeitoEmIsNull(HOJE);
            verify(repository, never()).findAll();
        }
    }
}
