package com.magbo.access.services;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

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
 * O nome que vem da CAMERA passa antes por normalizeRecebido, que acrescenta a
 * leitura com a transliteracao de acento desfeita ("LABB'E" tambem lido como
 * "LABBÉ"). E acrescenta, nao substitui: ver o javadoc daquele metodo para o
 * porque — o mesmo apostrofo tem dois sentidos e o sistema nao escolhe entre
 * eles. O CADASTRO nunca passa por essa decodificacao.
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
     * Marcador de acento transliterado seguido da letra que ele acentuava.
     *
     * ⚠️ A LETRA VEM EM QUALQUER CAIXA, e isso e medido, nao suposto. Tres dos
     * quinze casos de producao de 11/08/2026 trazem o marcador antes de
     * MINUSCULA — "Jo~ao" (João), "Isma\"el" (Ismaël) e "Chlo\"e" (Chloë).
     * Restringir a maiuscula deixaria esses tres exatamente como estavam.
     */
    private static final Pattern ACENTO_TRANSLITERADO = Pattern.compile("['~^`\"](\\p{L})");

    /**
     * Desfaz a transliteracao de acento que a camera da portaria aplica.
     *
     * <p>MEDIDO EM PRODUCAO em 11/08/2026: a camera nao manda a letra acentuada
     * — manda o acento como caractere ASCII solto, imediatamente ANTES da letra
     * que ele acentuava. Cinco marcadores, um por diacritico:
     *
     * <pre>
     *   '  agudo        S'A -> SÁ · LABB'E -> LABBÉ · ARA'UJO -> ARAÚJO
     *   ~  til          BRAND~AO -> BRANDÃO · Jo~ao -> João · ANCI~AES -> ANCIÃES
     *   ^  circunflexo  C^ORTE -> CÔRTE · L^OBO -> LÔBO · DUP^AQUIER -> DUPÂQUIER
     *   `  grave        CHAUVI`ERE -> CHAUVIÈRE · CARRI`ERES -> CARRIÈRES
     *   "  trema        Isma"el -> Ismaël · ISA"IA -> ISAÏA · Chlo"e -> Chloë
     * </pre>
     *
     * <p>POR QUE ISSO QUEBRAVA O CASAMENTO, e por que quebrava tao mal: para o
     * normalize esses cinco caracteres sao pontuacao, logo SEPARADOR. "LABB'E"
     * virava "labb e", e o "e" solto ainda era descartado pela regra 5 (inicial
     * solta), sobrando "labb" contra "labbe" do cadastro. Quando o acento cai na
     * SEGUNDA letra o estrago e maior: "C^ORTE" virava "orte" — o "C" e que
     * sumia. 57 pessoas reconhecidas pela camera nao casavam com o cadastro por
     * isto.
     *
     * <p>Devolve o nome com os marcadores removidos e a letra base preservada.
     * Nao remove acento e nao mexe em caixa — quem faz isso e o normalize, que
     * roda depois e continua igual.
     */
    public static String decodificarAcentoTransliterado(String nome) {
        if (nome == null) return null;
        return ACENTO_TRANSLITERADO.matcher(nome).replaceAll("$1");
    }

    /**
     * As formas normalizadas com que o nome RECEBIDO da camera pode ser
     * comparado com o cadastro: a leitura literal e a decodificada.
     *
     * <p>⚠️ DUAS LEITURAS, E NAO UMA, PORQUE A TRANSLITERACAO E AMBIGUA. Os
     * mesmos tres caracteres tem dois sentidos legitimos e nada no texto os
     * separa:
     *
     * <pre>
     *   "S'A"      e SÁ           — apostrofo = acento agudo
     *   "D'AVILA"  e D'ÁVILA      — apostrofo = apostrofo mesmo
     * </pre>
     *
     * <p>Nao ha regra de posicao que resolva: nos dois casos o marcador vem
     * depois de UMA letra e antes de uma maiuscula. Entao nao se escolhe — as
     * duas leituras sao oferecidas ao chamador, e quem arbitra continua sendo a
     * exigencia de casamento UNICO no CameraIdentityService.
     *
     * <p>ESTRITAMENTE ADITIVO, e e o que torna a mudanca segura: a forma
     * literal continua na lista, entao nenhum casamento que funcionava antes
     * deixa de funcionar. Concretamente, "D'ÁVILA" no cadastro normaliza para
     * "avila" (o "D" solto cai pela regra 5) e o recebido "D'AVILA" continua
     * produzindo "avila" pela leitura literal — ele so GANHA "davila" como
     * segunda leitura. Se a decodificacao SUBSTITUISSE a leitura literal, este
     * caso passaria a falhar: era o unico que funcionava antes da correcao.
     *
     * <p>Devolve lista vazia (nunca null, nunca elemento null) quando nao sobra
     * nada comparavel, e um unico elemento quando as duas leituras coincidem —
     * que e o caso da esmagadora maioria dos nomes, sem marcador nenhum.
     */
    public static List<String> normalizeRecebido(String nome) {
        String literal = normalize(nome);
        String decodificada = normalize(decodificarAcentoTransliterado(nome));

        if (literal == null) {
            return decodificada == null ? List.of() : List.of(decodificada);
        }
        if (decodificada == null || decodificada.equals(literal)) {
            return List.of(literal);
        }
        return List.of(literal, decodificada);
    }

    /**
     * O nome RECEBIDO da camera e o do CADASTRO sao a mesma pessoa?
     *
     * <p>⚠️⚠️ <b>ASSIMETRICO DE PROPOSITO — NAO "SIMPLIFIQUE" APLICANDO A
     * DECODIFICACAO NOS DOIS LADOS.</b> Ao contrario de matches, aqui o
     * primeiro argumento (o que a camera leu) ganha a segunda leitura e o
     * segundo (o cadastro) NAO. Parece uma inconsistencia a ser arrumada. Nao
     * e: e a diferenca entre um texto AMBIGUO e um texto CORRETO.
     *
     * <p><b>Por que o texto da camera precisa de duas leituras.</b> Ele e
     * lossy: o aparelho jogou fora a letra acentuada e pos um caractere ASCII
     * no lugar do acento. "S'A" pode ser SÁ (acento) ou S'A (apostrofo), e nao
     * ha nada no texto que diga qual — por isso as duas leituras, e por isso
     * quem decide e a exigencia de casamento unico no chamador.
     *
     * <p><b>Por que o do cadastro NAO precisa.</b> Ele nao e lossy: veio do
     * Pronote ou das telas de servidor, digitado por gente, e "D'ÁVILA" tem o
     * apostrofo E o acento, cada um como ele mesmo. Nao ha o que adivinhar.
     * Decodifica-lo seria reinterpretar um caractere que ja esta certo — trocar
     * o dado de referencia do sistema por um palpite.
     *
     * <p><b>E o preco e concreto, nao teorico: PESSOAS DEIXARIAM DE SER
     * RECONHECIDAS.</b> Decodificar o cadastro colaria o apostrofo na letra
     * seguinte, e o sobrenome deixaria de casar com a grafia SEPARADA que a
     * biblioteca facial costuma trazer:
     *
     * <pre>
     *   cadastro "N'Diaye Fatou"   hoje -> "diaye fatou"   (o "N" solto cai pela regra 5)
     *                        decodificado -> "ndiaye fatou"
     *   camera   "N Diaye Fatou"        -> "diaye fatou"
     *                                      casa hoje; NAO casaria depois
     * </pre>
     *
     * <p>Ou seja: a "simplificacao" nao empata — ela TROCA um defeito por
     * outro, e o novo atinge exatamente a familia de nomes (D', O', N', L') que
     * esta correcao existe para nao quebrar. Ha teste fixando este par:
     * PersonNameMatcherTest.ApostrofoLegitimo#cadastroNuncaEDecodificado.
     */
    public static boolean matchesRecebido(String recebido, String cadastro) {
        String doCadastro = normalize(cadastro);
        return doCadastro != null && normalizeRecebido(recebido).contains(doCadastro);
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
