package com.magbo.access.services;

import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Busca de ALUNO por nome, matricula ou turma — para telas onde se escolhe
 * UMA pessoa e escolher a errada tem consequencia.
 *
 * Por que nao reusa /api/users/search: aquela consulta e
 * `LOWER(nome) LIKE LOWER(:q)`, que e insensivel a CAIXA mas nao a ACENTO.
 * Numa escola francesa isso e o caso comum, nao a excecao: quem digita
 * "Goncalves" ou "Aurelie" no teclado do posto nao encontra "Gonçalves" nem
 * "Aurélie" e conclui que o aluno nao esta cadastrado. Tornar aquela consulta
 * insensivel a acento exigiria SQL dependente de banco (unaccent no Postgres,
 * outra coisa no H2 dos testes) e mudaria o comportamento das QUATRO telas que
 * ja a usam, em producao. Aqui a normalizacao e feita em Java: identica nos
 * dois bancos, entao o teste de integracao prova o comportamento de producao.
 *
 * O filtro por tipo vive no SERVIDOR e nao na tela: uma lista que devolve
 * servidor para uma tela que so aceita aluno depende de todo chamador lembrar
 * de filtrar — e basta um esquecer.
 *
 * Custo: varre os ativos em memoria (923 alunos reais). E a mesma ordem de
 * grandeza que o HikCentralImportService ja percorre por importacao, e acontece
 * uma vez por digitacao com debounce.
 */
@Service
@RequiredArgsConstructor
public class StudentSearchService {

    /** Teto duro: a tela mostra uma lista para escolher, nao um relatorio. */
    static final int LIMITE_MAXIMO = 50;
    static final int LIMITE_PADRAO = 20;

    /** Abaixo disto a busca devolve vazio: 1 letra casaria com meia escola. */
    static final int MINIMO_CARACTERES = 2;

    private final UserRepository userRepository;

    /**
     * Alunos ativos que casam com `q`, por nome, matricula ou turma.
     *
     * @return no maximo `limit` registros, em ordem de nome
     */
    public List<User> buscar(String q, Integer limit) {
        String alvo = normalizar(q);
        if (alvo == null || alvo.length() < MINIMO_CARACTERES) {
            return List.of();
        }
        int teto = (limit == null || limit < 1) ? LIMITE_PADRAO : Math.min(limit, LIMITE_MAXIMO);

        return userRepository.findByAtivoTrue().stream()
                .filter(u -> u.getTipo() == UserType.ALUNO)
                .filter(u -> casa(u, alvo))
                .sorted(Comparator.comparing(
                        u -> normalizarOuVazio(u.getNome()),
                        Comparator.naturalOrder()))
                .limit(teto)
                .toList();
    }

    /** Casa em qualquer um dos tres campos que o operador conhece da pessoa. */
    static boolean casa(User u, String alvoNormalizado) {
        if (u == null || alvoNormalizado == null || alvoNormalizado.isEmpty()) return false;
        return contem(u.getNome(), alvoNormalizado)
                || contem(u.getId(), alvoNormalizado)
                || contem(u.getTurma(), alvoNormalizado);
    }

    private static boolean contem(String campo, String alvoNormalizado) {
        String n = normalizar(campo);
        return n != null && n.contains(alvoNormalizado);
    }

    /**
     * Minuscula, sem acento, sem espaco sobrando.
     *
     * NFD separa a letra do diacritico e o replace remove a marca:
     * "Gonçalves" -> "goncalves", "Aurélie" -> "aurelie". Locale.ROOT para o
     * resultado nao depender da lingua da maquina (o classico do 'I' turco).
     *
     * @return null quando nao ha nada util para comparar
     */
    static String normalizar(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.isEmpty()) return null;
        return Normalizer.normalize(t, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ");
    }

    private static String normalizarOuVazio(String s) {
        String n = normalizar(s);
        return n == null ? "" : n;
    }
}
