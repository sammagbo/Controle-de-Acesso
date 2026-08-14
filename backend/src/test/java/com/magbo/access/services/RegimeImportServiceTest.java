package com.magbo.access.services;

import com.magbo.access.dto.RegimeImportRow;
import com.magbo.access.models.*;
import com.magbo.access.repositories.StudentRegimeRepository;
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
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * A CARGA EM LOTE — e a recusa de aplicar o que nao se pode aplicar.
 *
 * Sao 923 autorizacoes de responsaveis legais entrando de uma vez. O que este
 * teste protege nao e "o import funciona": e que nenhuma linha duvidosa vire uma
 * autorizacao gravada, e que o operador veja QUAIS corrigir antes de qualquer
 * escrita.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("RegimeImportService — simular antes, recusar o duvidoso")
class RegimeImportServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private StudentRegimeRepository regimeRepository;
    @Mock private RegimeSortieService regimeService;

    private RegimeImportService service;

    @BeforeEach
    void setUp() {
        service = new RegimeImportService(userRepository, regimeRepository, regimeService);
        when(regimeRepository.findVigente(anyString(), any())).thenReturn(Optional.empty());
    }

    private void aluno(String id, UserType tipo) {
        when(userRepository.findById(id)).thenReturn(Optional.of(
                User.builder().id(id).nome("Aluno " + id).turma("6A").tipo(tipo).ativo(true).build()));
    }

    private RegimeImportRow linha(int n, String matricula, String geral, String sortie) {
        RegimeImportRow r = new RegimeImportRow();
        r.setLinha(n);
        r.setMatricula(matricula);
        r.setRegimeGeneral(geral);
        r.setRegimeSortie(sortie);
        r.setValidFrom("2026-09-01");
        r.setAuthorizedByFamily("Mme Gonçalves");
        return r;
    }

    private RegimeImportService.RowPlan uma(RegimeImportRow... rs) {
        return service.plan(List.of(rs)).linhas().get(0);
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ a simulação NÃO escreve")
    class Simulacao {

        @Test
        @DisplayName("★★★ o preview não chama definir nem uma vez")
        void previewNaoGrava() {
            aluno("0001764", UserType.ALUNO);
            service.plan(List.of(linha(2, "0001764", "EXTERNE", "REGIME_1")));
            verify(regimeService, never()).definir(any(), any(), any(), any(), any(),
                    any(), any(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("★★ o apply chama, e com origem BULK — o histórico diz de onde veio")
        void applyGravaComOrigem() {
            aluno("0001764", UserType.ALUNO);
            service.apply(List.of(linha(2, "0001764", "EXTERNE", "REGIME_1")), "vie.scolaire");
            verify(regimeService).definir(eq("0001764"), eq(RegimeGeneral.EXTERNE),
                    eq(RegimeSortie.REGIME_1), eq(LocalDate.of(2026, 9, 1)), isNull(),
                    eq("Mme Gonçalves"), isNull(), isNull(), isNull(),
                    eq("vie.scolaire"), eq("BULK"));
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ o que é recusado, e por quê")
    class Recusas {

        /**
         * ⚠️ TODA recusa deste bloco roda pelo APPLY, nao pelo plan.
         *
         * A primeira versao testava as recusas em service.plan() — o caminho
         * onde escrever e IMPOSSIVEL por construcao (gravar=false). Elas
         * provavam o ROTULO "CONFLITO", nunca a ausencia de gravacao: mover o
         * `if (gravar) definir(...)` para antes das validacoes passava na
         * suite inteira e, no apply real, gravava a matricula duplicada, o
         * FUNC-201 e a linha sem autor (painel de revisao, testes e mutacao,
         * 14/08/2026). Este helper roda o caminho onde a escrita esta LIGADA e
         * afirma que `definir` nao foi chamado para a matricula recusada.
         */
        private RegimeImportService.RowPlan recusadaNoApply(RegimeImportRow r) {
            var plano = service.apply(new java.util.ArrayList<>(List.of(r)), "sam");
            verify(regimeService, never()).definir(eq(r.getMatricula() == null ? "" : r.getMatricula().trim()),
                    any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
            return plano.linhas().get(0);
        }

        @Test
        @DisplayName("★★★ data IMPOSSÍVEL no calendário (31/09) é CONFLITO daquela linha — nunca um 500 do lote")
        void dataImpossivelNaoDerrubaOLote() {
            // 31/09/2026 não é formato errado: é dia que não existe. LocalDate.of
            // lança DateTimeException (a MÃE de DateTimeParseException, não a
            // filha) e a primeira versão do parseData a deixava escapar — uma
            // célula digitada errada respondia 500 sem número de linha, no
            // preview E no apply, contra o contrato escrito da classe.
            aluno("0001764", UserType.ALUNO);
            RegimeImportRow ruim = linha(2, "0001764", "EXTERNE", "REGIME_1");
            ruim.setValidFrom("31/09/2026");

            aluno("0002000", UserType.ALUNO);
            RegimeImportRow boa = linha(3, "0002000", "EXTERNE", "REGIME_1");

            var plano = service.apply(new java.util.ArrayList<>(List.of(ruim, boa)), "sam");

            assertThat(plano.linhas().get(0).acao()).isEqualTo(RegimeImportService.Acao.CONFLITO);
            assertThat(plano.linhas().get(0).detalhe()).isEqualTo("regime.import.data.invalida");
            assertThat(plano.linhas().get(1).acao())
                    .as("a linha boa segue — o lote não morre pela célula errada")
                    .isEqualTo(RegimeImportService.Acao.CRIAR);
            verify(regimeService, never()).definir(eq("0001764"), any(), any(), any(),
                    any(), any(), any(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("★★ 29/02 de ano não bissexto e mês por extenso: CONFLITO, nunca exceção")
        void outrasDatasImpossiveis() {
            aluno("0001764", UserType.ALUNO);
            for (String v : new String[]{"29/02/2027", "01/set/2026", "32/01/2026"}) {
                RegimeImportRow r = linha(2, "0001764", "EXTERNE", "REGIME_1");
                r.setValidFrom(v);
                assertThat(uma(r).acao())
                        .as("data '%s' tem de virar CONFLITO da linha", v)
                        .isEqualTo(RegimeImportService.Acao.CONFLITO);
            }
        }

        @Test
        @DisplayName("★★ 'Signé le' ilegível é CONFLITO no PREVIEW — não descarte silencioso no apply")
        void assinadoEmIlegivelRecusadoNoPlano() {
            // A primeira versão só parseava assinadoEm dentro do if(gravar) e
            // engolia o erro com null: o preview mostrava a linha verde e a data
            // em que o responsável assinou o papel era jogada fora sem log.
            aluno("0001764", UserType.ALUNO);
            RegimeImportRow r = linha(2, "0001764", "EXTERNE", "REGIME_1");
            r.setAssinadoEm("2026-13-05");
            assertThat(uma(r).acao()).isEqualTo(RegimeImportService.Acao.CONFLITO);
            assertThat(uma(r).detalhe()).isEqualTo("regime.import.data.invalida");
        }

        @Test
        @DisplayName("★★ nota maior que a coluna (500) é CONFLITO no plano — não rollback no flush")
        void notaLongaRecusada() {
            aluno("0001764", UserType.ALUNO);
            RegimeImportRow r = linha(2, "0001764", "EXTERNE", "REGIME_1");
            r.setNote("x".repeat(501));
            assertThat(uma(r).acao()).isEqualTo(RegimeImportService.Acao.CONFLITO);
            assertThat(uma(r).detalhe()).isEqualTo("regime.import.texto.longo");
        }

        @Test
        @DisplayName("★★ aluno que não existe: CONFLITO, e as outras linhas seguem")
        void alunoAusente() {
            aluno("0001764", UserType.ALUNO);
            when(userRepository.findById("9999999")).thenReturn(Optional.empty());

            var plano = service.plan(List.of(
                    linha(2, "9999999", "EXTERNE", "REGIME_1"),
                    linha(3, "0001764", "EXTERNE", "REGIME_1")));

            assertThat(plano.linhas().get(0).acao()).isEqualTo(RegimeImportService.Acao.CONFLITO);
            assertThat(plano.linhas().get(1).acao())
                    .as("uma linha ruim não pode parar a planilha inteira")
                    .isEqualTo(RegimeImportService.Acao.CRIAR);
        }

        @Test
        @DisplayName("★★★ quem NÃO é aluno é recusado NO APPLY — e nada é gravado")
        void naoAlunoRecusado() {
            aluno("FUNC-201", UserType.FUNCIONARIO);
            assertThat(recusadaNoApply(linha(2, "FUNC-201", "EXTERNE", "REGIME_1")).acao())
                    .isEqualTo(RegimeImportService.Acao.CONFLITO);
        }

        @Test
        @DisplayName("★★★ matrícula repetida no MESMO arquivo: CONFLITO nas DUAS, nenhuma aplicada")
        void duplicadaInvalidaAsDuas() {
            // Escolher uma seria o sistema decidindo qual das duas autorizações
            // da família vale. Mesma disciplina das fotos.
            aluno("0001764", UserType.ALUNO);
            // Pelo APPLY: aqui a escrita está ligada, e é aqui que "nenhuma
            // aplicada" significa alguma coisa.
            var plano = service.apply(new java.util.ArrayList<>(List.of(
                    linha(2, "0001764", "EXTERNE", "REGIME_1"),
                    linha(7, "0001764", "DEMI_PENSIONNAIRE", "REGIME_3"))), "sam");

            assertThat(plano.linhas()).allMatch(l -> l.acao() == RegimeImportService.Acao.CONFLITO);
            verify(regimeService, never()).definir(any(), any(), any(), any(), any(),
                    any(), any(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("★★★ sem quem autorizou: recusada — planilha não afrouxa a exigência da tela")
        void semAutorRecusado() {
            aluno("0001764", UserType.ALUNO);
            RegimeImportRow r = linha(2, "0001764", "EXTERNE", "REGIME_1");
            r.setAuthorizedByFamily("   ");
            // Pelo apply: sem autor a linha não é prova de nada, e é no caminho
            // com escrita ligada que isso precisa estar provado.
            assertThat(recusadaNoApply(r).acao()).isEqualTo(RegimeImportService.Acao.CONFLITO);
        }

        @Test
        @DisplayName("★★ a grafia FRANCESA — 'Régime 1', com acento — é aceita")
        void aceitaAGrafiaFrancesa() {
            // "Régime" é como a palavra se escreve na língua da escola. A
            // primeira versão comparava sem tirar o acento, e a única grafia
            // recusada era a correta (painel, Vie Scolaire, 14/08).
            aluno("0001764", UserType.ALUNO);
            RegimeImportRow r = linha(2, "0001764", "Demi-pensionnaire", "Régime 1");
            assertThat(uma(r).acao()).isEqualTo(RegimeImportService.Acao.CRIAR);
        }

        @Test
        @DisplayName("★★ regime escrito errado é recusado, não adivinhado")
        void enumInvalido() {
            aluno("0001764", UserType.ALUNO);
            assertThat(uma(linha(2, "0001764", "EXTERNE", "REGIME_9")).acao())
                    .isEqualTo(RegimeImportService.Acao.CONFLITO);
        }

        @Test
        @DisplayName("★★ datas invertidas são recusadas")
        void datasInvertidas() {
            aluno("0001764", UserType.ALUNO);
            RegimeImportRow r = linha(2, "0001764", "EXTERNE", "REGIME_1");
            r.setValidUntil("2026-08-01");
            assertThat(uma(r).acao()).isEqualTo(RegimeImportService.Acao.CONFLITO);
        }

        @Test
        @DisplayName("★★★ zero à esquerda comido pelo Excel vira CONFLITO, não outro aluno")
        void zeroComidoNaoViraOutroAluno() {
            // 0001764 e 1764 são alunos diferentes. Adivinhar o zero acertaria às
            // vezes e, quando errasse, gravaria a autorização de uma criança no
            // cadastro de outra.
            aluno("0001764", UserType.ALUNO);
            when(userRepository.findById("1764")).thenReturn(Optional.empty());
            assertThat(uma(linha(2, "1764", "EXTERNE", "REGIME_1")).acao())
                    .isEqualTo(RegimeImportService.Acao.CONFLITO);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★ o que a planilha aceita escrito como o carnet")
    class Vocabulario {

        @Test
        @DisplayName("★★ 'regime 1', 'R1' e '1' são o mesmo — ninguém digita REGIME_1")
        void aceitaComoNoCarnet() {
            aluno("0001764", UserType.ALUNO);
            for (String v : List.of("1", "R1", "regime 1", "REGIME_1")) {
                assertThat(uma(linha(2, "0001764", "EXTERNE", v)).acao())
                        .as("valor: " + v)
                        .isEqualTo(RegimeImportService.Acao.CRIAR);
            }
        }

        @Test
        @DisplayName("★ 'DP' é demi-pensionnaire")
        void aceitaDP() {
            aluno("0001764", UserType.ALUNO);
            assertThat(uma(linha(2, "0001764", "DP", "REGIME_1")).acao())
                    .isEqualTo(RegimeImportService.Acao.CRIAR);
        }

        @Test
        @DisplayName("★★ data francesa 01/09/2026 é aceita ao lado da ISO")
        void aceitaDataFrancesa() {
            aluno("0001764", UserType.ALUNO);
            RegimeImportRow r = linha(2, "0001764", "EXTERNE", "REGIME_1");
            r.setValidFrom("01/09/2026");
            service.apply(List.of(r), "x");
            verify(regimeService).definir(any(), any(), any(), eq(LocalDate.of(2026, 9, 1)),
                    any(), any(), any(), any(), any(), any(), any());
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★★ substituir, e não repetir")
    class Substituicao {

        private void vigente(RegimeSortie s, RegimeGeneral g, String autor) {
            when(regimeRepository.findVigente(eq("0001764"), any())).thenReturn(Optional.of(
                    StudentRegime.builder().id(1L).userId("0001764")
                            .regimeSortie(s).regimeGeneral(g)
                            .validFrom(LocalDate.of(2026, 8, 1))
                            .authorizedByFamily(autor).createdBy("x").build()));
        }

        @Test
        @DisplayName("★★ regime diferente do vigente: ATUALIZAR")
        void diferenteAtualiza() {
            aluno("0001764", UserType.ALUNO);
            vigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE, "Mme Gonçalves");
            assertThat(uma(linha(2, "0001764", "EXTERNE", "REGIME_3")).acao())
                    .isEqualTo(RegimeImportService.Acao.ATUALIZAR);
        }

        @Test
        @DisplayName("★★★ IDÊNTICO ao vigente: PULAR — não se enche o histórico de linhas sem diferença")
        void identicoPula() {
            aluno("0001764", UserType.ALUNO);
            vigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE, "Mme Gonçalves");
            assertThat(uma(linha(2, "0001764", "EXTERNE", "REGIME_1")).acao())
                    .isEqualTo(RegimeImportService.Acao.PULAR);
        }

        @Test
        @DisplayName("★★ mesmo regime, OUTRO autorizador: ATUALIZAR — quem assinou mudou")
        void autorDiferenteAtualiza() {
            aluno("0001764", UserType.ALUNO);
            vigente(RegimeSortie.REGIME_1, RegimeGeneral.EXTERNE, "a avó");
            assertThat(uma(linha(2, "0001764", "EXTERNE", "REGIME_1")).acao())
                    .as("o campo que é prova mudou; isso não é 'nada a fazer'")
                    .isEqualTo(RegimeImportService.Acao.ATUALIZAR);
        }
    }

    // ─────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("★ o plano é legível")
    class Plano {

        @Test
        @DisplayName("★ os totais somam e trazem TOTAL")
        void totaisSomam() {
            aluno("0001764", UserType.ALUNO);
            when(userRepository.findById("9999999")).thenReturn(Optional.empty());
            var plano = service.plan(List.of(
                    linha(2, "0001764", "EXTERNE", "REGIME_1"),
                    linha(3, "9999999", "EXTERNE", "REGIME_1")));

            assertThat(plano.totais().get("TOTAL")).isEqualTo(2);
            assertThat(plano.totais().get("CRIAR")).isEqualTo(1);
            assertThat(plano.totais().get("CONFLITO")).isEqualTo(1);
            assertThat(plano.aplicado()).isFalse();
        }

        @Test
        @DisplayName("★ a linha traz o NÚMERO da linha da planilha, para o operador achar")
        void trazONumeroDaLinha() {
            aluno("0001764", UserType.ALUNO);
            assertThat(uma(linha(42, "0001764", "EXTERNE", "REGIME_1")).linha()).isEqualTo(42);
        }
    }
}
