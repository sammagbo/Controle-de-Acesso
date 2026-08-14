package com.magbo.access.services;

import com.magbo.access.config.RegimeProperties;
import com.magbo.access.dto.ExitDecision;
import com.magbo.access.dto.RegimeDecision;
import com.magbo.access.models.*;
import com.magbo.access.repositories.StudentRegimeEventRepository;
import com.magbo.access.repositories.StudentRegimeRepository;
import com.magbo.access.repositories.UserRepository;
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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * O REGIME DE SORTIE — e, sobretudo, os tres estados em que o sistema NAO deve
 * fingir que sabe.
 *
 * O que este teste protege nao e "a funcao devolve o enum certo": e que o
 * sistema nunca diga verde para quem nao pode sair, nunca diga vermelho para
 * quem pode, e nunca confunda "nao ha regime cadastrado" com "regime proibe".
 * Os tres erros custam coisas diferentes e todos custam caro.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("RegimeSortieService — o direito anual de sair")
class RegimeSortieServiceTest {

    private static final String ALUNO = "0003535";
    private static final LocalDate HOJE = LocalDate.of(2026, 8, 14);

    @Mock private StudentRegimeRepository regimeRepository;
    @Mock private StudentRegimeEventRepository eventRepository;
    @Mock private UserRepository userRepository;
    @Mock private ExitPermissionService exitPermissionService;
    @Mock private com.magbo.access.repositories.StudentExitPermissionRepository permissionRepository;
    @Mock private com.magbo.access.repositories.AccessLogRepository accessLogRepository;

    private RegimeProperties props;
    private RegimeSortieService service;

    @BeforeEach
    void setUp() {
        props = new RegimeProperties();
        props.setFimManha(LocalTime.of(12, 0));
        props.setFimDia(LocalTime.of(17, 0));
        props.setToleranciaMinutos(15);
        props.setRetomadaTarde(LocalTime.of(14, 0));
        props.setDesconhecido("OBSERVATION");
        props.setHabilitado(true);

        service = new RegimeSortieService(regimeRepository, eventRepository,
                userRepository, exitPermissionService, accessLogRepository, props, permissionRepository);

        // Por omissao: e aluno ativo, sem permissao pontual, sem regime.
        aluno(UserType.ALUNO);
        when(exitPermissionService.evaluate(anyString(), any()))
                .thenReturn(new ExitDecision(false, DenialReason.EXIT_NOT_AUTHORIZED, null, null));
        when(regimeRepository.findVigente(anyString(), any())).thenReturn(Optional.empty());
        when(regimeRepository.save(any())).thenAnswer(inv -> {
            StudentRegime r = inv.getArgument(0);
            if (r.getId() == null) r.setId(1L);
            return r;
        });
    }

    private void aluno(UserType tipo) {
        User u = User.builder().id(ALUNO).nome("Aurélie Gonçalves").tipo(tipo).ativo(true).build();
        when(userRepository.findById(ALUNO)).thenReturn(Optional.of(u));
    }

    private void regimeVigente(RegimeSortie sortie, RegimeGeneral geral) {
        StudentRegime r = StudentRegime.builder()
                .id(10L).userId(ALUNO).regimeSortie(sortie).regimeGeneral(geral)
                .validFrom(HOJE.minusMonths(1)).authorizedByFamily("Mme Gonçalves")
                .createdBy("vie.scolaire").build();
        when(regimeRepository.findVigente(eq(ALUNO), any())).thenReturn(Optional.of(r));
    }

    private RegimeDecision as(int hora, int minuto) {
        return service.avaliar(ALUNO, LocalDateTime.of(HOJE, LocalTime.of(hora, minuto)));
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ quem NAO e aluno nao tem regime — e nao pode ser barrado por isso")
    class NaoAluno {

        @Test
        @DisplayName("★★ professor saindo as 10h: NON_APPLICABLE, nunca negado")
        void professorNaoEBarrado() {
            aluno(UserType.PROFESSOR);
            RegimeDecision d = as(10, 0);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.NON_APPLICABLE);
            assertThat(d.exigeAtencao()).isFalse();
        }

        @Test
        @DisplayName("funcionario idem — e a razao de a regra poder ser ligada na portaria")
        void funcionarioIdem() {
            aluno(UserType.FUNCIONARIO);
            assertThat(as(9, 30).verdict()).isEqualTo(RegimeVerdict.NON_APPLICABLE);
        }

        @Test
        @DisplayName("pessoa desconhecida no cadastro nao vira vermelho")
        void desconhecidoNaoEVermelho() {
            when(userRepository.findById(ALUNO)).thenReturn(Optional.empty());
            assertThat(as(9, 30).verdict()).isEqualTo(RegimeVerdict.NON_APPLICABLE);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ a excecao pontual VENCE a regra anual")
    class PermissaoPontual {

        @Test
        @DisplayName("★★ regime 1 COM permissao de hoje: sai — o dentista existe")
        void permissaoVenceRegime1() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            when(exitPermissionService.evaluate(anyString(), any()))
                    .thenReturn(new ExitDecision(true, null, 77L, ExitPermissionType.SINGLE));

            RegimeDecision d = as(14, 0);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.AUTORISE);
            assertThat(d.permissionId()).isEqualTo(77L);
            assertThat(d.motivo()).isEqualTo("regime.motivo.permissao.pontual");
        }

        @Test
        @DisplayName("★★★ a permissao JA CONSUMIDA por esta saida ainda vale — nao vira vermelho")
        void permissaoConsumidaContinuaValendo() {
            // Uma SINGLE e consumida no instante da passagem (ACTIVE -> USED).
            // Tres segundos depois a tela do portao pede o veredicto DAQUELA
            // passagem: sem esta regra, o evaluate() nao acha mais nada ativo e
            // o aluno que saiu com autorizacao assinada aparece em VERMELHO,
            // "nao deve sair sozinho", depois de ter saido legitimamente.
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            LocalDateTime passagem = LocalDateTime.of(HOJE, LocalTime.of(14, 0));
            when(permissionRepository.findByUserIdAndStatus(eq(ALUNO), eq(ExitPermissionStatus.USED)))
                    .thenReturn(List.of(StudentExitPermission.builder()
                            .id(77L).userId(ALUNO).permissionType(ExitPermissionType.SINGLE)
                            .status(ExitPermissionStatus.USED)
                            .usedAt(passagem.plusSeconds(3))
                            .build()));

            RegimeDecision d = service.avaliar(ALUNO, passagem);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.AUTORISE);
            assertThat(d.permissionId()).isEqualTo(77L);
        }

        @Test
        @DisplayName("★★ uma permissao consumida NOUTRA hora nao serve de alibi")
        void consumoDistanteNaoVale() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            LocalDateTime passagem = LocalDateTime.of(HOJE, LocalTime.of(14, 0));
            when(permissionRepository.findByUserIdAndStatus(eq(ALUNO), eq(ExitPermissionStatus.USED)))
                    .thenReturn(List.of(StudentExitPermission.builder()
                            .id(78L).userId(ALUNO).permissionType(ExitPermissionType.SINGLE)
                            .status(ExitPermissionStatus.USED)
                            .usedAt(passagem.minusHours(3))
                            .build()));

            assertThat(service.avaliar(ALUNO, passagem).verdict())
                    .as("uma saida de tres horas antes nao autoriza esta")
                    .isEqualTo(RegimeVerdict.NON_AUTORISE);
        }

        @Test
        @DisplayName("a permissao e consultada ANTES do regime, sempre")
        void permissaoConsultadaPrimeiro() {
            when(exitPermissionService.evaluate(anyString(), any()))
                    .thenReturn(new ExitDecision(true, null, 5L, ExitPermissionType.SINGLE));
            as(10, 0);
            verify(exitPermissionService).evaluate(eq(ALUNO), any());
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ SEM regime cadastrado e CINZA, nunca vermelho")
    class SemRegime {

        @Test
        @DisplayName("★★ dia 1, 923 alunos sem regime: INCONNU e nao NON_AUTORISE")
        void semRegimeEInconnu() {
            RegimeDecision d = as(10, 0);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.INCONNU);
            assertThat(d.motivo()).isEqualTo("regime.motivo.sem.regime");
        }

        @Test
        @DisplayName("so vira vermelho quando o Sam trocar a property para DENY")
        void denyExplicitoMuda() {
            props.setDesconhecido("DENY");
            assertThat(as(10, 0).verdict()).isEqualTo(RegimeVerdict.NON_AUTORISE);
        }

        @Test
        @DisplayName("★ regime EXPIRADO conta como ausente, nao como proibicao")
        void expiradoEInconnu() {
            // findVigente ja filtra por data; aqui e o contrato: nao devolve nada.
            when(regimeRepository.findVigente(eq(ALUNO), any())).thenReturn(Optional.empty());
            assertThat(as(10, 0).verdict()).isEqualTo(RegimeVerdict.INCONNU);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ os tres regimes, no meio da jornada")
    class OsTresRegimes {

        @Test
        @DisplayName("★★ regime 1 (surveille) as 10h: NAO deve sair sozinho")
        void regime1EVermelho() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            RegimeDecision d = as(10, 0);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.NON_AUTORISE);
            assertThat(d.regimeSortie()).isEqualTo(RegimeSortie.REGIME_1);
        }

        @Test
        @DisplayName("★★ regime 2 (semi-libre): AMARELO — depende de o professor ter faltado")
        void regime2EAmarelo() {
            regimeVigente(RegimeSortie.REGIME_2, RegimeGeneral.EXTERNE);
            RegimeDecision d = as(10, 0);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.A_VERIFIER);
            assertThat(d.dependeDeGrade()).isTrue();
        }

        @Test
        @DisplayName("★★ regime 3 (libre): verde, mas assumindo que depende da grade")
        void regime3EVerdeComRessalva() {
            regimeVigente(RegimeSortie.REGIME_3, RegimeGeneral.EXTERNE);
            RegimeDecision d = as(10, 0);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.AUTORISE);
            // ⚠️ O verde responde "o regime anual autoriza", nao "conferi a
            // grade". A tela le este campo para dizer isso ao AED.
            assertThat(d.dependeDeGrade()).isTrue();
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ o fim da jornada — sem ele, centenas de vermelhos as 17h")
    class FimDaJornada {

        @Test
        @DisplayName("★★ regime 1 as 17h: verde. Todo mundo vai para casa")
        void fimDoDiaLiberaRegime1() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            RegimeDecision d = as(17, 0);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.AUTORISE);
            assertThat(d.motivo()).isEqualTo("regime.motivo.fim.jornada");
        }

        @Test
        @DisplayName("★★ EXTERNE ao meio-dia: verde — a jornada dele acabou")
        void externoSaiAoMeioDia() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE);
            assertThat(as(12, 0).verdict()).isEqualTo(RegimeVerdict.AUTORISE);
        }

        @Test
        @DisplayName("★★ DEMI_PENSIONNAIRE ao meio-dia: NAO — ele almoca aqui")
        void demiPensionnaireFicaParaOAlmoco() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            assertThat(as(12, 0).verdict()).isEqualTo(RegimeVerdict.NON_AUTORISE);
        }

        @Test
        @DisplayName("★ a tolerancia vale: externo as 11h50 com folga de 15min ja sai")
        void toleranciaAntesDoSino() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE);
            assertThat(as(11, 50).verdict()).isEqualTo(RegimeVerdict.AUTORISE);
        }

        @Test
        @DisplayName("★ mas 11h30 ainda e meio da jornada — a folga nao vira uma hora")
        void toleranciaNaoEHoraLivre() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE);
            assertThat(as(11, 30).verdict()).isEqualTo(RegimeVerdict.NON_AUTORISE);
        }

        @Test
        @DisplayName("★★★ FALSO VERDE DA TARDE: externo de regime 1 as 14h30 NAO e saida normal")
        void externoNaoFicaLiberadoATardeInteira() {
            // A primeira versao perguntava so "e depois do fim da manha?" e
            // respondia AUTORISE com motivo 'fim de jornada' as 14h30, as 16h e
            // ate a meia-noite. O aluno de regime 1 que se manda depois do
            // almoco recebia verde — e uma afirmacao de que a saida foi normal.
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE);
            RegimeDecision d = as(14, 30);
            assertThat(d.verdict())
                    .as("a meia-jornada da tarde recomecou; isto nao e fim de jornada")
                    .isEqualTo(RegimeVerdict.NON_AUTORISE);
        }

        @Test
        @DisplayName("★★ a janela do meio-dia do externo tem FIM: 13h59 ainda libera, 14h nao")
        void janelaDoMeioDiaFecha() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE);
            assertThat(as(13, 0).verdict())
                    .as("dentro da janela do almoco o externo vai embora")
                    .isEqualTo(RegimeVerdict.AUTORISE);
            assertThat(as(14, 0).verdict())
                    .as("depois da retomada da tarde, nao")
                    .isEqualTo(RegimeVerdict.NON_AUTORISE);
        }

        @Test
        @DisplayName("★ e o fim do DIA continua liberando o externo, as 17h")
        void fimDoDiaAindaLiberaExterno() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE);
            assertThat(as(17, 0).verdict()).isEqualTo(RegimeVerdict.AUTORISE);
        }

        @Test
        @DisplayName("★★ sem regime cadastrado, as 17h tambem e verde — nao ha o que alertar")
        void fimDoDiaValeSemRegime() {
            RegimeDecision d = as(17, 30);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.AUTORISE);
        }

        @Test
        @DisplayName("★ sem regime GERAL conhecido usa o criterio mais restritivo (fim do dia)")
        void semGeralUsaFimDoDia() {
            // 12h30: seria liberado se fosse EXTERNE; sem saber, nao se antecipa.
            RegimeDecision d = as(12, 30);
            assertThat(d.verdict()).isEqualTo(RegimeVerdict.INCONNU);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("a regra pode ser desligada inteira")
    class Desligada {

        @Test
        @DisplayName("habilitado=false: ninguem e avaliado")
        void desligadaNaoAvalia() {
            props.setHabilitado(false);
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            assertThat(as(10, 0).verdict()).isEqualTo(RegimeVerdict.NON_APPLICABLE);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ escrita: prova, historico e as guardas")
    class Escrita {

        @Test
        @DisplayName("★★ definir grava o regime E o evento de historico")
        void gravaHistoricoJunto() {
            service.definir(ALUNO, RegimeGeneral.EXTERNE, RegimeSortie.REGIME_2,
                    HOJE, null, "Mme Gonçalves", "carnet 42", HOJE, null, "vie.scolaire", "UI");

            verify(regimeRepository).save(any(StudentRegime.class));
            ArgumentCaptor<StudentRegimeEvent> ev = ArgumentCaptor.forClass(StudentRegimeEvent.class);
            verify(eventRepository).save(ev.capture());
            assertThat(ev.getValue().getNewRegimeSortie()).isEqualTo(RegimeSortie.REGIME_2);
            assertThat(ev.getValue().getChangedBy()).isEqualTo("vie.scolaire");
            assertThat(ev.getValue().getSource()).isEqualTo("UI");
        }

        @Test
        @DisplayName("★★ substituir ENCERRA o anterior em vez de apagar — e prova")
        void substituirEncerraAnterior() {
            StudentRegime antigo = StudentRegime.builder()
                    .id(9L).userId(ALUNO).regimeSortie(RegimeSortie.REGIME_1)
                    .regimeGeneral(RegimeGeneral.EXTERNE).validFrom(HOJE.minusMonths(6))
                    .authorizedByFamily("Mme Gonçalves").createdBy("x").build();
            when(regimeRepository.findVigente(eq(ALUNO), any())).thenReturn(Optional.of(antigo));

            service.definir(ALUNO, RegimeGeneral.EXTERNE, RegimeSortie.REGIME_3,
                    HOJE, null, "M. Gonçalves", null, HOJE, null, "cpe", "UI");

            assertThat(antigo.getEncerradoEm()).isNotNull();
            assertThat(antigo.getEncerradoPor()).isEqualTo("cpe");
            verify(regimeRepository, never()).delete(any());

            ArgumentCaptor<StudentRegimeEvent> ev = ArgumentCaptor.forClass(StudentRegimeEvent.class);
            verify(eventRepository).save(ev.capture());
            assertThat(ev.getValue().getOldRegimeSortie()).isEqualTo(RegimeSortie.REGIME_1);
            assertThat(ev.getValue().getNewRegimeSortie()).isEqualTo(RegimeSortie.REGIME_3);
        }

        @Test
        @DisplayName("★★ regime para quem NAO e aluno e recusado")
        void naoAlunoRecusado() {
            aluno(UserType.PROFESSOR);
            assertThatThrownBy(() -> service.definir(ALUNO, RegimeGeneral.EXTERNE,
                    RegimeSortie.REGIME_3, HOJE, null, "alguem", null, null, null, "x", "UI"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("instituto de aluno");
        }

        @Test
        @DisplayName("★★ sem quem autorizou na familia: recusado — nao e prova de nada")
        void semAutorRecusado() {
            assertThatThrownBy(() -> service.definir(ALUNO, RegimeGeneral.EXTERNE,
                    RegimeSortie.REGIME_3, HOJE, null, "   ", null, null, null, "x", "UI"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("autorizou");
        }

        @Test
        @DisplayName("validUntil antes de validFrom e recusado")
        void datasInvertidas() {
            assertThatThrownBy(() -> service.definir(ALUNO, RegimeGeneral.EXTERNE,
                    RegimeSortie.REGIME_3, HOJE, HOJE.minusDays(1), "Mme", null, null, null, "x", "UI"))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("★ encerrar deixa a linha e grava o evento")
        void encerrarDeixaLinha() {
            StudentRegime vigente = StudentRegime.builder()
                    .id(9L).userId(ALUNO).regimeSortie(RegimeSortie.REGIME_2)
                    .regimeGeneral(RegimeGeneral.EXTERNE).validFrom(HOJE.minusMonths(2))
                    .authorizedByFamily("Mme").createdBy("x").build();
            when(regimeRepository.findVigente(eq(ALUNO), any())).thenReturn(Optional.of(vigente));

            service.encerrar(ALUNO, "cpe", "saiu da escola");

            assertThat(vigente.getEncerradoEm()).isNotNull();
            verify(regimeRepository, never()).delete(any());
            verify(eventRepository).save(any(StudentRegimeEvent.class));
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ os veredictos que a tela do portao consome")
    class NoPortao {

        private com.magbo.access.models.AccessLog log(long id, String user,
                com.magbo.access.models.AccessAction acao, int h, int m) {
            return com.magbo.access.models.AccessLog.builder()
                    .id(id).userId(user).pointId("PORT1").action(acao)
                    .timestamp(LocalDateTime.of(HOJE, LocalTime.of(h, m))).build();
        }

        private void logs(com.magbo.access.models.AccessLog... ls) {
            when(accessLogRepository.findByPointIdInAndTimestampBetweenOrderByTimestampDesc(
                    any(), any(), any())).thenReturn(List.of(ls));
        }

        @Test
        @DisplayName("★★★ cada linha e julgada na HORA DA PASSAGEM, nao na da consulta")
        void julgaNaHoraDaPassagem() {
            // A saida das 10h de um regime 1 e NON_AUTORISE. Se fosse avaliada
            // "agora" — e esta suite roda a qualquer hora —, depois das 17h ela
            // viraria AUTORISE por fim de jornada, e o historico do portao se
            // reescreveria sob os olhos do AED ao longo do dia.
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            logs(log(1L, ALUNO, com.magbo.access.models.AccessAction.SAIDA, 10, 0));

            List<com.magbo.access.dto.GateVerdict> v = service.veredictosNoPortao("PORT1", 20);

            assertThat(v).hasSize(1);
            assertThat(v.get(0).verdict()).isEqualTo(RegimeVerdict.NON_AUTORISE);
            assertThat(v.get(0).momento()).isEqualTo(LocalDateTime.of(HOJE, LocalTime.of(10, 0)));
            assertThat(v.get(0).logId()).isEqualTo(1L);
        }

        @Test
        @DisplayName("★★ ENTRADA nao entra — o regime fala de SAIDA")
        void entradaFicaDeFora() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            logs(log(1L, ALUNO, com.magbo.access.models.AccessAction.ENTRADA, 8, 0));
            assertThat(service.veredictosNoPortao("PORT1", 20)).isEmpty();
        }

        @Test
        @DisplayName("★★ servidor nao entra — regime e instituto de aluno")
        void servidorFicaDeFora() {
            aluno(UserType.PROFESSOR);
            logs(log(1L, ALUNO, com.magbo.access.models.AccessAction.SAIDA, 17, 0));
            assertThat(service.veredictosNoPortao("PORT1", 20)).isEmpty();
        }

        @Test
        @DisplayName("★★ o teto e respeitado — isto roda no polling da tela do portao")
        void tetoRespeitado() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            logs(log(1L, ALUNO, com.magbo.access.models.AccessAction.SAIDA, 10, 0),
                 log(2L, ALUNO, com.magbo.access.models.AccessAction.SAIDA, 10, 5),
                 log(3L, ALUNO, com.magbo.access.models.AccessAction.SAIDA, 10, 9));
            assertThat(service.veredictosNoPortao("PORT1", 2)).hasSize(2);
        }

        @Test
        @DisplayName("★ um limite absurdo nao vira consulta absurda")
        void tetoTemTeto() {
            regimeVigente(RegimeSortie.REGIME_1, RegimeGeneral.DEMI_PENSIONNAIRE);
            logs(log(1L, ALUNO, com.magbo.access.models.AccessAction.SAIDA, 10, 0));
            assertThat(service.veredictosNoPortao("PORT1", 100000)).hasSize(1);
            assertThat(service.veredictosNoPortao("PORT1", -5)).hasSize(1);
        }

        @Test
        @DisplayName("★★ sem regime cadastrado a linha APARECE, como INCONNU")
        void semRegimeApareceCinza() {
            // Cinza tambem e informacao: diz ao AED "confira o carnet, como
            // antes". Omitir seria devolve-lo a memoria.
            logs(log(1L, ALUNO, com.magbo.access.models.AccessAction.SAIDA, 10, 0));
            List<com.magbo.access.dto.GateVerdict> v = service.veredictosNoPortao("PORT1", 20);
            assertThat(v).hasSize(1);
            assertThat(v.get(0).verdict()).isEqualTo(RegimeVerdict.INCONNU);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★ vigencia deterministica")
    class Vigencia {

        @Test
        @DisplayName("★ duas linhas sobrepostas: a consulta ordena e a mais recente vence")
        void sobreposicaoEDeterministica() {
            // Contrato do repositorio (a ordem vive na @Query). Aqui se prova o
            // default method: dada a lista ordenada, escolhe SEMPRE a primeira.
            StudentRegime maisNova = StudentRegime.builder().id(20L).userId(ALUNO)
                    .regimeSortie(RegimeSortie.REGIME_3).regimeGeneral(RegimeGeneral.EXTERNE)
                    .validFrom(HOJE.minusDays(1)).authorizedByFamily("a").createdBy("x").build();
            StudentRegime maisVelha = StudentRegime.builder().id(19L).userId(ALUNO)
                    .regimeSortie(RegimeSortie.REGIME_1).regimeGeneral(RegimeGeneral.EXTERNE)
                    .validFrom(HOJE.minusMonths(3)).authorizedByFamily("a").createdBy("x").build();

            StudentRegimeRepository real = mock(StudentRegimeRepository.class);
            when(real.findVigentes(eq(ALUNO), any())).thenReturn(List.of(maisNova, maisVelha));
            when(real.findVigente(eq(ALUNO), any())).thenCallRealMethod();

            assertThat(real.findVigente(ALUNO, HOJE)).contains(maisNova);
        }

        @Test
        @DisplayName("vigenteEm respeita o intervalo e o encerramento")
        void vigenteEmRespeita() {
            StudentRegime r = StudentRegime.builder()
                    .validFrom(LocalDate.of(2026, 8, 1)).validUntil(LocalDate.of(2027, 7, 15))
                    .build();
            assertThat(r.vigenteEm(LocalDate.of(2026, 8, 14))).isTrue();
            assertThat(r.vigenteEm(LocalDate.of(2026, 7, 31))).isFalse();
            assertThat(r.vigenteEm(LocalDate.of(2027, 7, 16))).isFalse();

            r.setEncerradoEm(LocalDateTime.now());
            assertThat(r.vigenteEm(LocalDate.of(2026, 8, 14))).isFalse();
        }

        @Test
        @DisplayName("validUntil nulo = ate segunda ordem")
        void semFimContinuaVigente() {
            StudentRegime r = StudentRegime.builder().validFrom(LocalDate.of(2026, 8, 1)).build();
            assertThat(r.vigenteEm(LocalDate.of(2030, 1, 1))).isTrue();
        }
    }
}
