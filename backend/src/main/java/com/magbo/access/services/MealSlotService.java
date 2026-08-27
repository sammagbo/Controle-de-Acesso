package com.magbo.access.services;

import com.magbo.access.models.MealSlot;
import com.magbo.access.models.MealSlotClass;
import com.magbo.access.models.MealSlotStudent;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.MealSlotClassRepository;
import com.magbo.access.repositories.MealSlotRepository;
import com.magbo.access.repositories.MealSlotStudentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * EM QUE CRENEAU ESTA PESSOA COME, E ESTA PASSAGEM CAI DENTRO DELE?
 *
 * ⚠️ FONTE UNICA DA JANELA DE ACESSO AO REFEITORIO (ADR-005, V021). Desde esta
 * entrega, `validateEntryWindow` NAO le mais `class_schedules`. Aquela tabela
 * sobrevive para outra pergunta — a do `RegimeSortieService` («a que horas
 * acaba a manha desta turma») — que decide janela de SAIDA, nao de refeicao.
 * Duas perguntas diferentes, duas tabelas, e nunca duas verdades para a mesma.
 *
 * ── A ORDEM DE RESOLUCAO E OBRIGATORIA ──────────────────────────────
 *   1. EXCECAO do aluno para este dia  -> vale ela, e SO ela
 *   2. senao, o(s) CRENEAU(X) da turma -> vale qualquer um deles
 *   3. senao                           -> NAO CONFIGURADO
 *
 * ⚠️ A excecao SUBSTITUI a turma, nao se soma a ela. E o ponto dela: o aluno de
 * Terminale que foi movido para o segundo passagem deixou de pertencer ao
 * primeiro. Somar os dois deixaria a janela mais larga do que qualquer humano
 * escreveu, e a excecao passaria a nao restringir nada.
 *
 * ⚠️ E BASTA UM CRENEAU CASAR. A turma pode estar em dois no mesmo dia (facto
 * real: terca-feira, 1E2 e 1E3 nos dois passagens). Exigir que casassem todos
 * negaria as duas metades do grupo ao mesmo tempo.
 *
 * ── ⚠️ NAO CONFIGURADO NUNCA E RECUSA ────────────────────────────────
 * A maternal e o elementar nao figuram na afixacao e nao podem ser punidos por
 * isso. `NAO_CONFIGURADO` e uma pergunta dirigida ao ADULTO que mantem o
 * planning, nao um reproche a uma crianca — a politica associada e OBSERVATION
 * e o rotulo diz «creneau nao configurado», nunca «fora do horario». Um sistema
 * que confunde «nao sei» com «nao pode» transforma a propria ignorancia em
 * sancao.
 *
 * ── ⚠️ O RELOGIO E O DA PASSAGEM, NAO O DO PROCESSAMENTO ─────────────
 * Terceiro defeito de relogio deste projeto, e por isso ele esta escrito aqui
 * antes de existir: uma fila offline esvaziada as 18h continha passagens do
 * meio-dia, e julgar a janela por `now` marcaria TODAS como fora do horario.
 * O incidente de 03/08/2026 fez exatamente isso com as duracoes. A hora que
 * entra aqui e `eventTime`, sempre.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MealSlotService {

    private final MealSlotRepository slotRepository;
    private final MealSlotClassRepository classRepository;
    private final MealSlotStudentRepository studentRepository;
    private final SettingsService settingsService;

    /**
     * A chave-CSV das turmas DISPENSADAS de badge na cantina.
     *
     * ⚠️ DESATIVADO POR DEFAULT para todas (default = string vazia): ativar e
     * uma DECISAO do Sam com a Vie Scolaire, nao desta entrega. A consequencia
     * PPMS esta escrita NO ECRA, ao lado do reglage — ver MealSlotManagement.
     */
    public static final String CHAVE_DISPENSEES = "magbo.cantine.turmas-dispensees";

    /**
     * Esta pessoa esta numa turma DISPENSADA de badge na cantina?
     *
     * ⚠️ Quem e dispensado nao aparece nem nos flags nem nas recusas da
     * cantina — mas a PASSAGEM continua gravada (e o PPMS continua a ve-la
     * enquanto a crianca badgear fisicamente). So ALUNO: a dispensa e um
     * instituto de turma.
     */
    public boolean dispensee(User user) {
        if (user == null || user.getTipo() != UserType.ALUNO) return false;
        String turma = user.getTurma();
        if (turma == null || turma.isBlank()) return false;
        return settingsService.efetivoCsv(CHAVE_DISPENSEES).contains(turma.trim().toUpperCase());
    }

    /** O que o MAGBO sabe sobre a hora de refeicao desta pessoa. */
    public enum Veredicto {
        /** A passagem cai dentro de um creneau resolvido. */
        DENTRO,
        /** Ha creneau configurado, e a passagem esta fora dele. */
        FORA,
        /** Ninguem disse a que horas esta pessoa come. NAO e recusa. */
        NAO_CONFIGURADO,
        /**
         * A regra nao se aplica a esta pessoa: nao e aluno, ou nao tem turma.
         *
         * ⚠️ Distinto de {@link #NAO_CONFIGURADO}, e a distincao e o que impede
         * o rasto de afogar quem o le. NAO_CONFIGURADO e uma pergunta que
         * alguem tem de responder («falta pôr esta turma na afixacao»);
         * NAO_APLICAVEL e uma pergunta que nao existe («o professor nao esta na
         * grade das turmas»). Fundir os dois encheria o registo de 400 linhas
         * por dia sobre servidores, e a unica turma realmente esquecida ficaria
         * invisivel no meio.
         */
        NAO_APLICAVEL
    }

    /**
     * O veredicto e o porque — o `creneau` e null quando NAO_CONFIGURADO.
     *
     * ⚠️ `antes` so tem sentido no veredicto FORA: true = a passagem foi ANTES
     * da janela do creneau mais proximo; false = DEPOIS. Null nos outros
     * veredictos — um Boolean de tres estados aqui e honesto, nao preguica:
     * «dentro» nao e nem antes nem depois.
     */
    public record Resultado(Veredicto veredicto, MealSlot creneau, List<MealSlot> candidatos,
                            boolean porExcecao, Boolean antes) {

        /** Compatibilidade com os testes e chamadores anteriores a 27/08. */
        public Resultado(Veredicto veredicto, MealSlot creneau, List<MealSlot> candidatos,
                         boolean porExcecao) {
            this(veredicto, creneau, candidatos, porExcecao, null);
        }

        public boolean dentro() { return veredicto == Veredicto.DENTRO; }
        public boolean naoConfigurado() { return veredicto == Veredicto.NAO_CONFIGURADO; }
        /** Nem julga, nem pergunta: a regra nao e para esta pessoa. */
        public boolean naoAplicavel() { return veredicto == Veredicto.NAO_APLICAVEL; }

        /**
         * O flag DIRECIONAL de `access_logs` — ou null quando nao ha flag.
         *
         * ⚠️ DOIS flags distintos, e distintos de trop-court/trop-long, porque
         * sao QUATRO problemas diferentes: chegar antes do seu creneau, chegar
         * depois dele, atravessar o refeitorio sem comer, e ficar tempo demais.
         * Um unico «FORA_HORARIO» obrigava quem le a ir descobrir qual dos
         * dois primeiros aconteceu. OBSERVATION sempre: o flag descreve, o
         * terminal ja abriu a porta.
         */
        public String flagDirecional() {
            if (veredicto != Veredicto.FORA) return null;
            return Boolean.TRUE.equals(antes) ? "AVANT_CRENEAU" : "APRES_CRENEAU";
        }
    }

    /**
     * Resolve a janela desta pessoa nesta passagem.
     *
     * @param user      a pessoa (a turma dela e o que liga aos creneaux)
     * @param eventTime ⚠️ a hora do EVENTO, nunca `LocalDateTime.now()`
     */
    @Transactional(readOnly = true)
    public Resultado resolver(User user, LocalDateTime eventTime) {
        if (user == null || eventTime == null) {
            return new Resultado(Veredicto.NAO_APLICAVEL, null, List.of(), false);
        }

        // ⚠️ Turma DISPENSADA de badge: nem flag, nem pergunta, nem recusa.
        // A dispensa e verificada ANTES de tudo o resto — inclusive antes da
        // excecao individual, porque dispensar a turma e a decisao mais
        // recente e mais forte.
        if (dispensee(user)) {
            return new Resultado(Veredicto.NAO_APLICAVEL, null, List.of(), false);
        }

        // ⚠️ SO ALUNO. O planning e uma grade de TURMAS: um professor ou um
        // funcionario nunca esteve nela, e nunca vai estar. Sem esta linha,
        // cada refeicao de cada um dos ~200 servidores virava uma linha
        // «creneau nao configurado» — 400 por dia a dizer que falta configurar
        // uma coisa que nao existe. E a licao do `INCONNU` do regime, que
        // deixou de deixar rasto justamente porque 923 linhas/dia afogavam as
        // duas familias que importavam.
        //
        // Apanhado a correr a suite: quatro ITs de caminho feliz passaram a
        // falhar com «acesso limpo nao gera tentativa», e tinham razao.
        if (user.getTipo() != UserType.ALUNO) {
            return new Resultado(Veredicto.NAO_APLICAVEL, null, List.of(), false);
        }
        short dia = (short) eventTime.getDayOfWeek().getValue();
        LocalTime hora = eventTime.toLocalTime();

        // 1. A excecao do aluno vence a turma. Ver o javadoc.
        List<MealSlotStudent> excecoes = studentRepository.doDia(user.getId(), dia);
        if (!excecoes.isEmpty()) {
            List<MealSlot> slots = porIds(excecoes.stream().map(MealSlotStudent::getSlotId).toList());
            return julgar(slots, hora, true);
        }

        // 2. O(s) creneau(x) da turma.
        String turma = user.getTurma();
        if (turma == null || turma.isBlank()) {
            // Aluno SEM turma e um cadastro incompleto, nao um planning por
            // preencher. Dizer «creneau nao configurado» mandaria a Vie
            // Scolaire procurar no sitio errado.
            return new Resultado(Veredicto.NAO_APLICAVEL, null, List.of(), false);
        }
        List<MealSlotClass> daTurma = classRepository.doDia(turma, dia);
        if (daTurma.isEmpty()) {
            return new Resultado(Veredicto.NAO_CONFIGURADO, null, List.of(), false);
        }
        List<MealSlot> slots = porIds(daTurma.stream().map(MealSlotClass::getSlotId).toList());
        return julgar(slots, hora, false);
    }

    /**
     * ⚠️ BASTA UM. E se nenhum casar, o creneau devolvido e o MAIS PROXIMO da
     * hora da passagem — porque a tela e o registo precisam de dizer «esperado
     * as 12h30» e nao apenas «fora do horario». Um alerta que nao diz de que
     * horario se desviou obriga quem o le a ir procurar a afixacao.
     */
    private Resultado julgar(List<MealSlot> slots, LocalTime hora, boolean porExcecao) {
        if (slots.isEmpty()) {
            return new Resultado(Veredicto.NAO_CONFIGURADO, null, List.of(), porExcecao);
        }
        Optional<MealSlot> casou = slots.stream().filter(s -> s.contem(hora)).findFirst();
        if (casou.isPresent()) {
            return new Resultado(Veredicto.DENTRO, casou.get(), slots, porExcecao);
        }
        // ⚠️ DESEMPATE EXPLICITO. Com dois creneaux a igual distancia (11h00 e
        // 13h00, passagem as 12h00), um `min()` simples deixava a ordem da
        // lista decidir — e a MESMA passagem podia sair «avant» ou «apres»
        // conforme a ordem que o repositorio devolvesse. Em caso de empate
        // vence o creneau SEGUINTE (logo: «chegou antes»), porque o servico
        // que ainda vai abrir e aquele a que a pessoa pode ainda ir.
        MealSlot maisProximo = slots.stream()
                .min(Comparator
                        .comparingLong((MealSlot s) -> Math.abs(
                                java.time.Duration.between(s.getHora(), hora).toMinutes()))
                        .thenComparing(s -> s.getHora().isAfter(hora) ? 0 : 1)
                        .thenComparing(MealSlot::getHora))
                .orElse(slots.get(0));
        // ⚠️ A DIRECAO e relativa ao creneau MAIS PROXIMO — o mesmo que a tela
        // nomeia («esperado as 12h30»). Entre duas janelas (depois da primeira,
        // antes da segunda), a resposta e a do mais proximo: e o que um humano
        // responderia, e qualquer outra regra exigiria explicacao.
        int antesMin = maisProximo.getToleranciaAntesMinutos() == null ? 0
                : maisProximo.getToleranciaAntesMinutos();
        boolean antes = hora.isBefore(maisProximo.getHora().minusMinutes(antesMin));
        return new Resultado(Veredicto.FORA, maisProximo, slots, porExcecao, antes);
    }

    private List<MealSlot> porIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        List<MealSlot> out = new ArrayList<>(slotRepository.findAllById(ids));
        out.removeIf(s -> !Boolean.TRUE.equals(s.getAtivo()));
        return out;
    }

    // ── Leitura para a tela de administracao e para a afixacao ──────────

    @Transactional(readOnly = true)
    public List<MealSlot> todos() {
        return slotRepository.findAllByOrderByDiaSemanaAscOrdemAscHoraAsc();
    }

    @Transactional(readOnly = true)
    public Map<Long, List<MealSlotClass>> turmasPorSlot() {
        return classRepository.findAll().stream()
                .collect(Collectors.groupingBy(MealSlotClass::getSlotId));
    }

    @Transactional(readOnly = true)
    public List<MealSlotStudent> excecoesDe(String userId) {
        return userId == null || userId.isBlank() ? List.of() : studentRepository.findByUserId(userId);
    }

    // ── Escrita ─────────────────────────────────────────────────────────

    /**
     * Liga uma turma a um creneau. Idempotente: ligar o que ja esta ligado nao
     * e erro — dois operadores podem carregar no mesmo botao.
     */
    @Transactional
    public void ligarTurma(Long slotId, String turma, String quem) {
        String t = exigir(turma, "turma").toUpperCase();
        exigirSlot(slotId);
        boolean existe = classRepository.doDia(t, slotRepository.findById(slotId)
                .map(MealSlot::getDiaSemana).orElse((short) 0))
                .stream().anyMatch(c -> c.getSlotId().equals(slotId));
        if (existe) return;
        classRepository.save(MealSlotClass.builder().slotId(slotId).turma(t).build());
        log.info("Cantine: turma {} ligada ao creneau {} por {}", t, slotId, quem);
    }

    @Transactional
    public void desligarTurma(Long slotId, String turma, String quem) {
        String t = exigir(turma, "turma").toUpperCase();
        exigirSlot(slotId);
        classRepository.deleteBySlotIdAndTurma(slotId, t);
        log.info("Cantine: turma {} desligada do creneau {} por {}", t, slotId, quem);
    }

    /**
     * A EXCECAO de um aluno.
     *
     * ⚠️ Substitui, nao acumula — ver o javadoc da classe. Todas as excecoes do
     * aluno NAQUELE DIA sao removidas antes de a nova entrar, senao a segunda
     * excecao alargaria a janela em vez de a mudar.
     */
    @Transactional
    public void excecaoAluno(String userId, Long slotId, String motivo, String quem) {
        String u = exigir(userId, "userId");
        MealSlot slot = exigirSlot(slotId);
        studentRepository.doDia(u, slot.getDiaSemana())
                .forEach(e -> studentRepository.deleteByUserIdAndSlotId(e.getUserId(), e.getSlotId()));
        studentRepository.save(MealSlotStudent.builder()
                .userId(u).slotId(slotId).motivo(vazioViraNulo(motivo))
                .createdBy(exigir(quem, "quem")).build());
        log.info("Cantine: excecao de creneau — aluno {} -> creneau {} por {}", u, slotId, quem);
    }

    @Transactional
    public void removerExcecao(String userId, Long slotId, String quem) {
        studentRepository.deleteByUserIdAndSlotId(exigir(userId, "userId"), slotId);
        log.info("Cantine: excecao removida — aluno {} creneau {} por {}", userId, slotId, quem);
    }

    /** Tolerancias e rotulo de um creneau. A hora e o dia nao mudam: sao a chave. */
    @Transactional
    public MealSlot atualizarCreneau(Long slotId, Short antes, Short depois,
                                     String rotulo, Boolean ativo, String quem) {
        MealSlot s = exigirSlot(slotId);
        if (antes != null && antes >= 0) s.setToleranciaAntesMinutos(antes);
        if (depois != null && depois >= 0) s.setToleranciaDepoisMinutos(depois);
        if (rotulo != null) s.setRotulo(vazioViraNulo(rotulo));
        if (ativo != null) s.setAtivo(ativo);
        s.setUpdatedAt(LocalDateTime.now());
        s.setUpdatedBy(quem);
        return slotRepository.save(s);
    }

    /**
     * Cria um creneau novo — o gesto que faltava para a maternal/elementar.
     *
     * ⚠️ Os dados de 26/08 (servico real 11h54-12h37) contradizem os horarios
     * herdados de class_schedules: NADA e semeado por codigo; e o Sam, com a
     * Vie Scolaire, que cria os creneaux certos por AQUI, em poucos cliques.
     * Idempotente pela UNIQUE (dia, hora): criar o que ja existe devolve o
     * existente em vez de estourar.
     */
    @Transactional
    public MealSlot criarCreneau(int diaSemana, LocalTime hora, String rotulo,
                                 Integer ordem, String quem) {
        if (diaSemana < 1 || diaSemana > 7) {
            throw new IllegalArgumentException("dia invalido: " + diaSemana + " (1=segunda..7=domingo)");
        }
        if (hora == null) throw new IllegalArgumentException("hora obrigatoria");
        Optional<MealSlot> existente = slotRepository
                .findAllByOrderByDiaSemanaAscOrdemAscHoraAsc().stream()
                .filter(s -> s.getDiaSemana() == diaSemana && s.getHora().equals(hora))
                .findFirst();
        if (existente.isPresent()) {
            // Reativa em vez de duplicar: a UNIQUE impede a segunda linha, e um
            // erro aqui faria o operador acreditar que o creneau nao existe.
            MealSlot s = existente.get();
            if (!Boolean.TRUE.equals(s.getAtivo())) { s.setAtivo(true); slotRepository.save(s); }
            return s;
        }
        MealSlot novo = MealSlot.builder()
                .diaSemana((short) diaSemana).hora(hora)
                .rotulo(vazioViraNulo(rotulo))
                .ordem(ordem == null ? (short) 3 : ordem.shortValue())
                .ativo(true).updatedBy(quem).build();
        MealSlot salvo = slotRepository.save(novo);
        log.info("Cantine: creneau criado — dia {} {} por {}", diaSemana, hora, quem);
        return salvo;
    }

    /** As turmas dispensadas, ordenadas — para o ecra. */
    public java.util.List<String> dispensees() {
        return settingsService.efetivoCsv(CHAVE_DISPENSEES).stream().sorted().toList();
    }

    /**
     * Grava a lista INTEIRA de dispensadas (o toggle do ecra manda o conjunto
     * novo). Normaliza para maiusculas; vazio = ninguem dispensado, que e o
     * default e apaga a linha do reglage.
     */
    @Transactional
    public void gravarDispensees(java.util.List<String> turmas, String quem) {
        String csv = turmas == null ? "" : turmas.stream()
                .map(t -> t == null ? "" : t.trim().toUpperCase())
                .filter(t -> !t.isEmpty())
                .distinct().sorted()
                .collect(java.util.stream.Collectors.joining(","));
        settingsService.gravar(CHAVE_DISPENSEES, csv, quem);
        log.info("Cantine: turmas dispensadas de badge = [{}] (por {})", csv, quem);
    }

    private MealSlot exigirSlot(Long slotId) {
        if (slotId == null) throw new IllegalArgumentException("slotId obrigatorio");
        return slotRepository.findById(slotId)
                .orElseThrow(() -> new IllegalArgumentException("creneau inexistente: " + slotId));
    }

    private static String exigir(String v, String campo) {
        if (v == null || v.isBlank()) throw new IllegalArgumentException(campo + " obrigatorio");
        return v.trim();
    }

    private static String vazioViraNulo(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.isEmpty()) return null;
        return t.length() > 255 ? t.substring(0, 255) : t;
    }
}
