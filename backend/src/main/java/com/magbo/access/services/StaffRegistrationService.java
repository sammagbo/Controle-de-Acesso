package com.magbo.access.services;

import com.magbo.access.dto.StaffRegistrationDto;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cadastro dos SERVIDORES da escola — professores, Vie Scolaire, servicos
 * gerais, administracao, direcao.
 *
 * Caminho separado do cadastro de ALUNO de proposito. Aluno vem do Pronote e
 * tem regras suas (id de 7 digitos, turma obrigatoria, responsavel); servidor e
 * cadastrado a mao ou por planilha, com matricula FUNC-### e o identificador do
 * HikCentral. Validar os dois no mesmo fluxo condicional e como se quebra o
 * cadastro de aluno sem perceber — e aluno aqui sao 923 pessoas reais que
 * chegam por sincronizacao automatica.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class StaffRegistrationService {

    /** Prefixo da matricula institucional de servidor. FUNC-001 ja existe. */
    public static final String PREFIXO_MATRICULA = "FUNC-";

    /** Largura minima do numero: FUNC-002, FUNC-045, FUNC-137. */
    private static final int DIGITOS = 3;

    private static final Pattern MATRICULA_GERADA = Pattern.compile("^FUNC-(\\d+)$");
    private static final Pattern SO_DIGITOS = Pattern.compile("^\\d{1,64}$");

    /** Vinculos aceitos aqui. ALUNO nao entra: aluno vem do Pronote. */
    private static final Set<UserType> TIPOS_DE_SERVIDOR =
            Set.of(UserType.PROFESSOR, UserType.FUNCIONARIO);

    private final UserRepository userRepository;

    /** Falha de cadastro com mensagem pronta para o operador ler na tela. */
    public static class StaffRegistrationException extends RuntimeException {
        public StaffRegistrationException(String message) {
            super(message);
        }
    }

    /**
     * Cadastra um servidor e devolve a linha gravada.
     *
     * @throws StaffRegistrationException com mensagem exibivel — nunca uma
     *         falha silenciosa. O formulario antigo mandava o POST, o banco
     *         recusava e a tela dizia "sucesso": o operador so descobria que
     *         nao havia cadastrado ninguem quando a face nao era reconhecida.
     */
    @Transactional
    public User register(StaffRegistrationDto dto) {
        String nome = trimOuNull(dto.getNome());
        if (nome == null) {
            throw new StaffRegistrationException("Nome é obrigatório");
        }

        UserType tipo = tipoDeServidor(dto.getTipo());
        String hikvisionId = normalizarHikvision(dto.getHikvisionEmployeeId());
        String matricula = trimOuNull(dto.getMatricula());

        if (matricula == null) {
            matricula = proximaMatricula();
        } else if (userRepository.existsById(matricula)) {
            throw new StaffRegistrationException(
                    "Matrícula já cadastrada: " + matricula);
        }

        if (hikvisionId != null) {
            Optional<User> dono = userRepository.findByHikvisionEmployeeId(hikvisionId);
            if (dono.isPresent()) {
                // Mensagem diz DE QUEM e o id: a coluna e UNIQUE, e sem o dono
                // o operador nao tem como resolver o conflito.
                throw new StaffRegistrationException(
                        "Identificador Hikvision " + hikvisionId + " já pertence a "
                                + dono.get().getNome() + " (" + dono.get().getId() + ")");
            }
        }

        User servidor = User.builder()
                .id(matricula)
                .nome(nome)
                .tipo(tipo)
                .departamento(trimOuNull(dto.getDepartamento()))
                .hikvisionEmployeeId(hikvisionId)
                // turma fica null: servidor nao tem turma, e as telas tem que
                // aguentar isso (busca, relatorios e Journal ja tratam null).
                .turma(null)
                .ativo(true)
                .mealCount(0)
                .build();

        User salvo = userRepository.save(servidor);
        log.info("Servidor cadastrado: id={}, tipo={}, departamento={}, hikvisionId={}",
                salvo.getId(), salvo.getTipo(), salvo.getDepartamento(),
                salvo.getHikvisionEmployeeId() != null ? "sim" : "ausente");
        return salvo;
    }

    /**
     * Proxima matricula livre da sequencia FUNC-###.
     *
     * Le o MAIOR numero ja emitido em vez de contar linhas: contar daria
     * colisao assim que um servidor fosse desativado ou removido. O laco final
     * cobre o resto — matricula digitada a mao fora da sequencia, ou duas
     * criacoes simultaneas.
     */
    public String proximaMatricula() {
        int maior = 0;
        for (User u : userRepository.findByIdStartingWith(PREFIXO_MATRICULA)) {
            Matcher m = MATRICULA_GERADA.matcher(u.getId());
            if (!m.matches()) continue;
            try {
                maior = Math.max(maior, Integer.parseInt(m.group(1)));
            } catch (NumberFormatException ignored) {
                // FUNC-<numero gigante>: nao entra na sequencia, e so.
            }
        }
        for (int n = maior + 1; n < maior + 1000; n++) {
            String candidata = PREFIXO_MATRICULA + String.format("%0" + DIGITOS + "d", n);
            if (!userRepository.existsById(candidata)) {
                return candidata;
            }
        }
        throw new StaffRegistrationException(
                "Não foi possível gerar matrícula automática — informe uma manualmente");
    }

    /**
     * Aceita PROFESSOR e FUNCIONARIO; em branco assume FUNCIONARIO (o caso
     * comum). ALUNO e recusado com mensagem explicita em vez de virar
     * FUNCIONARIO em silencio — cadastrar aluno por aqui contornaria o Pronote.
     */
    private UserType tipoDeServidor(String bruto) {
        String tipo = trimOuNull(bruto);
        if (tipo == null) return UserType.FUNCIONARIO;
        UserType parsed;
        try {
            parsed = UserType.valueOf(tipo.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new StaffRegistrationException(
                    "Tipo inválido: " + tipo + " (use PROFESSOR ou FUNCIONARIO)");
        }
        if (!TIPOS_DE_SERVIDOR.contains(parsed)) {
            throw new StaffRegistrationException(
                    "Tipo " + parsed + " não é de servidor — alunos vêm da importação Pronote");
        }
        return parsed;
    }

    /**
     * O employeeNo do HikCentral e numerico (10 digitos no padrao do HCP).
     * Validamos que sejam SO digitos, sem exigir exatamente 10: a mesma coluna
     * guarda os ids de 7 digitos do Pronote, e um tamanho fixo recusaria dado
     * legitimo. Zeros a esquerda preservados — e String o caminho inteiro.
     */
    private String normalizarHikvision(String bruto) {
        String id = trimOuNull(bruto);
        if (id == null) return null;
        if (!SO_DIGITOS.matcher(id).matches()) {
            throw new StaffRegistrationException(
                    "Identificador Hikvision deve conter apenas dígitos: " + id);
        }
        return id;
    }

    private static String trimOuNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /** Resultado de uma linha da planilha, para o relatorio por linha. */
    public record RowResult(int linha, String nome, String matricula, String erro) {
        public boolean ok() {
            return erro == null;
        }
    }

    /**
     * Importacao em lote. Cada linha e INDEPENDENTE: uma linha ruim nao derruba
     * a planilha, e o operador recebe o motivo linha a linha.
     *
     * ⚠️ NAO anotar este metodo com @Transactional. Uma transacao unica em
     * volta do laco faria a 200a linha duplicada desfazer as 199 boas — e pior,
     * a violacao de UNIQUE marca a transacao como rollback-only, entao todas as
     * linhas seguintes falhariam em cascata por causa de uma so. Como esta
     * chamada e interna (this.register), o @Transactional de register() nao
     * passa pelo proxy do Spring e cada save commita pela transacao do proprio
     * repositorio: exatamente a independencia por linha que se quer aqui.
     */
    public List<RowResult> registerBulk(List<StaffRegistrationDto> linhas) {
        List<RowResult> resultados = new java.util.ArrayList<>();
        if (linhas == null) return resultados;

        for (int i = 0; i < linhas.size(); i++) {
            StaffRegistrationDto dto = linhas.get(i);
            // +2: o cabecalho e a linha 1 da planilha, entao o item 0 e a linha 2.
            int linhaPlanilha = i + 2;
            String nome = dto != null ? trimOuNull(dto.getNome()) : null;
            try {
                User salvo = register(dto);
                resultados.add(new RowResult(linhaPlanilha, salvo.getNome(), salvo.getId(), null));
            } catch (StaffRegistrationException e) {
                resultados.add(new RowResult(linhaPlanilha,
                        nome != null ? nome : "(vazio)", null, e.getMessage()));
            } catch (org.springframework.dao.DataIntegrityViolationException e) {
                // Rede de seguranca do BANCO: duas linhas da mesma planilha com
                // o mesmo identificador, ou corrida com outro cadastro. A
                // checagem anterior e leitura-depois-escrita e nao e atomica;
                // quem garante de verdade e o UNIQUE. Traduzido para o operador
                // em vez de virar 500 com stack trace.
                resultados.add(new RowResult(linhaPlanilha,
                        nome != null ? nome : "(vazio)", null,
                        "Identificador Hikvision ou matrícula já cadastrados (recusado pelo banco)"));
            } catch (Exception e) {
                resultados.add(new RowResult(linhaPlanilha,
                        nome != null ? nome : "(vazio)", null,
                        "Erro inesperado: " + e.getMessage()));
            }
        }
        return resultados;
    }
}
