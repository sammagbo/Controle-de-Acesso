package com.magbo.access.services;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Normalizacao de nome para casar o que a CAMERA diz com o que o CADASTRO tem.
 *
 * A biblioteca facial da camera e preenchida a mao, por outra pessoa, noutro
 * momento, e quase nunca escreve o nome exatamente como o Pronote. O caso real
 * que originou esta classe: a camera manda "Sammy MAGBO" e o cadastro tem
 * "Sammy K. MAGBO" (o nome completo do dono e SAMMY KABAGAMBE MAGBO, e o "K."
 * e a abreviacao do nome do meio).
 *
 * A regra, exatamente como especificada:
 *   1. acentos removidos      — "Gonçalves" e "Goncalves" sao a mesma pessoa
 *   2. caixa unificada        — "MAGBO" e "Magbo" idem
 *   3. pontuacao removida     — o ponto de "K." nao pode separar ninguem
 *   4. espacos colapsados     — dois espacos digitados nao criam outra pessoa
 *   5. iniciais soltas fora   — "K" isolado e abreviacao, nao nome
 *
 * DELIBERADAMENTE ESTRITA depois disso: a comparacao final e IGUALDADE, nao
 * "contem" nem "comeca com". Casar por semelhanca aqui e liberar uma catraca
 * para a pessoa errada — e o chamador ainda exige que o casamento seja UNICO
 * (ver CameraIdentityService). Quando nao da para afirmar, o sistema recusa e
 * deixa uma linha de log; nunca chuta.
 *
 * ⚠️ LIMITE CONHECIDO da regra 5: ela remove a inicial, nao expande a
 * abreviacao. "Sammy MAGBO" casa com "Sammy K. MAGBO", mas NAO casa com
 * "Sammy Kabagambe MAGBO" — sao [sammy, magbo] contra [sammy, kabagambe,
 * magbo]. Se o cadastro do Pronote trouxer o nome do meio por extenso, a
 * primeira passagem cai em UNKNOWN_FACE com o nome na linha de INFO, e a
 * ligacao passa a ser feita pelo numero do documento a partir dai.
 */
public final class PersonNameMatcher {

    private PersonNameMatcher() {
        // utilitario
    }

    /**
     * Forma canonica do nome, ou null quando nao sobra nada comparavel.
     *
     * Devolver null (e nao "") em vez de string vazia e o que impede o pior
     * defeito possivel aqui: dois nomes ilegiveis normalizando para "" e
     * "casando" entre si, ou pior, casando com um cadastro cujo nome tambem
     * ficou vazio — o que autorizaria uma pessoa qualquer.
     */
    public static String normalize(String nome) {
        if (nome == null) return null;

        String semAcento = Normalizer.normalize(nome, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");

        // Tudo que nao for letra ou digito vira separador: ponto, hifen,
        // apostrofo ("N'Diaye"), virgula. Assim "K." e "K" sao a mesma coisa.
        String soLetras = semAcento
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", " ")
                .trim();

        if (soLetras.isEmpty()) return null;

        StringBuilder sb = new StringBuilder();
        for (String token : soLetras.split(" ")) {
            // Inicial solta: abreviacao de um nome que o outro lado escreve por
            // extenso ou nao escreve. Nao identifica ninguem sozinha.
            if (token.length() <= 1) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(token);
        }

        String canonico = sb.toString();
        return canonico.isEmpty() ? null : canonico;
    }

    /**
     * Os dois nomes sao a mesma pessoa?
     *
     * Nome ausente ou irreconhecivel NUNCA casa — nem consigo mesmo. Duas
     * pessoas sem nome no cadastro nao sao a mesma pessoa.
     */
    public static boolean matches(String a, String b) {
        String na = normalize(a);
        String nb = normalize(b);
        return na != null && na.equals(nb);
    }
}
