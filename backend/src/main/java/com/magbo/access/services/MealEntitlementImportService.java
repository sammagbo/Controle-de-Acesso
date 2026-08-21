package com.magbo.access.services;

import com.magbo.access.dto.MealEntitlementBulkItem;
import com.magbo.access.models.EntitlementStatus;
import com.magbo.access.models.MealEntitlement;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.MealEntitlementRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Importacao em lote dos DIREITOS DE REFEICAO, em duas passadas.
 *
 * Mesmo desenho do {@link HikCentralImportService}, validado em producao:
 * {@link #plan} nao escreve nada e devolve o que aconteceria linha a linha;
 * {@link #apply} REFAZ o plano contra o estado atual do banco e executa. O
 * plano nao viaja da tela para o servidor de proposito — entre a conferencia e
 * a confirmacao alguem pode ter mexido num direito pela tela, e aplicar um
 * plano velho seria escrever com base em algo que ja nao e verdade.
 *
 * Por que isto existe: o import anterior gravava DIRETO, sem conferencia. Num
 * arquivo que decide quem almoca — e com `meal-pending=DENY` em producao, onde
 * a ausencia de linha ja e recusa — escrever sem mostrar antes o que vai mudar
 * e apostar a operacao do dia numa planilha que ninguem leu.
 *
 * REGRA DE OURO, herdada do HikCentral: ALUNO NAO E CRIADO AQUI. O cadastro de
 * aluno vem do Pronote. Uma matricula que nao existe no MAGBO e ignorada com o
 * motivo escrito na tela, nunca criada — criar produziria um "aluno" sem nome,
 * sem turma e sem responsavel, so para satisfazer uma linha de planilha.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MealEntitlementImportService {

    /** Origem gravada no historico — o CHECK da VM aceita UI|BULK|API. */
    static final String SOURCE = "BULK";

    /** Nota gravada quando a planilha nao traz uma. */
    static final String NOTA_PADRAO = "Import en masse";

    private final UserRepository userRepository;
    private final MealEntitlementRepository mealEntitlementRepository;
    private final MealEntitlementService mealEntitlementService;

    /** O que a linha vai provocar. Mesmos nomes do import do HikCentral. */
    public enum Acao {
        /** Aluno sem linha de direito: sera criada. */
        CRIAR,
        /** Ja tem linha e o status (ou a vigencia) muda. */
        ATUALIZAR,
        /** Nada a fazer, ou fora do escopo (aluno ausente, linha invalida). */
        PULAR,
        /** A linha se contradiz com outra do MESMO arquivo, ou o alvo nao e aluno. */
        CONFLITO
    }

    /** Decisao de UMA linha, com tudo que o operador precisa ler na tela. */
    public record RowPlan(
            int linha,
            String userId,
            String nome,
            String turma,
            /** Status hoje no banco (PENDING quando nao ha linha). */
            String statusAtual,
            /** Status que a planilha pede. */
            String statusNovo,
            Acao acao,
            String detalhe) {
    }

    /** Resultado completo de um preview ou de uma aplicacao. */
    public record ImportPlan(
            List<RowPlan> linhas,
            Map<String, Integer> totais,
            /** true quando ja foi gravado no banco. */
            boolean aplicado) {
    }

    // ───────────────── API ─────────────────

    /** Simulacao: NAO escreve nada. */
    public ImportPlan plan(List<MealEntitlementBulkItem> linhas) {
        return montarPlano(linhas, false, null);
    }

    /** Aplica de verdade, refazendo o plano contra o estado ATUAL. */
    @Transactional
    public ImportPlan apply(List<MealEntitlementBulkItem> linhas, String changedBy) {
        ImportPlan resultado = montarPlano(linhas, true, changedBy);
        log.info("Importacao de direitos de refeicao aplicada por {}: {}", changedBy, resultado.totais());
        return resultado;
    }

    // ───────────────── Motor ─────────────────

    private ImportPlan montarPlano(List<MealEntitlementBulkItem> linhas, boolean gravar, String changedBy) {
        List<RowPlan> planos = new ArrayList<>();
        if (linhas == null) linhas = List.of();

        // Carrega o cadastro UMA vez. Com ~900 linhas, consultar por linha seria
        // ~1800 idas ao banco; e o mapa e tambem o que permite ver a matricula
        // repetida DENTRO do proprio arquivo, que consulta nenhuma pegaria.
        Map<String, User> alunos = new HashMap<>();
        for (User u : userRepository.findAll()) {
            alunos.put(u.getId(), u);
        }
        Map<String, MealEntitlement> direitos = new HashMap<>();
        for (MealEntitlement e : mealEntitlementRepository.findAll()) {
            direitos.put(e.getUserId(), e);
        }

        // Matricula -> status ja decidido por uma linha anterior deste arquivo.
        Map<String, String> jaVistos = new LinkedHashMap<>();
        Set<String> duplicadasBenignas = new HashSet<>();

        for (int i = 0; i < linhas.size(); i++) {
            // ⚠️ A linha VEM DO FRONT quando ele a manda: so ele sabe de qual
            // linha do arquivo cada item saiu, porque e ele quem descarta as
            // vazias e as de data ilegivel. `i + 2` fica como volta para pedidos
            // sem o campo, e acerta apenas quando nada foi descartado.
            planos.add(planejarLinha(linhas.get(i),
                    linhas.get(i).getLinha() != null ? linhas.get(i).getLinha() : i + 2,
                    alunos, direitos,
                    jaVistos, duplicadasBenignas, gravar, changedBy));
        }

        Map<String, Integer> totais = new LinkedHashMap<>();
        for (Acao a : Acao.values()) {
            totais.put(a.name(), 0);
        }
        planos.forEach(p -> totais.merge(p.acao().name(), 1, Integer::sum));
        totais.put("TOTAL", planos.size());

        return new ImportPlan(planos, totais, gravar);
    }

    /**
     * @param linha numero da linha NA PLANILHA (cabecalho na 1, dados a partir da 2)
     */
    private RowPlan planejarLinha(MealEntitlementBulkItem item, int linha,
                                  Map<String, User> alunos,
                                  Map<String, MealEntitlement> direitos,
                                  Map<String, String> jaVistos,
                                  Set<String> duplicadasBenignas,
                                  boolean gravar, String changedBy) {

        String userId = trim(item == null ? null : item.getUserId());
        String statusBruto = trim(item == null ? null : item.getStatus());

        // ── Validacao basica ──
        if (userId == null) {
            return pular(linha, null, null, null, null, null, "Ligne sans matricule");
        }

        EntitlementStatus novo = parseStatus(statusBruto);
        if (novo == null) {
            return new RowPlan(linha, userId, null, null, null, statusBruto, Acao.CONFLITO,
                    "Statut invalide (" + statusBruto + ") \u2014 attendus : AUTORIS\u00c9, NON AUTORIS\u00c9");
        }

        // ── A mesma matricula ja apareceu neste arquivo ──
        String statusAnterior = jaVistos.get(userId);
        if (statusAnterior != null) {
            if (!statusAnterior.equals(novo.name())) {
                // O arquivo manda duas coisas opostas para a mesma pessoa. Aplicar
                // "a ultima" seria decidir por sorteio quem almoca.
                return new RowPlan(linha, userId, nomeDe(alunos, userId), turmaDe(alunos, userId),
                        statusAnterior, novo.name(), Acao.CONFLITO,
                        "Matricule r\u00e9p\u00e9t\u00e9 dans le fichier avec un statut diff\u00e9rent (ligne pr\u00e9c\u00e9dente : "
                                + rotulo(statusAnterior) + ")");
            }
            duplicadasBenignas.add(userId);
            return pular(linha, userId, nomeDe(alunos, userId), turmaDe(alunos, userId),
                    statusAnterior, novo.name(), "Matricule r\u00e9p\u00e9t\u00e9 dans le fichier, m\u00eame statut");
        }

        // ── O aluno tem de existir ──
        User aluno = alunos.get(userId);
        if (aluno == null) {
            return pular(linha, userId, null, null, null, novo.name(),
                    "\u00c9l\u00e8ve absent du MAGBO \u2014 la fiche vient de l'import Pronote");
        }
        if (aluno.getTipo() != UserType.ALUNO) {
            // Matricula de servidor numa planilha de direitos de refeicao e quase
            // sempre engano de quem montou o arquivo; gravar em silencio esconde.
            return new RowPlan(linha, userId, aluno.getNome(), aluno.getTurma(), null, novo.name(),
                    Acao.CONFLITO,
                    "Le matricule est un " + aluno.getTipo() + ", pas un \u00e9l\u00e8ve");
        }
        if (Boolean.FALSE.equals(aluno.getAtivo())) {
            return pular(linha, userId, aluno.getNome(), aluno.getTurma(), null, novo.name(),
                    "\u00c9l\u00e8ve inactif \u2014 r\u00e9activez la fiche avant d'accorder le droit");
        }

        // ⚠️⚠️ VIGENCIA INVERTIDA (caso C21 do arquivo de prova do Sam:
        // inicio 31/12/2026, fim 01/09/2026). O UNICO guarda contra isto vivia
        // no `upsert`, e o `upsert` so e chamado quando gravar=true — ou seja,
        // NA SIMULACAO A LINHA APARECIA VERDE e o estrago acontecia depois de
        // o operador confirmar.
        //
        // E o 500 era a metade menor. `upsert` e @Transactional(REQUIRES_NEW)
        // e e chamado pelo proxy: CADA LINHA COMMITA NA PROPRIA TRANSACAO.
        // Quando a linha N estourava, as linhas 1..N-1 JA ESTAVAM GRAVADAS —
        // e a tela dizia «importation non appliquée». O sistema afirmava
        // exatamente o contrario do que tinha acabado de fazer, sem dizer o
        // que escreveu. E a mesma familia de mentira que 49ac00c foi corrigir.
        //
        // Aqui a linha vira CONFLITO nas DUAS passadas, o lote termina, e o
        // numero da linha aponta a celula errada de verdade.
        // (O caminho /bulk ja checava isto — MealEntitlementService:239-241.
        // O caminho de duas passadas que o substituiu, nao.)
        if (item.getValidFrom() != null && item.getValidUntil() != null
                && item.getValidFrom().isAfter(item.getValidUntil())) {
            return new RowPlan(linha, userId, aluno.getNome(), aluno.getTurma(),
                    direitos.get(userId) == null ? EntitlementStatus.PENDING.name()
                            : direitos.get(userId).getStatus().name(),
                    novo.name(), Acao.CONFLITO,
                    "Validit\u00e9 invers\u00e9e : d\u00e9but (" + item.getValidFrom()
                            + ") post\u00e9rieur \u00e0 la fin (" + item.getValidUntil() + ")");
        }

        // ── Comparacao com o que ja esta gravado ──
        MealEntitlement atual = direitos.get(userId);
        String statusAtual = atual == null ? EntitlementStatus.PENDING.name() : atual.getStatus().name();

        if (atual != null) {
            boolean mudaStatus = atual.getStatus() != novo;
            boolean mudaDe = !Objects.equals(atual.getValidFrom(), item.getValidFrom());
            boolean mudaAte = !Objects.equals(atual.getValidUntil(), item.getValidUntil());
            if (!mudaStatus && !mudaDe && !mudaAte) {
                jaVistos.put(userId, novo.name());
                return pular(linha, userId, aluno.getNome(), aluno.getTurma(),
                        statusAtual, novo.name(), "D\u00e9j\u00e0 ainsi \u2014 rien \u00e0 modifier");
            }
        }

        jaVistos.put(userId, novo.name());
        Acao acao = (atual == null) ? Acao.CRIAR : Acao.ATUALIZAR;

        if (gravar) {
            // Passa pelo upsert do servico e nao pelo repositorio: e ele que grava
            // o evento de historico na MESMA transacao. Um direito que muda sem
            // deixar rastro de quem mudou nao pode existir (regra da Fase C).
            mealEntitlementService.upsert(userId, novo, item.getValidFrom(), item.getValidUntil(),
                    notaDe(item), changedBy, SOURCE);
        }

        return new RowPlan(linha, userId, aluno.getNome(), aluno.getTurma(),
                statusAtual, novo.name(), acao,
                acao == Acao.CRIAR
                        ? "Droit cr\u00e9\u00e9 : " + rotulo(novo.name())
                        : rotulo(statusAtual) + " -> " + rotulo(novo.name()));
    }

    // ───────────────── Interpretacao dos campos ─────────────────

    /**
     * Le o status da planilha em portugues, frances ou no nome do enum.
     *
     * Reconhece a NEGACAO primeiro: "NAO AUTORIZADO" contem "AUTORIZADO", e
     * testar o positivo antes classificaria toda recusa como autorizacao — o
     * erro mais caro possivel neste arquivo.
     *
     * @return null quando a celula nao diz nada reconhecivel (vira CONFLITO,
     *         nao um palpite)
     */
    static EntitlementStatus parseStatus(String bruto) {
        String s = normalizar(bruto);
        if (s == null) return null;

        // 1. Nome exato do enum, PRIMEIRO e sem heuristica. E o que um arquivo
        // exportado do proprio MAGBO traz, e o que o /bulk sempre aceitou.
        // Derivado dos valores para nao envelhecer se o enum crescer.
        for (EntitlementStatus st : EntitlementStatus.values()) {
            if (s.equals(st.name().toLowerCase(Locale.ROOT))) return st;
        }

        // 2. Formas humanas, digitadas a mao em PT ou FR.
        if (s.equals("en attente") || s.equals("pendente") || s.equals("em espera")) {
            return EntitlementStatus.PENDING;
        }
        // A NEGACAO vem antes: "nao autorizado" contem "autorizado", e testar o
        // positivo primeiro classificaria toda recusa como autorizacao.
        boolean negado = s.startsWith("nao") || s.startsWith("non") || s.startsWith("not")
                || s.equals("n") || s.equals("no") || s.equals("0") || s.equals("false");
        if (negado) return EntitlementStatus.NOT_AUTHORIZED;

        boolean autorizado = s.startsWith("autoriz") || s.startsWith("autoris")
                || s.equals("s") || s.equals("sim") || s.equals("oui") || s.equals("yes")
                || s.equals("y") || s.equals("o") || s.equals("1") || s.equals("true");
        if (autorizado) return EntitlementStatus.AUTHORIZED;

        return null;
    }

    /** Minuscula, sem acento, espacos colapsados — para comparar celulas digitadas a mao. */
    static String normalizar(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.isEmpty()) return null;
        return java.text.Normalizer.normalize(t, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ");
    }

    static String rotulo(String status) {
        // Estes rotulos sao lidos CRUOS pela tela (o front renderiza
        // {l.detalhe}), numa interface francesa. Estavam em portugues.
        // Sem acentos, como o resto deste arquivo .java.
        if (EntitlementStatus.AUTHORIZED.name().equals(status)) return "Autoris\u00e9";
        if (EntitlementStatus.NOT_AUTHORIZED.name().equals(status)) return "Non autoris\u00e9";
        if (EntitlementStatus.PENDING.name().equals(status)) return "En attente";
        return String.valueOf(status);
    }

    // ───────────────── Auxiliares ─────────────────

    private static String notaDe(MealEntitlementBulkItem item) {
        String n = trim(item.getNote());
        return n == null ? NOTA_PADRAO : n;
    }

    private static String nomeDe(Map<String, User> alunos, String id) {
        User u = alunos.get(id);
        return u == null ? null : u.getNome();
    }

    private static String turmaDe(Map<String, User> alunos, String id) {
        User u = alunos.get(id);
        return u == null ? null : u.getTurma();
    }

    private static RowPlan pular(int linha, String userId, String nome, String turma,
                                 String statusAtual, String statusNovo, String motivo) {
        return new RowPlan(linha, userId, nome, turma, statusAtual, statusNovo, Acao.PULAR, motivo);
    }

    private static String trim(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
