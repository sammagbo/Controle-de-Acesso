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

    /** Falha com mensagem pronta para a tela. */
    public static class StaffAdminException extends RuntimeException {
        public StaffAdminException(String message) {
            super(message);
        }
    }

    /** Linha da lista de servidores, com o que a tela precisa decidir. */
    public record StaffRow(String id, String nome, String tipo, String departamento,
                           String hikvisionEmployeeId, boolean ativo,
                           long passagens, boolean podeRemover) {
    }

    /**
     * Todos os servidores (PROFESSOR + FUNCIONARIO), ativos e inativos.
     *
     * Traz a contagem de passagens porque é ela que decide se o registro pode
     * ser REMOVIDO ou apenas inativado — e quem está na tela precisa ver o
     * número antes de escolher, não descobrir depois numa mensagem de erro.
     */
    public List<StaffRow> listStaff() {
        return userRepository.findAll().stream()
                .filter(u -> TIPOS_DE_SERVIDOR.contains(u.getTipo()))
                .sorted((a, b) -> String.CASE_INSENSITIVE_ORDER.compare(
                        a.getNome() == null ? "" : a.getNome(),
                        b.getNome() == null ? "" : b.getNome()))
                .map(u -> {
                    long passagens = accessLogRepository.countByUserId(u.getId());
                    return new StaffRow(u.getId(), u.getNome(), u.getTipo().name(),
                            u.getDepartamento(), u.getHikvisionEmployeeId(),
                            Boolean.TRUE.equals(u.getAtivo()), passagens, passagens == 0);
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
     */
    @Transactional
    public User updateStaff(String id, String tipo, String departamento) {
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

        User salvo = userRepository.save(servidor);
        log.info("Servidor atualizado: id={}, tipo={}, departamento={}",
                salvo.getId(), salvo.getTipo(), salvo.getDepartamento());
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

    private User carregarAluno(String id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new StaffAdminException("Aluno não encontrado: " + id));
        if (u.getTipo() != UserType.ALUNO) {
            throw new StaffAdminException("Registro " + id + " não é um aluno (tipo " + u.getTipo() + ")");
        }
        return u;
    }

    private static String normalizar(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
