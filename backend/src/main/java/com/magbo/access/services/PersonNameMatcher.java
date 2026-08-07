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
 * DELIBERADAMENTE ESTRITA depois disso: a comparacao principal (matches) e
 * IGUALDADE, nao "contem". Casar por semelhanca aqui e liberar uma catraca
 * para a pessoa errada — e o chamador ainda exige que o casamento seja UNICO
 * (ver CameraIdentityService). Quando nao da para afirmar, o sistema recusa e
 * deixa uma linha de log; nunca chuta.
 *
 * A UNICA excecao e isTruncatedPrefix, e ela existe por um defeito medido do
 * aparelho, nao por conveniencia — ver o javadoc daquele metodo.
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

    /**
     * Comprimento minimo, em caracteres normalizados, para um nome poder ser
     * tratado como prefixo de outro.
     *
     * <p>POR QUE 16, e nao o 12 que parece natural. O piso tem de caber numa
     * faixa com teto e chao, e os dois extremos sao mediveis:
     *
     * <p><b>Teto — nao pode barrar um nome de fato truncado.</b> A camera corta
     * em 32 caracteres CRUS (medido em producao em 07/08/2026: "Luis Fernando
     * FIGUEIREDO DOS SAN" e "Marcos Vinicius CLEMENTE FERREIR" tem exatamente
     * 32). Os dois normalizam para 32, porque nao tem inicial solta nem
     * pontuacao. O pior caso realista e um nome com varias abreviacoes — "Maria
     * A. B. C. DOS SANTOS SILVAX" perde quatro tokens de uma letra e ainda
     * assim aterrissa perto de 20. Ou seja: qualquer piso ate ~20 e incapaz de
     * causar falso-negativo no defeito que esta classe conserta.
     *
     * <p><b>Chao — tem de barrar nome curto e COMPLETO.</b> Este e o risco de
     * verdade: um nome que chegou inteiro, falhou no casamento exato (logo nao
     * e ninguem do cadastro) e mesmo assim seria prefixo de alguem. E aqui o 12
     * falha de forma concreta e conferivel: "maria santos", "ana carolina" e
     * "carlos souza" tem <b>exatamente 12</b> caracteres normalizados. Um piso
     * de 12 admite justamente a familia de nomes genericos de dois tokens que o
     * piso existe para excluir. Com 16 e preciso chegar bem dentro do terceiro
     * token ("ana carolina mag") para o prefixo ser sequer considerado.
     *
     * <p>16 e o meio da faixa segura [12, 20]: longe o bastante do chao para o
     * prefixo ser distintivo, longe o bastante do teto para nunca recusar uma
     * truncagem real.
     */
    public static final int MIN_PREFIXO_NORMALIZADO = 16;

    /**
     * O nome do CADASTRO comeca com o nome RECEBIDO, de forma que so se explica
     * por truncagem?
     *
     * <p>Existe porque a biblioteca facial da Hikvision limita o campo de nome
     * a 32 caracteres e o aparelho manda o nome cortado. Dois casos reais de
     * 07/08/2026 viraram UNKNOWN_FACE com a pessoa existindo em app_users:
     * "Luis Fernando FIGUEIREDO DOS SAN" (cadastro FUNC-036 "...DOS SANTOS") e
     * "Marcos Vinicius CLEMENTE FERREIR" (cadastro FUNC-201 "...FERREIRA").
     *
     * <p>IGUALDADE ESTA FORA DE PROPOSITO AQUI: se os dois normalizam para a
     * mesma coisa, o caso e de matches, e o chamador ja resolveu antes de
     * chegar neste metodo. Manter os dois predicados disjuntos e o que impede
     * alguem, mais tarde, de trocar um pelo outro e de quebra impor o piso de
     * comprimento a um casamento exato — que nao precisa dele.
     *
     * <p>⚠️ CUSTO ACEITO. Prefixo nao distingue truncagem de nome que de fato
     * e comeco de outro: se "Maria Silva Costa" (completa, 16 normalizados)
     * nao estiver no cadastro e existir exatamente uma "Maria Silva Costa
     * Pereira", as duas serao ligadas — e a ligacao GRUDA, porque o chamador
     * grava o certificateNumber. O que segura isso e a exigencia de casamento
     * UNICO no chamador mais a linha de INFO que todo casamento por prefixo
     * deixa: quem auditar consegue ver que aquela pessoa entrou por prefixo.
     */
    public static boolean isTruncatedPrefix(String recebido, String cadastro) {
        return isTruncatedPrefixNormalizado(normalize(recebido), normalize(cadastro));
    }

    /**
     * Como isTruncatedPrefix, com os dois lados JA normalizados.
     *
     * O chamador varre o cadastro inteiro (923 alunos + servidores) e normaliza
     * cada nome uma vez so; sem esta porta ele normalizaria tudo de novo na
     * segunda passada.
     */
    static boolean isTruncatedPrefixNormalizado(String recebidoNorm, String cadastroNorm) {
        if (recebidoNorm == null || cadastroNorm == null) return false;
        if (!prefixoElegivel(recebidoNorm)) return false;
        if (recebidoNorm.equals(cadastroNorm)) return false;
        return cadastroNorm.startsWith(recebidoNorm);
    }

    /** O nome recebido e longo o bastante para ser prefixo de alguem? */
    static boolean prefixoElegivel(String recebidoNorm) {
        return recebidoNorm != null && recebidoNorm.length() >= MIN_PREFIXO_NORMALIZADO;
    }
}
