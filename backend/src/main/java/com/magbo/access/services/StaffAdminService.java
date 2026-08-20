package com.magbo.access.services;

import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Manutenção do cadastro de SERVIDORES e correção dos casos que a importação do
 * HikCentral não conseguia resolver sozinha.
 *
 * O problema concreto: parte dos ~200 servidores importados são na verdade
 * ALUNOS. A linha deles no HCP está fora do departamento ALUNOS e carrega um id
 * de 10 dígitos, então nenhuma matrícula casou e a importação criou um
 * FUNC-###. O aluno continua existindo, correto, vindo do Pronote — e ao lado
 * dele há um servidor fantasma com a face dele.
 *
 * REGRA QUE ATRAVESSA TUDO AQUI: ALUNO não se edita por esta porta. O cadastro
 * de aluno é do Pronote; a única coisa que se faz com um aluno aqui é ligar a
 * face dele (o identificador do HikCentral), que o Pronote não conhece.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class StaffAdminService {

    private static final Set<UserType> TIPOS_DE_SERVIDOR =
            Set.of(UserType.PROFESSOR, UserType.FUNCIONARIO);

    private final UserRepository userRepository;
    private final AccessLogRepository accessLogRepository;
    private final com.magbo.access.repositories.UserPhotoRepository userPhotoRepository;

    /** Falha com mensagem pronta para a tela. */
    public static class StaffAdminException extends RuntimeException {
        public StaffAdminException(String message) {
            super(message);
        }
    }

    /** Linha da lista de servidores, com o que a tela precisa decidir. */
    public record StaffRow(String id, String nome, String tipo, String departamento,
                           String hikvisionEmployeeId, boolean ativo,
                           long passagens, boolean podeRemover,
                           String postoFixoPointId) {
    }

    /**
     * Pontos válidos para posto fixo — os pontos FÍSICOS que o backend conhece.
     *
     * Vem do {@link com.magbo.access.config.AreaMapping}, que já é a fonte
     * única do mapeamento ponto→área: uma segunda lista aqui envelheceria na
     * primeira porta nova da escola. Ficam de fora as telas virtuais
     * (CANTINA_MONITOR, GENERAL_REPORT...) porque ninguém fica postado num
     * relatório.
     */
    private static Set<String> pontosValidos() {
        return com.magbo.access.config.AreaMapping.pointToArea().keySet();
    }

    /**
     * Todos os servidores (PROFESSOR + FUNCIONARIO), ativos e inativos.
     *
     * Traz a contagem de passagens porque é ela que decide se o registro pode
     * ser REMOVIDO ou apenas inativado — e quem está na tela precisa ver o
     * número antes de escolher, não descobrir depois numa mensagem de erro.
     */
    @Transactional(readOnly = true)
    public List<StaffRow> listStaff() {
        // ⚠️ ISTO ERA UM N+1 DE VERDADE, nao uma subconsulta correlacionada: o
        // .map() chamava countByUserId uma vez POR SERVIDOR — 1 + ~194
        // declaracoes por abertura da aba, cada uma varrendo access_logs
        // inteira (nao ha indice em user_id ate a V019), e cada uma na PROPRIA
        // transacao, porque este metodo nao tinha @Transactional.
        //
        // MEDIDO em 20/08/2026 contra os 439.993 registros reais:
        //     antes  194 contagens separadas ... 3.775 ms
        //     depois 1 consulta agrupada ....... 359 ms   (30 ms no servidor)
        //     com o indice da V019 ............. 16,6 ms  (12,9 ms)
        List<User> servidores = userRepository.findAll().stream()
                .filter(u -> TIPOS_DE_SERVIDOR.contains(u.getTipo()))
                .sorted((a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                        a.getNome() == null ? "" : a.getNome(),
                        b.getNome() == null ? "" : b.getNome()))
                .toList();

        // ⚠️ `IN ()` vazio nao e SQL valido, e a lista vazia e um caminho REAL
        // (uma base so com alunos — StaffAdminIT#alunoNaoApareceNaLista).
        java.util.Map<String, Long> passagensPorId = servidores.isEmpty()
                ? java.util.Map.of()
                : accessLogRepository
                        .countByUserIdIn(servidores.stream().map(User::getId).toList())
                        .stream()
                        .collect(java.util.stream.Collectors.toMap(
                                linha -> (String) linha[0],
                                linha -> ((Number) linha[1]).longValue()));

        return servidores.stream()
                .map(u -> {
                    // Ausente do mapa = nenhuma passagem. O GROUP BY nao devolve
                    // linha para quem nao tem nenhuma, e e o zero que faz
                    // `podeRemover` ser verdadeiro — tratar ausencia como
                    // desconhecido bloquearia a remocao de todo cadastro novo.
                    long passagens = passagensPorId.getOrDefault(u.getId(), 0L);
                    return new StaffRow(u.getId(), u.getNome(), u.getTipo().name(),
                            u.getDepartamento(), u.getHikvisionEmployeeId(),
                            Boolean.TRUE.equals(u.getAtivo()), passagens, passagens == 0,
                            u.getPostoFixoPointId());
                })
                .toList();
    }

    /**
     * Corrige departamento e/ou tipo de um servidor.
     *
     * Só entre PROFESSOR e FUNCIONARIO. Promover a ALUNO por aqui criaria um
     * aluno sem turma e sem responsável, fora do Pronote — que é exatamente o
     * registro duplicado que se está tentando desfazer. Quando o servidor é na
     * verdade um aluno, o caminho é {@link #reassignHikvisionId}.
     *
     * ⚠️ É TAMBÉM a única porta de escrita do posto fixo, e é por isso que
     * ALUNO nunca ganha um: {@link #carregarServidor} recusa qualquer id que
     * não seja PROFESSOR/FUNCIONARIO antes de a primeira linha ser tocada. A
     * garantia é estrutural, não uma checagem de tela que alguém pode
     * contornar por curl.
     *
     * @param postoFixoPointId {@code null} = não mexer (o campo não veio no
     *        corpo); {@code ""} = LIMPAR, que é como se desfaz a marcação
     *        quando a pessoa sai do posto. Mesma convenção do departamento.
     */
    @Transactional
    public User updateStaff(String id, String tipo, String departamento, String postoFixoPointId) {
        User servidor = carregarServidor(id);

        if (tipo != null && !tipo.isBlank()) {
            UserType novo;
            try {
                novo = UserType.valueOf(tipo.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new StaffAdminException("Tipo inválido: " + tipo);
            }
            if (!TIPOS_DE_SERVIDOR.contains(novo)) {
                throw new StaffAdminException(
                        "Tipo " + novo + " não é de servidor. Se esta pessoa é aluno, "
                                + "use o casamento pelo identificador Hikvision.");
            }
            servidor.setTipo(novo);
        }

        // departamento vazio limpa o campo de propósito: "sem departamento" é
        // um estado legítimo (os 83 "NAO_DEFINIDO" do export).
        if (departamento != null) {
            String d = departamento.trim();
            servidor.setDepartamento(d.isEmpty() ? null : d);
        }

        // Posto fixo: ponto conhecido, ou nada. Um id digitado errado
        // ("PORT-1", "portaria") não marcaria passagem nenhuma e a pessoa
        // continuaria enchendo a tela — sem nenhum sinal de que a configuração
        // não pegou. Recusar na hora, com o valor na mensagem, é a diferença
        // entre um erro de digitação e um defeito que ninguém encontra.
        if (postoFixoPointId != null) {
            String p = postoFixoPointId.trim().toUpperCase(Locale.ROOT);
            if (p.isEmpty()) {
                servidor.setPostoFixoPointId(null);
            } else if (!pontosValidos().contains(p)) {
                throw new StaffAdminException(
                        "Ponto de posto fixo desconhecido: " + postoFixoPointId
                                + ". Válidos: " + String.join(", ", new java.util.TreeSet<>(pontosValidos())));
            } else {
                servidor.setPostoFixoPointId(p);
            }
        }

        User salvo = userRepository.save(servidor);
        log.info("Servidor atualizado: id={}, tipo={}, departamento={}, postoFixo={}",
                salvo.getId(), salvo.getTipo(), salvo.getDepartamento(),
                salvo.getPostoFixoPointId());
        return salvo;
    }

    /** Inativa um servidor. Reversível e não perde histórico. */
    @Transactional
    public User deactivateStaff(String id) {
        User servidor = carregarServidor(id);
        servidor.setAtivo(false);
        log.info("Servidor inativado: id={}", id);
        return userRepository.save(servidor);
    }

    /** Reativa um servidor inativado por engano. */
    @Transactional
    public User reactivateStaff(String id) {
        User servidor = carregarServidor(id);
        servidor.setAtivo(true);
        return userRepository.save(servidor);
    }

    /**
     * Apaga um servidor criado por engano — e SÓ se ele nunca passou por lugar
     * nenhum.
     *
     * Com histórico, apagar deixaria access_logs apontando para um id que não
     * existe mais: as passagens não somem, viram órfãs, e o relatório passa a
     * mostrar um id cru onde havia um nome. Nesse caso a resposta é inativar,
     * e a mensagem diz isso em vez de só recusar.
     */
    @Transactional
    public void deleteStaff(String id) {
        User servidor = carregarServidor(id);
        long passagens = accessLogRepository.countByUserId(id);
        if (passagens > 0) {
            throw new StaffAdminException(
                    "Este registro tem " + passagens + " passagem(ns) registrada(s) e não pode ser "
                            + "removido — apagá-lo deixaria esse histórico órfão. Use \"inativar\".");
        }
        // A foto sai JUNTO, na mesma transação. Apagar a pessoa e deixar o
        // retrato para trás guardaria a imagem de alguém — possivelmente de um
        // menor — presa a um id que já não existe: ninguém a encontraria para
        // apagar depois, e ela sobreviveria a cada backup dali em diante.
        // existsById antes: deleteById de um id ausente é silencioso no Spring
        // Data 3.x mas lançava em versões anteriores, e este é um caminho que
        // ninguém quer ver falhar por causa de uma troca de versão.
        if (userPhotoRepository.existsById(id)) userPhotoRepository.deleteById(id);
        userRepository.delete(servidor);
        log.info("Servidor removido (sem histórico): id={}", id);
    }

    /** O que o casamento vai fazer, para a tela mostrar ANTES de confirmar. */
    public record ReassignPreview(String alunoId, String alunoNome, String alunoTurma,
                                  String alunoHikvisionAtual, String hikvisionId,
                                  String servidorId, String servidorNome, String servidorDepartamento,
                                  long servidorPassagens) {
    }

    /**
     * Simula o casamento: quem recebe a face e qual registro de servidor sai de
     * cena. Não escreve nada.
     */
    public ReassignPreview previewReassign(String alunoId, String hikvisionId) {
        User aluno = carregarAluno(alunoId);
        String hik = normalizar(hikvisionId);
        User dono = hik == null ? null
                : userRepository.findByHikvisionEmployeeId(hik).orElse(null);

        boolean donoEhOutro = dono != null && !dono.getId().equals(aluno.getId());
        return new ReassignPreview(
                aluno.getId(), aluno.getNome(), aluno.getTurma(), aluno.getHikvisionEmployeeId(),
                hik,
                donoEhOutro ? dono.getId() : null,
                donoEhOutro ? dono.getNome() : null,
                donoEhOutro ? dono.getDepartamento() : null,
                donoEhOutro ? accessLogRepository.countByUserId(dono.getId()) : 0L);
    }

    /**
     * Liga o identificador do HikCentral ao ALUNO certo — e, se ele estava
     * preso a um FUNC-### criado por engano, inativa esse registro NA MESMA
     * TRANSAÇÃO.
     *
     * A coluna é UNIQUE: não dá para o aluno receber a face sem que o servidor
     * a solte. Fazer isso em dois passos deixaria uma janela em que a face não
     * é de ninguém — e, se o segundo passo falhasse, um aluno sem face e um
     * servidor fantasma ainda de pé. Uma transação só, ou nada.
     *
     * O servidor é INATIVADO, nunca apagado: ele pode ter passagens, e essas
     * passagens aconteceram de verdade — foi o aluno que passou. Apagar
     * reescreveria a história; inativar tira da operação e preserva o registro.
     */
    @Transactional
    public User reassignHikvisionId(String alunoId, String hikvisionId) {
        User aluno = carregarAluno(alunoId);
        String hik = normalizar(hikvisionId);
        if (hik == null) {
            throw new StaffAdminException("Identificador Hikvision é obrigatório");
        }
        if (!hik.matches("^\\d{1,64}$")) {
            throw new StaffAdminException("Identificador Hikvision deve conter apenas dígitos: " + hik);
        }

        userRepository.findByHikvisionEmployeeId(hik).ifPresent(dono -> {
            if (dono.getId().equals(aluno.getId())) return; // já é dele: nada a fazer
            if (dono.getTipo() == UserType.ALUNO) {
                throw new StaffAdminException(
                        "O identificador " + hik + " já pertence ao aluno " + dono.getNome()
                                + " (" + dono.getId() + "). Confira antes de reatribuir.");
            }
            // Solta a face e tira o registro fantasma de circulação.
            dono.setHikvisionEmployeeId(null);
            dono.setAtivo(false);
            userRepository.saveAndFlush(dono);
            log.info("Casamento: servidor {} ({}) inativado e liberou o identificador {}",
                    dono.getId(), dono.getNome(), hik);
        });

        aluno.setHikvisionEmployeeId(hik);
        User salvo = userRepository.save(aluno);
        log.info("Casamento: identificador {} atribuído ao aluno {} ({})",
                hik, salvo.getId(), salvo.getNome());
        return salvo;
    }

    // ───────────────── Auxiliares ─────────────────

    private User carregarServidor(String id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new StaffAdminException("Registro não encontrado: " + id));
        if (!TIPOS_DE_SERVIDOR.contains(u.getTipo())) {
            throw new StaffAdminException(
                    "Registro " + id + " é do tipo " + u.getTipo()
                            + " e não pode ser editado por aqui — esta tela é de servidores.");
        }
        return u;
    }

    /**
     * Mensagem para quando o aluno não está cadastrado.
     *
     * Diz o que fazer, não só o que faltou: criar o aluno aqui produziria um
     * registro sem turma e sem responsável, fora do Pronote — que é exatamente
     * o duplicado que este fluxo existe para desfazer.
     */
    public static final String ALUNO_AUSENTE =
            "Este aluno não está no MAGBO; ele deve entrar primeiro pela importação do Pronote";

    private User carregarAluno(String id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new StaffAdminException(ALUNO_AUSENTE));
        if (u.getTipo() != UserType.ALUNO) {
            throw new StaffAdminException("Registro " + id + " não é um aluno (tipo " + u.getTipo() + ")");
        }
        return u;
    }

    // ───────────────── "Este servidor é na verdade um aluno" ─────────────────

    /** O que a reclassificação vai fazer, para a tela mostrar ANTES de confirmar. */
    public record ReclassPreview(String servidorId, String servidorNome, String servidorTipo,
                                 String servidorDepartamento, String servidorHikvisionId,
                                 long servidorPassagens,
                                 String alunoId, String alunoNome, String alunoTurma,
                                 String alunoHikvisionAtual,
                                 boolean substituiIdentificadorDoAluno) {
    }

    /** Simula a reclassificação. Não escreve nada. */
    public ReclassPreview previewReclassify(String servidorId, String alunoId) {
        User servidor = carregarServidor(servidorId);
        User aluno = carregarAluno(alunoId);
        String hik = servidor.getHikvisionEmployeeId();
        boolean substitui = hik != null
                && aluno.getHikvisionEmployeeId() != null
                && !aluno.getHikvisionEmployeeId().equals(hik);

        return new ReclassPreview(
                servidor.getId(), servidor.getNome(), servidor.getTipo().name(),
                servidor.getDepartamento(), hik,
                accessLogRepository.countByUserId(servidor.getId()),
                aluno.getId(), aluno.getNome(), aluno.getTurma(),
                aluno.getHikvisionEmployeeId(), substitui);
    }

    /**
     * Reclassifica um FUNC-### criado por engano: o identificador do HikCentral
     * volta para o ALUNO a que pertence e o registro de servidor sai de
     * circulação.
     *
     * Caso real de 04-05/08: 74 alunos estavam fora do departamento ALUNOS no
     * HikCentral, com id de 10 dígitos. A importação não achou matrícula para
     * eles e criou FUNC-### segurando a face — as passagens desses alunos
     * entravam nos relatórios como passagens de servidor. A correção em massa
     * foi feita em SQL; esta é a ferramenta para o caso seguinte, que volta a
     * acontecer a cada aluno mal arquivado no HCP.
     *
     * UMA transação. A coluna é UNIQUE: o aluno só pode receber o identificador
     * depois que o servidor o solta. Em dois passos haveria uma janela em que a
     * face não é de ninguém e, se o segundo passo falhasse, ficariam um aluno
     * sem face e um registro fantasma ainda ativo.
     *
     * O que NÃO se toca, nunca: nome, turma e tipo do aluno — são do Pronote.
     * E as passagens do servidor ficam onde estão: elas aconteceram, e o
     * registro inativo já sai dos relatórios (decisão registrada: histórico
     * honesto em vez de história reescrita).
     *
     * @param confirmarSubstituicao obrigatório quando o aluno JÁ tem outro
     *                              identificador — trocar a face de um aluno é
     *                              decisão consciente, não efeito colateral
     */
    @Transactional
    public ReclassPreview reclassifyStaffAsStudent(String servidorId, String alunoId,
                                                   boolean confirmarSubstituicao) {
        User servidor = carregarServidor(servidorId);
        User aluno = carregarAluno(alunoId);
        String hik = servidor.getHikvisionEmployeeId();

        if (hik != null) {
            String doAluno = aluno.getHikvisionEmployeeId();
            if (doAluno != null && !doAluno.equals(hik) && !confirmarSubstituicao) {
                throw new StaffAdminException(
                        "O aluno " + aluno.getNome() + " já tem o identificador " + doAluno
                                + " e este registro carrega o " + hik
                                + ". Confirme a substituição para trocar.");
            }
            // Solta primeiro e força o flush: sem isto o UNIQUE recusa o
            // segundo INSERT/UPDATE dentro da mesma transação.
            servidor.setHikvisionEmployeeId(null);
            userRepository.saveAndFlush(servidor);
            aluno.setHikvisionEmployeeId(hik);
            userRepository.save(aluno);
        }

        servidor.setAtivo(false);
        userRepository.save(servidor);

        log.info("Reclassificação: servidor {} ({}) inativado; identificador {} -> aluno {} ({})",
                servidor.getId(), servidor.getNome(),
                hik == null ? "(nenhum)" : hik, aluno.getId(), aluno.getNome());

        return new ReclassPreview(
                servidor.getId(), servidor.getNome(), servidor.getTipo().name(),
                servidor.getDepartamento(), hik,
                accessLogRepository.countByUserId(servidor.getId()),
                aluno.getId(), aluno.getNome(), aluno.getTurma(),
                aluno.getHikvisionEmployeeId(), false);
    }

    private static String normalizar(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
