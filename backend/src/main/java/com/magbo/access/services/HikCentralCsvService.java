package com.magbo.access.services;

import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

/**
 * F7b — GERACAO DO CSV DE IMPORTACAO DO HIKCENTRAL.
 *
 * O caminho inverso do HikCentralImportService: em vez de ler o export do HCP e
 * preencher o MAGBO, escreve a lista de pessoas que o HCP precisa cadastrar
 * para que a face passe a ser reconhecida. O ciclo desenhado com o Fabiano
 * (docs/operacional/procedimento-hikcentral.md, §1) e:
 *
 *   MAGBO gera o CSV -> TI importa no HCP -> "Apply to Device" -> 0 falhas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ O TEMPLATE EXATO DO HCP AINDA E PENDENCIA (pendencia 3 do procedimento,
 * "[A DEFINIR COM FABIANO]"). Ate ele ser baixado da tela de importacao do
 * proprio HCP, este gerador usa as MESMAS COLUNAS DO EXPORT que o MAGBO ja le
 * e ja tem provado com arquivo real — "ID", "Prénom", "Nom de famille",
 * "Service". Escolha deliberada: e o unico mapeamento que existe no projeto, e
 * garante ida-e-volta (o que este servico escreve, o HikCentralImportService le
 * de volta). Se o template de IMPORTACAO do HCP tiver outras colunas, muda-se
 * COLUNAS e a montagem da linha — o resto do caminho continua valendo.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REGRA CRITICA — ZEROS A ESQUERDA. `Person ID` = `hikvision_employee_id` como
 * TEXTO, com os zeros preservados (matriculas Pronote tem 7 digitos: 0001764).
 * Por isso TODO campo sai entre aspas: em CSV, aspas e a forma de dizer "isto e
 * texto". E por isso o arquivo NUNCA pode passar pelo Excel, que transforma
 * 0001764 em 1764 mesmo com as aspas la.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class HikCentralCsvService {

    /** Quem entra no arquivo. */
    public enum Scope {
        /** So quem ainda nao tem face ligada — o uso normal. */
        MISSING_FACE,
        /** Todos os alunos ativos — para recriar o cadastro do zero. */
        ALL
    }

    /**
     * Separador. O HCP frances usa ponto-e-virgula, que e tambem o que o
     * endpoint /import-match ja consome. Confirmar com o template real
     * (pendencia 3) antes do primeiro uso.
     */
    static final char SEPARADOR = ';';

    /** RFC 4180. O HCP roda em Windows; LF sozinho ja apareceu como uma linha so. */
    static final String FIM_DE_LINHA = "\r\n";

    /**
     * Nome da coluna que leva a TURMA do aluno.
     *
     * ⚠️ SUPOSICAO DECLARADA, e ela e de UMA LINHA de proposito.
     *
     * O template de IMPORTACAO do HCP continua sendo a pendencia 3 do
     * procedimento ("[A DEFINIR COM FABIANO]"), e o projeto nao tem, em doc
     * nenhum, o nome que o HCP espera para a classe — o unico mapeamento de
     * turma que existe e o do PRONOTE (`CLASSES`, docs/PROCEDURE_ANNUELLE.md),
     * que e outro sistema e nao serve aqui. As quatro colunas restantes deste
     * arquivo vem do EXPORT real do HCP, que o projeto ja leu e provou.
     *
     * "Classe" foi escolhido por ser o termo do proprio locale frances do HCP,
     * coerente com "Prénom" / "Nom de famille" / "Service". Quando o Fabiano
     * entregar o template, muda-se ESTA constante e mais nada.
     *
     * Acrescentar a coluna NAO quebra a ida-e-volta: o import descarta colunas
     * que nao conhece (provado em tests/hikcentralSheet.test.js, "ignora
     * colunas desconhecidas"), entao o que sai daqui continua voltando igual.
     */
    static final String COLUNA_TURMA = "Classe";

    /**
     * Cabecalho, com os mesmos nomes que o import le
     * (js/utils/hikcentralSheet.js e HikCentralImportService) + a turma.
     *
     * A turma vai no FIM: as quatro primeiras sao as provadas contra arquivo
     * real, e mante-las na mesma ordem e o que permite comparar um export de
     * hoje com um de antes desta mudanca sem realinhar coluna nenhuma.
     */
    static final List<String> COLUNAS = List.of("ID", "Prénom", "Nom de famille", "Service", COLUNA_TURMA);

    /** Valor da coluna Service para aluno — o import devolve UserType.ALUNO a partir dele. */
    static final String SERVICE_ALUNOS = "All Departments/ALUNOS";

    private final UserRepository userRepository;

    /**
     * Alunos ATIVOS do escopo pedido, em ordem de matricula.
     *
     * Ordem estavel de proposito: dois exports do mesmo estado tem que dar
     * arquivos identicos, senao nao da para comparar o de hoje com o da semana
     * passada nem saber o que mudou.
     */
    public List<User> selecionar(Scope scope) {
        return userRepository.findAll().stream()
                .filter(u -> u.getTipo() == UserType.ALUNO)
                .filter(u -> Boolean.TRUE.equals(u.getAtivo()))
                .filter(u -> scope == Scope.ALL || u.getHikvisionEmployeeId() == null)
                .sorted(Comparator.comparing(User::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    /** Conveniencia: seleciona e escreve. */
    public String gerar(Scope scope) {
        List<User> alunos = selecionar(scope);
        log.info("Export HikCentral: {} aluno(s) no escopo {}", alunos.size(), scope);
        return escrever(alunos);
    }

    /**
     * Monta o CSV. Puro — nao toca em banco, para poder ser testado sobre casos
     * que seria trabalhoso montar no repositorio (aspas no nome, acento, nome
     * de uma palavra so).
     *
     * Lista vazia devolve SO o cabecalho, e nao string vazia: um arquivo com
     * cabecalho e zero linhas diz "nao ha ninguem pendente"; um arquivo vazio
     * parece exportacao quebrada.
     */
    public String escrever(List<User> alunos) {
        StringBuilder sb = new StringBuilder();
        sb.append(linha(COLUNAS));
        if (alunos != null) {
            for (User u : alunos) {
                if (u == null) continue;
                sb.append(linha(List.of(
                        personId(u),
                        prenom(u.getNome()),
                        nomDeFamille(u.getNome()),
                        SERVICE_ALUNOS,
                        turma(u)
                )));
            }
        }
        return sb.toString();
    }

    /**
     * O identificador que o HCP vai gravar na pessoa.
     *
     * Quem ja tem face ligada sai com o proprio identificador (reimportar nao
     * pode trocar a face de dono). Quem NAO tem sai com a MATRICULA — e a
     * convencao do projeto ("hikvision_employee_id = mesmo id"), e e o que faz
     * o evento voltar casando com o cadastro depois que a face for capturada.
     */
    String personId(User u) {
        String hik = trim(u.getHikvisionEmployeeId());
        return hik != null ? hik : trim(u.getId());
    }

    /**
     * A turma do aluno, como TEXTO.
     *
     * Aluno sem turma sai com campo VAZIO, nunca com "—", "N/A" ou o proprio
     * id: o CSV vai ser lido por outra maquina, e um marcador humano viraria
     * uma turma chamada "—" no HCP.
     *
     * Turma nao tem zero a esquerda hoje ("1E1", "CE2A"), mas sai entre aspas
     * como todo campo deste arquivo — pela mesma razao da matricula: em CSV,
     * aspas e a forma de dizer "isto e texto", e uma turma futura que comece
     * por zero nao pode depender de ninguem ter lembrado disso.
     */
    String turma(User u) {
        String t = trim(u.getTurma());
        return t != null ? t : "";
    }

    /**
     * Primeira palavra do nome. E o inverso exato de
     * HikCentralImportService#montarNome, que faz "Prénom" + " " + "Nom de
     * famille" — assim o que sai daqui volta igual por la.
     */
    String prenom(String nome) {
        String n = normalizarEspacos(nome);
        if (n == null) return "";
        int espaco = n.indexOf(' ');
        return espaco < 0 ? n : n.substring(0, espaco);
    }

    /** O resto do nome. Nome de uma palavra so devolve vazio, nao repete o Prénom. */
    String nomDeFamille(String nome) {
        String n = normalizarEspacos(nome);
        if (n == null) return "";
        int espaco = n.indexOf(' ');
        return espaco < 0 ? "" : n.substring(espaco + 1);
    }

    private String linha(List<String> campos) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < campos.size(); i++) {
            if (i > 0) sb.append(SEPARADOR);
            sb.append(aspas(campos.get(i)));
        }
        return sb.append(FIM_DE_LINHA).toString();
    }

    /**
     * TODO campo entre aspas, sempre — nao so os que "precisam".
     *
     * Um CSV em que 0001764 aparece sem aspas convida qualquer leitor a tratar
     * a coluna como numero, e o zero morre. Aspas em todos os campos torna o
     * arquivo uniforme e a intencao explicita. Aspa interna vira aspa dupla,
     * como manda o RFC 4180.
     */
    static String aspas(String valor) {
        String v = valor == null ? "" : valor;
        return '"' + v.replace("\"", "\"\"") + '"';
    }

    private static String normalizarEspacos(String s) {
        if (s == null) return null;
        String limpo = s.replaceAll("\\s+", " ").trim();
        return limpo.isEmpty() ? null : limpo;
    }

    private static String trim(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
