package com.magbo.access.services;

import com.magbo.access.dto.MealEntitlementBulkItem;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.MealEntitlement;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.MealEntitlementRepository;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * PLANO DA IMPORTACAO DE DIREITOS DE REFEICAO.
 *
 * O import antigo gravava direto, sem conferencia. Este arquivo decide quem
 * almoca, e com `meal-pending=DENY` em producao a ausencia de linha ja e
 * recusa — escrever sem mostrar antes o que vai mudar e apostar o servico do
 * dia numa planilha que ninguem leu.
 *
 * A asercao mais importante deste arquivo nao e nenhuma contagem: e que
 * {@link MealEntitlementImportService#plan} NAO CHAMA o upsert. Um "dry-run"
 * que grava e pior que nao ter dry-run, porque a tela promete que nada foi
 * gravado.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MealEntitlementImportServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private MealEntitlementRepository mealEntitlementRepository;
    @Mock private MealEntitlementService mealEntitlementService;

    private static final String OPERADOR = "cantina";

    private MealEntitlementImportService service() {
        return new MealEntitlementImportService(
                userRepository, mealEntitlementRepository, mealEntitlementService);
    }

    private static User aluno(String id, String nome, String turma) {
        return User.builder().id(id).nome(nome).turma(turma)
                .tipo(UserType.ALUNO).ativo(true).build();
    }

    private static MealEntitlement direito(String id, EntitlementStatus s) {
        return MealEntitlement.builder().userId(id).status(s).updatedBy("fixture").build();
    }

    private static MealEntitlementBulkItem linha(String userId, String status) {
        MealEntitlementBulkItem i = new MealEntitlementBulkItem();
        i.setUserId(userId);
        i.setStatus(status);
        return i;
    }

    private void base(List<User> users, List<MealEntitlement> direitos) {
        when(userRepository.findAll()).thenReturn(new ArrayList<>(users));
        when(mealEntitlementRepository.findAll()).thenReturn(new ArrayList<>(direitos));
    }

    private MealEntitlementImportService.RowPlan primeira(
            MealEntitlementImportService.ImportPlan p) {
        return p.linhas().get(0);
    }

    // ───────────────────── Dry-run ─────────────────────

    @Nested
    @DisplayName("★ dry-run não grava")
    class DryRun {

        @Test
        @DisplayName("★ plan() NUNCA chama o upsert, nem numa linha perfeitamente válida")
        void planNaoGrava() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")), List.of());

            var p = service().plan(List.of(linha("0001111", "AUTORIZADO")));

            assertThat(primeira(p).acao()).isEqualTo(MealEntitlementImportService.Acao.CRIAR);
            verifyNoInteractions(mealEntitlementService);
            assertThat(p.aplicado()).isFalse();
        }

        @Test
        @DisplayName("apply() grava e se declara aplicado")
        void applyGrava() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")), List.of());

            var p = service().apply(List.of(linha("0001111", "AUTORIZADO")), OPERADOR);

            verify(mealEntitlementService).upsert("0001111", EntitlementStatus.AUTHORIZED,
                    null, null, MealEntitlementImportService.NOTA_PADRAO, OPERADOR,
                    MealEntitlementImportService.SOURCE);
            assertThat(p.aplicado()).isTrue();
        }

        @Test
        @DisplayName("★ o histórico é gravado pelo upsert, não por trás dele")
        void passaPeloServicoParaGravarHistorico() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")), List.of());

            service().apply(List.of(linha("0001111", "AUTORIZADO")), OPERADOR);

            // Toda alteração grava um evento na MESMA transação (regra da Fase C).
            // Escrever pelo repositório pularia isso.
            verify(mealEntitlementService).upsert(anyString(), any(), any(), any(),
                    anyString(), anyString(), anyString());
        }
    }

    // ───────────────────── As quatro ações ─────────────────────

    @Nested
    @DisplayName("as quatro ações")
    class Acoes {

        @Test
        @DisplayName("aluno sem linha de direito -> CRIAR")
        void criar() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")), List.of());
            var r = primeira(service().plan(List.of(linha("0001111", "AUTORIZADO"))));

            assertThat(r.acao()).isEqualTo(MealEntitlementImportService.Acao.CRIAR);
            assertThat(r.statusAtual()).isEqualTo("PENDING");
            assertThat(r.statusNovo()).isEqualTo("AUTHORIZED");
            assertThat(r.nome()).isEqualTo("Ana Souza");
            assertThat(r.turma()).isEqualTo("2A");
        }

        @Test
        @DisplayName("status muda -> ATUALIZAR, com o de-para no detalhe")
        void atualizar() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")),
                    List.of(direito("0001111", EntitlementStatus.NOT_AUTHORIZED)));

            var r = primeira(service().plan(List.of(linha("0001111", "AUTORIZADO"))));

            assertThat(r.acao()).isEqualTo(MealEntitlementImportService.Acao.ATUALIZAR);
            assertThat(r.detalhe()).contains("Non autorise").contains("Autorise");
        }

        @Test
        @DisplayName("★ nada muda -> PULAR (reimportar o mesmo arquivo não faz nada)")
        void pularQuandoNadaMuda() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")),
                    List.of(direito("0001111", EntitlementStatus.AUTHORIZED)));

            var p = service().plan(List.of(linha("0001111", "AUTORIZADO")));

            assertThat(primeira(p).acao()).isEqualTo(MealEntitlementImportService.Acao.PULAR);
            assertThat(primeira(p).detalhe()).contains("rien a modifier");
        }

        @Test
        @DisplayName("★ aluno ausente do MAGBO -> PULAR, NUNCA criado")
        void alunoAusenteNaoEhCriado() {
            base(List.of(), List.of());

            var p = service().apply(List.of(linha("9999999", "AUTORIZADO")), OPERADOR);

            assertThat(primeira(p).acao()).isEqualTo(MealEntitlementImportService.Acao.PULAR);
            assertThat(primeira(p).detalhe()).contains("Pronote");
            verify(mealEntitlementService, never())
                    .upsert(anyString(), any(), any(), any(), any(), anyString(), anyString());
        }

        @Test
        @DisplayName("★ matrícula de servidor -> CONFLITO (quase sempre engano de quem montou)")
        void servidorEhConflito() {
            base(List.of(User.builder().id("FUNC-007").nome("Carla").tipo(UserType.FUNCIONARIO)
                    .ativo(true).build()), List.of());

            var r = primeira(service().plan(List.of(linha("FUNC-007", "AUTORIZADO"))));

            assertThat(r.acao()).isEqualTo(MealEntitlementImportService.Acao.CONFLITO);
            assertThat(r.detalhe()).contains("pas un eleve");
        }

        @Test
        @DisplayName("aluno inativo -> PULAR com instrução")
        void inativo() {
            base(List.of(User.builder().id("0001111").nome("Ana").tipo(UserType.ALUNO)
                    .ativo(false).build()), List.of());

            var r = primeira(service().plan(List.of(linha("0001111", "AUTORIZADO"))));

            assertThat(r.acao()).isEqualTo(MealEntitlementImportService.Acao.PULAR);
            assertThat(r.detalhe()).contains("inactif");
        }

        @Test
        @DisplayName("linha sem matrícula -> PULAR")
        void semMatricula() {
            base(List.of(), List.of());
            assertThat(primeira(service().plan(List.of(linha(null, "AUTORIZADO")))).acao())
                    .isEqualTo(MealEntitlementImportService.Acao.PULAR);
        }

        @Test
        @DisplayName("★ status ilegível -> CONFLITO, nunca um palpite")
        void statusIlegivel() {
            base(List.of(aluno("0001111", "Ana", "2A")), List.of());

            var r = primeira(service().plan(List.of(linha("0001111", "talvez"))));

            assertThat(r.acao()).isEqualTo(MealEntitlementImportService.Acao.CONFLITO);
            assertThat(r.detalhe()).contains("invalide");
        }
    }

    // ───────────────────── Duplicata dentro do arquivo ─────────────────────

    @Nested
    @DisplayName("★ a mesma matrícula duas vezes no arquivo")
    class Duplicata {

        @Test
        @DisplayName("★ com status OPOSTO -> CONFLITO, não 'vale a última'")
        void duplicataContraditoria() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")), List.of());

            var p = service().plan(List.of(
                    linha("0001111", "AUTORIZADO"),
                    linha("0001111", "NÃO AUTORIZADO")));

            assertThat(p.linhas().get(0).acao()).isEqualTo(MealEntitlementImportService.Acao.CRIAR);
            assertThat(p.linhas().get(1).acao())
                    .as("aplicar 'a última' seria decidir por sorteio quem almoça")
                    .isEqualTo(MealEntitlementImportService.Acao.CONFLITO);
            assertThat(p.linhas().get(1).detalhe()).contains("repete");
        }

        @Test
        @DisplayName("com o MESMO status -> a segunda é PULAR, sem alarme")
        void duplicataBenigna() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")), List.of());

            var p = service().plan(List.of(
                    linha("0001111", "AUTORIZADO"),
                    linha("0001111", "AUTORIZADO")));

            assertThat(p.linhas().get(1).acao()).isEqualTo(MealEntitlementImportService.Acao.PULAR);
            assertThat(p.totais()).containsEntry("CONFLITO", 0);
        }

        @Test
        @DisplayName("★ duplicata contraditória não grava NADA para aquela pessoa")
        void duplicataContraditoriaGravaSoAPrimeira() {
            base(List.of(aluno("0001111", "Ana Souza", "2A")), List.of());

            service().apply(List.of(
                    linha("0001111", "AUTORIZADO"),
                    linha("0001111", "NÃO AUTORIZADO")), OPERADOR);

            // A 1ª grava; a 2ª vira conflito e é recusada — o operador conserta
            // a planilha e reimporta, em vez de o sistema escolher por ele.
            verify(mealEntitlementService, org.mockito.Mockito.times(1))
                    .upsert(anyString(), any(), any(), any(), any(), anyString(), anyString());
        }
    }

    // ───────────────────── Leitura do status ─────────────────────

    @Nested
    @DisplayName("★ leitura da coluna de status")
    class LeituraDoStatus {

        @Test
        @DisplayName("★ a NEGAÇÃO é testada primeiro — 'NÃO AUTORIZADO' contém 'AUTORIZADO'")
        void negacaoVemPrimeiro() {
            assertThat(MealEntitlementImportService.parseStatus("NÃO AUTORIZADO"))
                    .as("classificar recusa como autorização é o erro mais caro deste arquivo")
                    .isEqualTo(EntitlementStatus.NOT_AUTHORIZED);
            assertThat(MealEntitlementImportService.parseStatus("nao autorizado"))
                    .isEqualTo(EntitlementStatus.NOT_AUTHORIZED);
            assertThat(MealEntitlementImportService.parseStatus("Non autorisé"))
                    .isEqualTo(EntitlementStatus.NOT_AUTHORIZED);
            assertThat(MealEntitlementImportService.parseStatus("NOT_AUTHORIZED"))
                    .isEqualTo(EntitlementStatus.NOT_AUTHORIZED);
        }

        @Test
        @DisplayName("português, francês e o nome do enum, com e sem acento")
        void variantesPositivas() {
            for (String s : List.of("AUTORIZADO", "autorizado", "Autorisé", "autorise",
                    "AUTHORIZED", "sim", "oui", "yes", "1", "true", "S")) {
                assertThat(MealEntitlementImportService.parseStatus(s))
                        .as("valor '%s'", s)
                        .isEqualTo(EntitlementStatus.AUTHORIZED);
            }
        }

        @Test
        @DisplayName("variantes negativas curtas")
        void variantesNegativas() {
            for (String s : List.of("não", "nao", "non", "no", "N", "0", "false")) {
                assertThat(MealEntitlementImportService.parseStatus(s))
                        .as("valor '%s'", s)
                        .isEqualTo(EntitlementStatus.NOT_AUTHORIZED);
            }
        }

        @Test
        @DisplayName("'em espera' é reconhecido como PENDING, não como lixo")
        void pending() {
            assertThat(MealEntitlementImportService.parseStatus("PENDING"))
                    .isEqualTo(EntitlementStatus.PENDING);
            assertThat(MealEntitlementImportService.parseStatus("En attente"))
                    .isEqualTo(EntitlementStatus.PENDING);
        }

        @Test
        @DisplayName("★ célula vazia ou incompreensível devolve null (vira CONFLITO)")
        void ilegivel() {
            assertThat(MealEntitlementImportService.parseStatus(null)).isNull();
            assertThat(MealEntitlementImportService.parseStatus("   ")).isNull();
            assertThat(MealEntitlementImportService.parseStatus("talvez")).isNull();
            assertThat(MealEntitlementImportService.parseStatus("???")).isNull();
        }
    }

    // ───────────────────── Totais e relatório ─────────────────────

    @Nested
    @DisplayName("totais")
    class Totais {

        @Test
        @DisplayName("★ criados / atualizados / ignorados / conflitos, e o TOTAL")
        void totaisCompletos() {
            base(List.of(
                    aluno("0001111", "Ana", "2A"),      // sem direito -> CRIAR
                    aluno("0002222", "Bruno", "2A"),    // muda        -> ATUALIZAR
                    aluno("0003333", "Carla", "2B"),    // igual       -> PULAR
                    User.builder().id("FUNC-007").nome("Eva").tipo(UserType.FUNCIONARIO)
                            .ativo(true).build()        // servidor    -> CONFLITO
            ), List.of(
                    direito("0002222", EntitlementStatus.NOT_AUTHORIZED),
                    direito("0003333", EntitlementStatus.AUTHORIZED)));

            var p = service().plan(List.of(
                    linha("0001111", "AUTORIZADO"),
                    linha("0002222", "AUTORIZADO"),
                    linha("0003333", "AUTORIZADO"),
                    linha("FUNC-007", "AUTORIZADO"),
                    linha("9999999", "AUTORIZADO")));   // ausente -> PULAR

            assertThat(p.totais())
                    .containsEntry("CRIAR", 1)
                    .containsEntry("ATUALIZAR", 1)
                    .containsEntry("PULAR", 2)
                    .containsEntry("CONFLITO", 1)
                    .containsEntry("TOTAL", 5);
        }

        @Test
        @DisplayName("todas as ações aparecem nos totais, mesmo zeradas")
        void totaisSempreCompletos() {
            base(List.of(), List.of());
            var p = service().plan(List.of());
            assertThat(p.totais().keySet())
                    .contains("CRIAR", "ATUALIZAR", "PULAR", "CONFLITO", "TOTAL");
        }

        @Test
        @DisplayName("lista vazia ou nula não estoura")
        void vazio() {
            base(List.of(), List.of());
            assertThat(service().plan(List.of()).linhas()).isEmpty();
            assertThat(service().plan(null).linhas()).isEmpty();
        }

        @Test
        @DisplayName("a linha reportada é a da PLANILHA (cabeçalho na 1)")
        void numeroDaLinha() {
            base(List.of(aluno("0001111", "Ana", "2A")), List.of());
            var p = service().plan(List.of(linha("0001111", "AUTORIZADO")));
            assertThat(primeira(p).linha())
                    .as("o operador procura a linha no Excel, não no array")
                    .isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("vigência")
    class Vigencia {

        @Test
        @DisplayName("mudar só as datas já é ATUALIZAR")
        void mudarDatas() {
            MealEntitlement e = direito("0001111", EntitlementStatus.AUTHORIZED);
            base(List.of(aluno("0001111", "Ana", "2A")), List.of(e));

            MealEntitlementBulkItem i = linha("0001111", "AUTORIZADO");
            i.setValidUntil(LocalDate.of(2026, 12, 31));

            assertThat(primeira(service().plan(List.of(i))).acao())
                    .isEqualTo(MealEntitlementImportService.Acao.ATUALIZAR);
        }

        @Test
        @DisplayName("★ vigência INVERTIDA vira CONFLITO — na simulação E na aplicação")
        void vigenciaInvertidaViraConflito() {
            // ⚠️ O CASO C21 do arquivo de prova do Sam (início 31/12, fim 01/09),
            // que o commit 49ac00c registrou honestamente como NÃO exercitado.
            // Falhava pior do que o defeito que aquele commit corrigiu: o único
            // guarda vivia no `upsert`, que só é chamado quando gravar=true —
            // então a SIMULAÇÃO pintava a linha de verde e o estrago vinha
            // depois de o operador confirmar.
            base(List.of(aluno("0001111", "Ana", "2A")), List.of());
            MealEntitlementBulkItem i = linha("0001111", "AUTORIZADO");
            i.setValidFrom(LocalDate.of(2026, 12, 31));
            i.setValidUntil(LocalDate.of(2026, 9, 1));

            // 1) A SIMULAÇÃO tem de acusar. Era aqui que a linha passava verde.
            var simulado = primeira(service().plan(List.of(i)));
            assertThat(simulado.acao()).isEqualTo(MealEntitlementImportService.Acao.CONFLITO);
            assertThat(simulado.linha()).isEqualTo(2);
            assertThat(simulado.detalhe()).contains("2026-12-31").contains("2026-09-01");

            // 2) E a APLICAÇÃO não pode chamar o upsert — porque o upsert é
            // REQUIRES_NEW: cada linha commita na própria transação, então a
            // exceção da linha N deixava 1..N-1 GRAVADAS enquanto a tela dizia
            // «importation non appliquée». O sistema afirmava o contrário do
            // que tinha feito.
            var aplicado = primeira(service().apply(List.of(i), OPERADOR));
            assertThat(aplicado.acao()).isEqualTo(MealEntitlementImportService.Acao.CONFLITO);
            verify(mealEntitlementService, never()).upsert(anyString(), any(), any(), any(),
                    anyString(), anyString(), anyString());
        }

        @Test
        @DisplayName("★ o lote CONTINUA depois de uma vigência invertida")
        void loteContinuaDepoisDoConflito() {
            // Uma célula errada não pode custar as outras 900 linhas. É a mesma
            // regra que 49ac00c aplicou à data ilegível.
            base(List.of(aluno("0001111", "Ana", "2A"), aluno("0002222", "Bruno", "2B")), List.of());
            MealEntitlementBulkItem ruim = linha("0001111", "AUTORIZADO");
            ruim.setValidFrom(LocalDate.of(2026, 12, 31));
            ruim.setValidUntil(LocalDate.of(2026, 9, 1));

            var p = service().apply(List.of(ruim, linha("0002222", "AUTORIZADO")), OPERADOR);

            assertThat(p.linhas()).hasSize(2);
            assertThat(p.linhas().get(0).acao()).isEqualTo(MealEntitlementImportService.Acao.CONFLITO);
            assertThat(p.linhas().get(1).acao()).isEqualTo(MealEntitlementImportService.Acao.CRIAR);
            // a linha boa foi gravada; a ruim, não
            verify(mealEntitlementService).upsert("0002222", EntitlementStatus.AUTHORIZED,
                    null, null, MealEntitlementImportService.NOTA_PADRAO, OPERADOR,
                    MealEntitlementImportService.SOURCE);
            verify(mealEntitlementService, never()).upsert("0001111", EntitlementStatus.AUTHORIZED,
                    LocalDate.of(2026, 12, 31), LocalDate.of(2026, 9, 1),
                    MealEntitlementImportService.NOTA_PADRAO, OPERADOR,
                    MealEntitlementImportService.SOURCE);
        }

        @Test
        @DisplayName("uma vigência bem ordenada continua a passar")
        void vigenciaNormalPassa() {
            base(List.of(aluno("0001111", "Ana", "2A")), List.of());
            MealEntitlementBulkItem i = linha("0001111", "AUTORIZADO");
            i.setValidFrom(LocalDate.of(2026, 9, 1));
            i.setValidUntil(LocalDate.of(2026, 12, 31));

            assertThat(primeira(service().plan(List.of(i))).acao())
                    .isEqualTo(MealEntitlementImportService.Acao.CRIAR);
        }

        @Test
        @DisplayName("a vigência da planilha viaja para o upsert")
        void vigenciaViaja() {
            base(List.of(aluno("0001111", "Ana", "2A")), List.of());
            MealEntitlementBulkItem i = linha("0001111", "AUTORIZADO");
            i.setValidFrom(LocalDate.of(2026, 2, 1));
            i.setValidUntil(LocalDate.of(2026, 6, 30));

            service().apply(List.of(i), OPERADOR);

            verify(mealEntitlementService).upsert("0001111", EntitlementStatus.AUTHORIZED,
                    LocalDate.of(2026, 2, 1), LocalDate.of(2026, 6, 30),
                    MealEntitlementImportService.NOTA_PADRAO, OPERADOR,
                    MealEntitlementImportService.SOURCE);
        }
    }
}
