package com.magbo.access.services;

import com.magbo.access.dto.HikCentralRowDto;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Importacao do export "Renseignements personnels" do HikCentral.
 *
 * O HCP e a fonte da FACE; o Pronote e a fonte do ALUNO. Esta importacao apenas
 * LIGA os dois — preenche o identificador Hikvision e o departamento de quem ja
 * existe, e cadastra os servidores, que nao vem do Pronote.
 *
 * DUAS PASSADAS, sempre: {@link #plan} nao escreve nada e devolve o que
 * aconteceria linha a linha; {@link #apply} refaz o plano contra o estado ATUAL
 * e executa. O plano nao e carregado do preview de proposito — entre a
 * conferencia e a confirmacao o banco pode ter mudado, e aplicar um plano velho
 * seria escrever com base em algo que ja nao e verdade.
 *
 * REGRA DE OURO: aluno nao e criado nem alterado aqui. O export tem 996 alunos;
 * eles ja existem, vindos do Pronote, com nome e turma que sao a fonte da
 * verdade da Vie Scolaire. Uma importacao que sobrescrevesse nome ou turma —
 * ou pior, criasse um segundo registro do mesmo aluno — quebraria a chamada e o
 * boletim para consertar um campo de face.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class HikCentralImportService {

    /** Prefixo que o HCP poe em toda linha da coluna "Service". */
    private static final String PREFIXO_SERVICE = "All Departments";

    /** 83 linhas do export vem so com "All Departments", sem sub-departamento. */
    public static final String DEPARTAMENTO_INDEFINIDO = "NAO_DEFINIDO";

    private static final String DEPT_ALUNOS = "ALUNOS";
    private static final String DEPT_PROFESSORES = "PROFESSORES";

    /** Matricula Pronote: 7 digitos, zeros a esquerda preservados. */
    private static final Pattern MATRICULA_PRONOTE = Pattern.compile("^\\d{7}$");

    /**
     * ID plausivel: numerico com pelo menos 4 digitos. Recusa a linha de teste
     * do export (ID="1", nome "Andre", sem service) — que e o proprio admin
     * local do aparelho, ja conhecido como fonte de evento-ruido id=1.
     */
    private static final Pattern ID_PLAUSIVEL = Pattern.compile("^\\d{4,}$");

    private final UserRepository userRepository;

    /** O que a linha vai provocar. */
    public enum Acao {
        /** Servidor novo: sera criado com matricula FUNC-###. */
        CRIAR,
        /** Registro existente: preenche identificador Hikvision e departamento. */
        ATUALIZAR,
        /** Nada a fazer (ja importado) ou fora do escopo (aluno ausente, linha invalida). */
        PULAR,
        /** Identificador ja usado por outra pessoa — a coluna e UNIQUE. */
        CONFLITO,
        /** Aluno cujo ID nao e a matricula: so o nome liga de volta ao cadastro. */
        REVISAO_MANUAL
    }

    /** Decisao de UMA linha, com tudo que o operador precisa ler na tela. */
    public record RowPlan(
            int linha,
            String idHikvision,
            String nome,
            String departamento,
            String tipo,
            Acao acao,
            /** Matricula do registro afetado (existente ou a ser emitida). */
            String matricula,
            String detalhe) {
    }

    /** Resultado completo de um preview ou de uma aplicacao. */
    public record ImportPlan(
            List<RowPlan> linhas,
            Map<String, Integer> totais,
            /** Alunos que precisam de casamento manual — lista destacada. */
            List<RowPlan> revisaoManual,
            /** true quando ja foi gravado no banco. */
            boolean aplicado) {
    }

    // ───────────────── API ─────────────────

    /** Simulacao: NAO escreve nada. */
    public ImportPlan plan(List<HikCentralRowDto> linhas) {
        return montarPlano(linhas, false);
    }

    /**
     * Aplica de verdade. Refaz o plano contra o estado atual do banco — nunca
     * confia no plano que o operador viu na tela.
     */
    @Transactional
    public ImportPlan apply(List<HikCentralRowDto> linhas) {
        ImportPlan resultado = montarPlano(linhas, true);
        log.info("Importacao HikCentral aplicada: {}", resultado.totais());
        return resultado;
    }

    // ───────────────── Motor ─────────────────

    private ImportPlan montarPlano(List<HikCentralRowDto> linhas, boolean gravar) {
        List<RowPlan> planos = new ArrayList<>();
        if (linhas == null) linhas = List.of();

        // Carrega o cadastro UMA vez: 1198 linhas x 2 consultas seria o dobro
        // de ida ao banco sem ganho nenhum. Os mapas tambem sao o que permite
        // detectar duplicata DENTRO do proprio arquivo, que nenhuma consulta
        // pegaria — as linhas anteriores ainda nao foram gravadas.
        List<User> todos = userRepository.findAll();
        Map<String, User> porId = new HashMap<>();
        Map<String, User> porHikvision = new HashMap<>();
        for (User u : todos) {
            porId.put(u.getId(), u);
            if (u.getHikvisionEmployeeId() != null) {
                porHikvision.put(u.getHikvisionEmployeeId(), u);
            }
        }
        SequenciaMatricula sequencia = new SequenciaMatricula(porId.keySet());

        for (int i = 0; i < linhas.size(); i++) {
            HikCentralRowDto row = linhas.get(i);
            // Cabecalho na linha 9 -> a primeira linha de dados e a 10.
            int numeroLinha = (row != null && row.getLinha() != null) ? row.getLinha() : i + 10;
            planos.add(planejarLinha(row, numeroLinha, porId, porHikvision, sequencia, gravar));
        }

        Map<String, Integer> totais = new LinkedHashMap<>();
        for (Acao a : Acao.values()) {
            totais.put(a.name(), 0);
        }
        planos.forEach(p -> totais.merge(p.acao().name(), 1, Integer::sum));
        totais.put("TOTAL", planos.size());

        List<RowPlan> revisao = planos.stream().filter(p -> p.acao() == Acao.REVISAO_MANUAL).toList();
        return new ImportPlan(planos, totais, revisao, gravar);
    }

    private RowPlan planejarLinha(HikCentralRowDto row, int linha,
                                  Map<String, User> porId, Map<String, User> porHikvision,
                                  SequenciaMatricula sequencia, boolean gravar) {

        String id = trim(row == null ? null : row.getId());
        String nome = montarNome(row);
        String departamento = extrairDepartamento(row == null ? null : row.getService());

        // ── Validacao basica ──
        if (id == null) {
            return pular(linha, null, nome, departamento, null, "Linha sem ID");
        }
        if (!ID_PLAUSIVEL.matcher(id).matches()) {
            return pular(linha, id, nome, departamento, null,
                    "ID inválido (" + id + ") — linha de teste do próprio aparelho");
        }
        if (nome == null) {
            return pular(linha, id, null, departamento, null, "Linha sem nome");
        }

        UserType tipo = tipoDoDepartamento(departamento);

        // ── Aluno cujo ID nao e a matricula ──
        // Nove casos no export real (ex.: Tatiana PÁEZ 5629236986). Esses alunos
        // sao negados UNKNOWN_USER a cada passagem: o terminal manda um
        // employeeNo que nao existe em app_users. So o NOME liga de volta ao
        // cadastro, e casar por nome automaticamente e como se troca a face de
        // um aluno pela de outro — vai para revisao humana.
        if (tipo == UserType.ALUNO && !MATRICULA_PRONOTE.matcher(id).matches()) {
            return new RowPlan(linha, id, nome, departamento, tipo.name(), Acao.REVISAO_MANUAL, null,
                    "Aluno com ID de " + id.length() + " dígitos em vez da matrícula de 7 — "
                            + "casar manualmente pelo nome");
        }

        // ── Registro existente casado pela MATRICULA ──
        // Esta checagem vem PRIMEIRO, e a ordem e a regra: o ID da linha e a
        // matricula de alguem antes de ser o identificador de face de outro
        // alguem. Invertida, uma linha do aluno X cujo numero por acaso ja
        // esteja gravado como face do aluno Y atualizaria Y em silencio.
        User existente = porId.get(id);
        if (existente != null) {
            User donoDaFace = porHikvision.get(id);
            if (donoDaFace != null && !donoDaFace.getId().equals(existente.getId())) {
                return conflito(linha, id, nome, departamento, existente,
                        "Identificador já pertence a " + donoDaFace.getNome()
                                + " (" + donoDaFace.getId() + ")");
            }
            String faceAtual = existente.getHikvisionEmployeeId();
            if (faceAtual != null && !faceAtual.equals(id)) {
                // Repontar a face de alguem em silencio e pior que nao importar.
                return conflito(linha, id, nome, departamento, existente,
                        "Já possui outro identificador Hikvision (" + faceAtual + ")");
            }

            boolean mudaFace = faceAtual == null;
            boolean mudaDept = !java.util.Objects.equals(existente.getDepartamento(), departamento);
            if (!mudaFace && !mudaDept) {
                return pular(linha, id, nome, departamento, existente.getId(),
                        "Já importado — nada a alterar");
            }
            if (gravar) {
                // SO estes dois campos. nome e turma sao do Pronote e nao se
                // tocam; tipo tambem nao — quem ja esta cadastrado tem vinculo
                // definido pela escola, nao pelo departamento do HCP.
                if (mudaFace) existente.setHikvisionEmployeeId(id);
                existente.setDepartamento(departamento);
                userRepository.save(existente);
            }
            porHikvision.put(id, existente);
            return new RowPlan(linha, id, nome, departamento, existente.getTipo().name(),
                    Acao.ATUALIZAR, existente.getId(),
                    mudaFace ? "Preenche identificador Hikvision e departamento"
                             : "Atualiza departamento");
        }

        // ── Ja importado numa execucao anterior ──
        // Servidor criado antes ficou com matricula FUNC-###, entao o ID do HCP
        // so o encontra pelo identificador de face. Sem esta passagem, reaplicar
        // o mesmo arquivo tentaria criar tudo de novo e devolveria ~100
        // conflitos de UNIQUE em vez de "nada a alterar".
        User porFace = porHikvision.get(id);
        if (porFace != null) {
            String deptAtual = porFace.getDepartamento();
            if (java.util.Objects.equals(deptAtual, departamento)) {
                return pular(linha, id, nome, departamento, porFace.getId(),
                        "Já importado — nada a alterar");
            }
            if (gravar) {
                porFace.setDepartamento(departamento);
                userRepository.save(porFace);
            }
            return new RowPlan(linha, id, nome, departamento, porFace.getTipo().name(),
                    Acao.ATUALIZAR, porFace.getId(),
                    "Departamento atualizado (" + (deptAtual == null ? "vazio" : deptAtual)
                            + " → " + departamento + ")");
        }

        // ── Nao existe no MAGBO ──
        if (tipo == UserType.ALUNO) {
            // Aluno do HCP que nao esta no MAGBO: saiu da escola, ou ainda nao
            // sincronizou. Criar aqui produziria um aluno sem turma e sem
            // responsavel, fora do Pronote — exatamente o registro duplicado
            // que nao pode existir.
            return pular(linha, id, nome, departamento, null,
                    "Aluno não encontrado no MAGBO — cadastro vem da importação Pronote");
        }

        String matricula = sequencia.proxima();
        if (gravar) {
            User novo = User.builder()
                    .id(matricula)
                    .nome(nome)
                    .tipo(tipo)
                    .departamento(departamento)
                    .hikvisionEmployeeId(id)
                    .turma(null)
                    .ativo(true)
                    .mealCount(0)
                    .build();
            userRepository.save(novo);
            porId.put(matricula, novo);
            porHikvision.put(id, novo);
        } else {
            porHikvision.put(id, User.builder().id(matricula).nome(nome).build());
        }
        return new RowPlan(linha, id, nome, departamento, tipo.name(), Acao.CRIAR, matricula,
                "Servidor novo");
    }

    // ───────────────── Interpretacao dos campos ─────────────────

    /**
     * "All Departments/VIE SCOLAIRE" -> "VIE SCOLAIRE".
     * "All Departments" sozinho (83 linhas) -> NAO_DEFINIDO.
     */
    String extrairDepartamento(String service) {
        String s = trim(service);
        if (s == null) return DEPARTAMENTO_INDEFINIDO;
        if (s.equalsIgnoreCase(PREFIXO_SERVICE)) return DEPARTAMENTO_INDEFINIDO;
        int barra = s.indexOf('/');
        String dept = (barra >= 0) ? trim(s.substring(barra + 1)) : s;
        return dept == null ? DEPARTAMENTO_INDEFINIDO : dept.toUpperCase(Locale.ROOT);
    }

    /** ALUNOS -> ALUNO · PROFESSORES -> PROFESSOR · resto -> FUNCIONARIO. */
    UserType tipoDoDepartamento(String departamento) {
        if (DEPT_ALUNOS.equalsIgnoreCase(departamento)) return UserType.ALUNO;
        if (DEPT_PROFESSORES.equalsIgnoreCase(departamento)) return UserType.PROFESSOR;
        return UserType.FUNCIONARIO;
    }

    /** "Prénom" + "Nom de famille", sem espaco sobrando. */
    String montarNome(HikCentralRowDto row) {
        if (row == null) return null;
        String prenom = trim(row.getPrenom());
        String nom = trim(row.getNom());
        String completo = ((prenom == null ? "" : prenom) + " " + (nom == null ? "" : nom))
                .replaceAll("\\s+", " ").trim();
        return completo.isEmpty() ? null : completo;
    }

    // ───────────────── Auxiliares ─────────────────

    private RowPlan pular(int linha, String id, String nome, String dept, String matricula, String motivo) {
        return new RowPlan(linha, id, nome, dept, null, Acao.PULAR, matricula, motivo);
    }

    private RowPlan conflito(int linha, String id, String nome, String dept, User alvo, String motivo) {
        return new RowPlan(linha, id, nome, dept, alvo.getTipo().name(), Acao.CONFLITO, alvo.getId(), motivo);
    }

    private static String trim(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * Emissor de matriculas FUNC-### para a importacao inteira.
     *
     * Guarda a sequencia em memoria em vez de consultar o banco por linha: com
     * ~100 servidores no arquivo seriam ~100 varreduras, e — pior — no modo
     * preview, onde nada e gravado, toda linha receberia a MESMA matricula e o
     * operador veria um plano que nao corresponde ao que seria feito.
     */
    private static final class SequenciaMatricula {
        private final java.util.Set<String> usadas;
        private int proximo;

        SequenciaMatricula(java.util.Set<String> idsExistentes) {
            this.usadas = new java.util.HashSet<>(idsExistentes);
            int maior = 0;
            for (String id : idsExistentes) {
                if (id == null || !id.startsWith(StaffRegistrationService.PREFIXO_MATRICULA)) continue;
                try {
                    maior = Math.max(maior, Integer.parseInt(
                            id.substring(StaffRegistrationService.PREFIXO_MATRICULA.length())));
                } catch (NumberFormatException ignored) {
                    // Matricula fora do padrao numerico nao entra na sequencia.
                }
            }
            this.proximo = maior + 1;
        }

        String proxima() {
            String candidata;
            do {
                candidata = StaffRegistrationService.PREFIXO_MATRICULA
                        + String.format("%03d", proximo++);
            } while (!usadas.add(candidata));
            return candidata;
        }
    }
}
