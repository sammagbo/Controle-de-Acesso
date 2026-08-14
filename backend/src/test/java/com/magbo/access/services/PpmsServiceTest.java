package com.magbo.access.services;

import com.magbo.access.dto.PpmsSnapshot;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PPMS — a lista que alguém lê em voz alta num pátio.
 *
 * Cada teste aqui é um jeito de a lista mentir, e o que se prova é que ela não
 * mente daquele jeito. Uma criança a menos nesta lista é alguém que ninguém vai
 * procurar; uma a mais é gente parada no pátio à espera de um nome que já foi
 * para casa.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PpmsService — quem está dentro, agora")
class PpmsServiceTest {

    private static final LocalDate DIA = LocalDate.of(2026, 8, 14);
    private static final LocalDateTime AGORA = LocalDateTime.of(DIA, LocalTime.of(14, 0));

    @Mock private AccessLogRepository accessLogRepository;
    @Mock private UserRepository userRepository;

    private com.magbo.access.config.PresenceAutoCloseProperties autoCloseProps;
    private PpmsService service;
    private final List<AccessLog> logs = new ArrayList<>();
    private long seq = 1;

    @BeforeEach
    void setUp() {
        autoCloseProps = new com.magbo.access.config.PresenceAutoCloseProperties();
        autoCloseProps.getTimes().put("BIBLIO", "17:00");
        service = new PpmsService(accessLogRepository, userRepository, autoCloseProps);
        logs.clear();
        when(accessLogRepository.findByTimestampBetweenOrderByTimestampAsc(any(), any()))
                .thenReturn(logs);
        when(userRepository.findAllById(any())).thenAnswer(inv -> {
            List<User> us = new ArrayList<>();
            for (Object id : (Iterable<?>) inv.getArgument(0)) {
                us.add(User.builder().id((String) id).nome("Aluno " + id)
                        .turma("2A").tipo(UserType.ALUNO).ativo(true).build());
            }
            return us;
        });
    }

    private void ev(String user, String ponto, AccessAction acao, int h, int m, String flag) {
        logs.add(AccessLog.builder().id(seq++).userId(user).pointId(ponto).action(acao)
                .timestamp(LocalDateTime.of(DIA, LocalTime.of(h, m))).flag(flag).build());
    }

    private PpmsSnapshot tirar() {
        return service.snapshot(AGORA);
    }

    private List<String> nomesDentro(PpmsSnapshot s) {
        List<String> ids = new ArrayList<>();
        s.getZonas().forEach(z -> z.getPessoas().forEach(p -> ids.add(p.getId())));
        return ids;
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ o básico: entrou e não saiu")
    class Basico {

        @Test
        @DisplayName("★★ entrou às 8h pelo portão e não saiu: está dentro")
        void entrouENaoSaiu() {
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            PpmsSnapshot s = tirar();
            assertThat(s.getTotalDentro()).isEqualTo(1);
            assertThat(nomesDentro(s)).containsExactly("0001");
        }

        @Test
        @DisplayName("★★ entrou e saiu: NÃO está dentro — ninguém procura por ele")
        void saiuNaoConta() {
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            ev("0001", "PORT1", AccessAction.SAIDA, 12, 0, null);
            assertThat(tirar().getTotalDentro()).isZero();
        }

        @Test
        @DisplayName("★ dia sem movimento: lista vazia, não erro")
        void diaVazio() {
            PpmsSnapshot s = tirar();
            assertThat(s.getTotalDentro()).isZero();
            assertThat(s.getZonas()).isEmpty();
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ onde a pessoa está, não só se está")
    class Onde {

        @Test
        @DisplayName("★★ entrou no portão e foi ao CDI: aparece NO CDI (visita aberta)")
        void ultimoPontoVence() {
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 10, 0, null);
            PpmsSnapshot s = tirar();
            assertThat(s.getTotalDentro()).isEqualTo(1);
            assertThat(s.getZonas().get(0).getPointId()).isEqualTo("BIBLIO");
        }

        @Test
        @DisplayName("★★★ saiu do CDI e continua na escola: EM TRÂNSITO, não 'no CDI'")
        void saiuDaZonaMasNaoDaEscola() {
            // A primeira versão agrupava pelo ÚLTIMO EVENTO e listava esta
            // pessoa sob "CDI" — num card com contador que se lê como ocupação.
            // A equipe de evacuação era mandada procurar numa sala que ela
            // acabara de deixar. A resposta honesta é: está na escola, a zona é
            // desconhecida, e o último lugar onde foi vista é o CDI.
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 10, 0, null);
            ev("0001", "BIBLIO", AccessAction.SAIDA, 10, 30, null);
            PpmsSnapshot s = tirar();
            assertThat(s.getTotalDentro())
                    .as("sair do CDI não é sair da escola")
                    .isEqualTo(1);
            assertThat(s.getZonas().get(0).getPointId())
                    .as("não se manda ninguém procurar na sala que a pessoa deixou")
                    .isEqualTo(PpmsService.ZONA_EM_TRANSITO);
            assertThat(s.getZonas().get(0).getPessoas().get(0).getUltimoPonto())
                    .as("mas o último lugar onde foi vista continua dito")
                    .isEqualTo("BIBLIO");
        }

        @Test
        @DisplayName("★★ quem só passou o portão está EM TRÂNSITO — corredor, pátio, sala sem leitor")
        void soPortaoEEmTransito() {
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            assertThat(tirar().getZonas().get(0).getPointId())
                    .isEqualTo(PpmsService.ZONA_EM_TRANSITO);
        }

        @Test
        @DisplayName("★★ com visita ABERTA, a zona é a visita — é onde a pessoa está")
        void visitaAbertaVence() {
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 10, 0, null);
            assertThat(tirar().getZonas().get(0).getPointId()).isEqualTo("BIBLIO");
        }

        @Test
        @DisplayName("★ a zona traz a área, para a célula de crise agrupar")
        void zonaTrazArea() {
            ev("0001", "ENFERM", AccessAction.ENTRADA, 9, 0, null);
            assertThat(tirar().getZonas().get(0).getArea()).isEqualTo("infirmerie");
        }

        @Test
        @DisplayName("★ dentro da zona, os nomes saem em ordem alfabética")
        void nomesOrdenados() {
            ev("0003", "BIBLIO", AccessAction.ENTRADA, 9, 0, null);
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 9, 5, null);
            List<String> nomes = new ArrayList<>();
            tirar().getZonas().get(0).getPessoas().forEach(p -> nomes.add(p.getNome()));
            assertThat(nomes).isSorted();
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ as flags de repetição, com a assimetria de sempre")
    class Repeticoes {

        @Test
        @DisplayName("★★ ENTRADA marcada JA_PRESENTE não cria uma segunda presença")
        void entradaMarcadaNaoAbre() {
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 9, 0, null);
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 9, 2, "JA_PRESENTE");
            ev("0001", "BIBLIO", AccessAction.SAIDA, 9, 30, null);
            assertThat(tirar().getTotalDentro())
                    .as("a saída fecha a visita real; a entrada repetida nunca abriu outra")
                    .isZero();
        }

        @Test
        @DisplayName("★★★ SAÍDA marcada FECHA — a assimetria que já custou caro em 10/08")
        void saidaMarcadaFecha() {
            // O porteiro tem posto fixo no portão: as passagens seguintes vêm
            // marcadas. Se a exclusão fosse simétrica, a SAÍDA real dele sumiria
            // e ele constaria "dentro" até a meia-noite — gente parada no pátio
            // procurando quem já foi para casa.
            ev("9001", "PORT1", AccessAction.ENTRADA, 7, 0, null);
            ev("9001", "PORT1", AccessAction.ENTRADA, 9, 0, "POSTO_FIXO");
            ev("9001", "PORT1", AccessAction.SAIDA, 13, 0, "POSTO_FIXO");
            assertThat(tirar().getTotalDentro())
                    .as("saída marcada continua sendo saída")
                    .isZero();
        }

        @Test
        @DisplayName("★★★ posto fixo que SAI e REENTRA continua na lista — a reentrada é marcada")
        void postoFixoQueReentraNaoSome() {
            // O porteiro entra às 7h (sem marca), sai às 9h e reentra às 9h05 —
            // e a reentrada vem marcada POSTO_FIXO. Descartando a ENTRADA
            // marcada, ele sumia da lista de evacuação estando dentro do prédio.
            // Aqui não se contam visitas, conta-se estado, e estado é
            // idempotente. Revisor final, 14/08.
            ev("9001", "PORT1", AccessAction.ENTRADA, 7, 0, null);
            ev("9001", "PORT1", AccessAction.SAIDA, 9, 0, null);
            ev("9001", "PORT1", AccessAction.ENTRADA, 9, 5, "POSTO_FIXO");

            PpmsSnapshot s = tirar();
            assertThat(s.getTotalDentro())
                    .as("ele está no prédio; a marca diz que é rotina, não que ele não entrou")
                    .isEqualTo(1);
        }

        @Test
        @DisplayName("★ POSTO_FIXO no meio do dia não muda quem está dentro")
        void postoFixoNaoDuplica() {
            ev("9001", "PORT1", AccessAction.ENTRADA, 7, 0, null);
            ev("9001", "PORT1", AccessAction.ENTRADA, 9, 0, "POSTO_FIXO");
            assertThat(tirar().getTotalDentro()).isEqualTo(1);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ os casos em que a lista poderia perder alguém")
    class NaoPerderNinguem {

        @Test
        @DisplayName("★★★ sem evento de portão, mas visto numa zona: CONTA")
        void semPortaoMasDentro() {
            // A leitura do portão falhou, ou a pessoa entrou por uma porta sem
            // leitor. É exatamente quem uma evacuação não pode perder.
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 10, 0, null);
            PpmsSnapshot s = tirar();
            assertThat(s.getTotalDentro()).isEqualTo(1);
            assertThat(nomesDentro(s)).containsExactly("0001");
        }

        @Test
        @DisplayName("★★ saída pelo portão apaga as visitas internas abertas")
        void saidaDoPortaoFechaTudo() {
            // Foi embora sem passar o crachá na saída do CDI. A saída da ESCOLA
            // é a que manda: contá-lo dentro do CDI seria mandar alguém procurar
            // numa sala vazia.
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 10, 0, null);
            ev("0001", "PORT1", AccessAction.SAIDA, 12, 0, null);
            assertThat(tirar().getTotalDentro()).isZero();
        }

        @Test
        @DisplayName("★ pessoa sem cadastro aparece pela matrícula, não some")
        void semCadastroNaoSome() {
            // doReturn e nao when(...): reestubar com when() INVOCA a resposta
            // anterior, e ela recebe null — o erro seria do teste, nao do codigo.
            org.mockito.Mockito.doReturn(List.of()).when(userRepository).findAllById(any());
            ev("0777", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            PpmsSnapshot s = tirar();
            assertThat(s.getTotalDentro()).isEqualTo(1);
            assertThat(s.getZonas().get(0).getPessoas().get(0).getNome()).isEqualTo("0777");
        }

        @Test
        @DisplayName("★ evento sem userId é ignorado sem quebrar a lista")
        void semUserIdNaoQuebra() {
            logs.add(AccessLog.builder().id(seq++).userId(null).pointId("PORT1")
                    .action(AccessAction.ENTRADA)
                    .timestamp(LocalDateTime.of(DIA, LocalTime.of(8, 0))).build());
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 5, null);
            assertThat(tirar().getTotalDentro()).isEqualTo(1);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★★ nenhum ponto fica de fora da lista de evacuação")
    class SemListaBranca {

        @Test
        @DisplayName("★★★ um ponto FORA do AreaMapping continua na lista — CANTINA1 era o caso real")
        void pontoForaDoMapaNaoSome() {
            // A primeira versão filtrava por AreaMapping.pointToArea(), um Map.of
            // de sete pontos escritos à mão. CANTINA1 não está nele, e outros
            // controllers já o tratam como ponto de primeira classe: o aluno da
            // cantina sumia da lista, em silêncio. Numa lista onde um nome que
            // falta é uma criança que ninguém procura, não há filtro seguro
            // senão nenhum.
            ev("0001", "CANTINA1", AccessAction.ENTRADA, 12, 0, null);
            PpmsSnapshot s = tirar();
            assertThat(s.getTotalDentro()).isEqualTo(1);
            assertThat(nomesDentro(s)).containsExactly("0001");
        }

        @Test
        @DisplayName("★★ um ponto comissionado depois (REFEI3) entra sozinho")
        void pontoNovoEntraSozinho() {
            ev("0002", "REFEI3", AccessAction.ENTRADA, 12, 0, null);
            assertThat(tirar().getTotalDentro()).isEqualTo(1);
        }

        @Test
        @DisplayName("★★★ o serviço NÃO manda lista de pontos ao banco — a consulta é por janela")
        void consultaNaoFiltraPonto() {
            // Trava estrutural: o teste anterior estubava com anyList() e por
            // isso era CEGO ao argumento. Aqui se prova que o finder usado é o
            // que não recebe ponto nenhum.
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            tirar();
            verify(accessLogRepository).findByTimestampBetweenOrderByTimestampAsc(any(), any());
            verify(accessLogRepository, never())
                    .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(any(), any(), any());
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ o retrato diz o que NÃO sabe")
    class Honestidade {

        @Test
        @DisplayName("★★ todo retrato carrega os avisos — não é a chamada")
        void sempreComAvisos() {
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            PpmsSnapshot s = tirar();
            assertThat(s.getAvisos())
                    .as("numa evacuação, acreditar que a contagem é a chamada faz alguém parar de procurar")
                    .contains("ppms.aviso.leitores", "ppms.aviso.nao.chamada");
        }

        @Test
        @DisplayName("★★ ponto SEM fechamento automático ganha aviso próprio — a enfermaria")
        void avisaPontoSemFechamento() {
            // A enfermaria não tem hardware: o registro é manual e a saída quase
            // nunca é lançada. Sem este aviso, a lista afirma que alguém está lá
            // desde as 9h quando a pessoa saiu e ninguém registrou.
            ev("0001", "ENFERM", AccessAction.ENTRADA, 9, 0, null);
            assertThat(tirar().getAvisos()).contains("ppms.aviso.sem.fechamento");
        }

        @Test
        @DisplayName("★★ com o fechamento automático DESLIGADO, o aviso vale para todos")
        void killSwitchDesligaTodosOsFechamentos() {
            autoCloseProps.setEnabled(false);
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 9, 0, null);
            assertThat(tirar().getAvisos()).contains("ppms.aviso.sem.fechamento");
        }

        @Test
        @DisplayName("★ sem gente nesses pontos, o aviso não aparece — não é ruído fixo")
        void semGenteNaoAvisa() {
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 9, 0, null);
            assertThat(tirar().getAvisos()).doesNotContain("ppms.aviso.sem.fechamento");
        }

        @Test
        @DisplayName("★ o retrato carimba a hora em que foi tirado")
        void carimbaHora() {
            assertThat(tirar().getGeradoEm()).isEqualTo(AGORA);
        }

        @Test
        @DisplayName("★ entre zonas físicas, a mais cheia primeiro")
        void zonaMaiorPrimeiro() {
            ev("0001", "BIBLIO", AccessAction.ENTRADA, 9, 0, null);
            ev("0002", "BIBLIO", AccessAction.ENTRADA, 9, 1, null);
            ev("0003", "ENFERM", AccessAction.ENTRADA, 9, 2, null);
            assertThat(tirar().getZonas().get(0).getPointId()).isEqualTo("BIBLIO");
        }

        @Test
        @DisplayName("★★★ EM_TRANSITO vai por ÚLTIMO mesmo sendo a maior — o CDI não pode ficar embaixo")
        void transitoPorUltimo() {
            // Numa evacuação, EM_TRANSITO conterá quase todo mundo. Ordenar por
            // tamanho empurraria o CDI e a enfermaria — onde uma criança fica
            // presa — para baixo de centenas de nomes no telefone de quem está
            // no pátio.
            ev("0001", "PORT1", AccessAction.ENTRADA, 8, 0, null);
            ev("0002", "PORT1", AccessAction.ENTRADA, 8, 1, null);
            ev("0003", "PORT1", AccessAction.ENTRADA, 8, 2, null);
            ev("0009", "ENFERM", AccessAction.ENTRADA, 9, 0, null);

            PpmsSnapshot s = tirar();
            assertThat(s.getZonas().get(0).getPointId())
                    .as("a enfermaria vem primeiro, com uma pessoa, contra três em trânsito")
                    .isEqualTo("ENFERM");
            assertThat(s.getZonas().get(s.getZonas().size() - 1).getPointId())
                    .isEqualTo(PpmsService.ZONA_EM_TRANSITO);
        }
    }
}
