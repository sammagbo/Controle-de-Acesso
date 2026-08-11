package com.magbo.access.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * NORMALIZACAO DE NOME — o unico elo entre a biblioteca facial da camera e o
 * cadastro do MAGBO.
 *
 * A biblioteca da camera e preenchida a mao, por outra equipe, e quase nunca
 * escreve o nome como o Pronote. Casar de menos deixa gente conhecida entrando
 * como "rosto desconhecido"; casar de mais atribui a passagem — e a saida — a
 * pessoa errada. Os testes abaixo cobrem os dois lados, e o segundo importa
 * mais.
 */
class PersonNameMatcherTest {

    @Nested
    @DisplayName("★ o caso real que originou a regra")
    class CasoReal {

        @Test
        @DisplayName("★ camera 'Sammy MAGBO' casa com cadastro 'Sammy K. MAGBO'")
        void inicialAbreviadaNoMeio() {
            assertThat(PersonNameMatcher.matches("Sammy MAGBO", "Sammy K. MAGBO"))
                    .as("a inicial solta e abreviacao, nao nome — nao pode separar a pessoa de si mesma")
                    .isTrue();
        }

        @Test
        @DisplayName("os dois lados normalizam para a mesma coisa")
        void mesmaFormaCanonica() {
            assertThat(PersonNameMatcher.normalize("Sammy MAGBO")).isEqualTo("sammy magbo");
            assertThat(PersonNameMatcher.normalize("Sammy K. MAGBO")).isEqualTo("sammy magbo");
        }

        @Test
        @DisplayName("⚠️ LIMITE CONHECIDO: nome do meio POR EXTENSO nao casa")
        void nomeDoMeioPorExtensoNaoCasa() {
            // A regra remove a inicial, nao expande a abreviacao. Se o cadastro
            // do Pronote trouxer "Sammy Kabagambe MAGBO", a primeira passagem
            // cai em UNKNOWN_FACE com o nome na linha de INFO — e a ligacao
            // passa a ser pelo numero do documento. Congelado aqui para que a
            // limitacao seja uma DECISAO visivel e nao uma surpresa.
            assertThat(PersonNameMatcher.matches("Sammy MAGBO", "Sammy Kabagambe MAGBO"))
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("as cinco transformacoes")
    class Transformacoes {

        @Test
        @DisplayName("1. acentos removidos")
        void acentos() {
            assertThat(PersonNameMatcher.matches("Aurelie Goncalves", "Aurélie Gonçalves")).isTrue();
            assertThat(PersonNameMatcher.normalize("Gonçalves")).isEqualTo("goncalves");
            assertThat(PersonNameMatcher.normalize("José Ñuñez")).isEqualTo("jose nunez");
        }

        @Test
        @DisplayName("2. caixa unificada")
        void caixa() {
            assertThat(PersonNameMatcher.matches("MARIE DUPONT", "marie dupont")).isTrue();
        }

        @Test
        @DisplayName("3. pontuacao removida")
        void pontuacao() {
            assertThat(PersonNameMatcher.matches("Jean-Pierre Martin", "Jean Pierre Martin")).isTrue();
            assertThat(PersonNameMatcher.matches("N'Diaye Fatou", "N Diaye Fatou")).isTrue();
            assertThat(PersonNameMatcher.matches("Silva, Ana", "Silva Ana")).isTrue();
        }

        @Test
        @DisplayName("4. espacos colapsados")
        void espacos() {
            assertThat(PersonNameMatcher.matches("  Marie   Dupont  ", "Marie Dupont")).isTrue();
            assertThat(PersonNameMatcher.normalize("Marie\tDupont")).isEqualTo("marie dupont");
        }

        @Test
        @DisplayName("5. iniciais soltas ignoradas, em qualquer posicao")
        void iniciais() {
            assertThat(PersonNameMatcher.matches("Ana Silva", "A. Ana Silva")).isTrue();
            assertThat(PersonNameMatcher.matches("Ana Silva", "Ana Silva J.")).isTrue();
            assertThat(PersonNameMatcher.matches("Ana Silva", "Ana B. C. Silva")).isTrue();
        }
    }

    @Nested
    @DisplayName("★ o que NAO pode casar")
    class NaoCasa {

        @Test
        @DisplayName("★ pessoas diferentes continuam diferentes")
        void pessoasDiferentes() {
            assertThat(PersonNameMatcher.matches("Ana Silva", "Ana Souza")).isFalse();
            assertThat(PersonNameMatcher.matches("Marie Dupont", "Marie Dupond")).isFalse();
        }

        @Test
        @DisplayName("★ sobrenome a mais e OUTRA pessoa — a comparacao e igualdade, nao 'contem'")
        void nomeParcialNaoCasa() {
            // "Ana Silva" vs "Ana Beatriz Silva": casar aqui seria abrir a
            // catraca por semelhanca. Quando ha duvida, o chamador nega.
            assertThat(PersonNameMatcher.matches("Ana Silva", "Ana Beatriz Silva")).isFalse();
            assertThat(PersonNameMatcher.matches("Ana", "Ana Silva")).isFalse();
        }

        @Test
        @DisplayName("★ nome ausente NUNCA casa — nem com outro ausente")
        void nomeAusente() {
            assertThat(PersonNameMatcher.matches(null, null)).isFalse();
            assertThat(PersonNameMatcher.matches(null, "Ana Silva")).isFalse();
            assertThat(PersonNameMatcher.matches("Ana Silva", null)).isFalse();
            assertThat(PersonNameMatcher.matches("", "")).isFalse();
            assertThat(PersonNameMatcher.matches("   ", "   ")).isFalse();
        }

        @Test
        @DisplayName("★ nome so de iniciais normaliza para NULL, nao para vazio")
        void soIniciais() {
            // Se normalizasse para "", dois cadastros ilegiveis casariam entre
            // si — e um rosto qualquer viraria uma pessoa qualquer.
            assertThat(PersonNameMatcher.normalize("A. B. C.")).isNull();
            assertThat(PersonNameMatcher.matches("A. B.", "X. Y.")).isFalse();
        }

        @Test
        @DisplayName("pontuacao pura normaliza para null")
        void pontuacaoPura() {
            assertThat(PersonNameMatcher.normalize("...")).isNull();
            assertThat(PersonNameMatcher.normalize("-")).isNull();
        }
    }

    @Nested
    @DisplayName("★ nome truncado em 32 caracteres pela camera")
    class Truncado {

        // Os dois casos de producao de 07/08/2026. Ambos os nomes recebidos tem
        // EXATAMENTE 32 caracteres crus — e o corte do campo de nome da
        // biblioteca facial da Hikvision, nao da coluna nome_snapshot (255).
        private static final String LUIS_CAMERA = "Luis Fernando FIGUEIREDO DOS SAN";
        private static final String LUIS_CADASTRO = "Luis Fernando FIGUEIREDO DOS SANTOS";
        private static final String MARCOS_CAMERA = "Marcos Vinicius CLEMENTE FERREIR";
        private static final String MARCOS_CADASTRO = "Marcos Vinicius CLEMENTE FERREIRA";

        @Test
        @DisplayName("★ os dois nomes reais tem 32 caracteres — a medida de onde vem o corte")
        void trintaEDoisCaracteres() {
            assertThat(LUIS_CAMERA).hasSize(32);
            assertThat(MARCOS_CAMERA).hasSize(32);
        }

        @Test
        @DisplayName("★ caso real 1: FUNC-036, 'DOS SAN' -> 'DOS SANTOS'")
        void casoLuisFernando() {
            assertThat(PersonNameMatcher.matches(LUIS_CAMERA, LUIS_CADASTRO))
                    .as("nao e casamento exato — e por isso que caia em UNKNOWN_FACE")
                    .isFalse();
            assertThat(PersonNameMatcher.isTruncatedPrefix(LUIS_CAMERA, LUIS_CADASTRO)).isTrue();
        }

        @Test
        @DisplayName("★ caso real 2: FUNC-201, 'FERREIR' -> 'FERREIRA'")
        void casoMarcosVinicius() {
            assertThat(PersonNameMatcher.matches(MARCOS_CAMERA, MARCOS_CADASTRO)).isFalse();
            assertThat(PersonNameMatcher.isTruncatedPrefix(MARCOS_CAMERA, MARCOS_CADASTRO)).isTrue();
        }

        @Test
        @DisplayName("★ o sentido importa: o CADASTRO e que comeca com o RECEBIDO")
        void naoEhSimetrico() {
            // Inverter e dizer que a camera mandou o nome completo e o cadastro
            // e que esta cortado — o que nao acontece, e aceitar isso abriria
            // casamento de "Ana Silva Costa Pereira" com o cadastro "Ana Silva
            // Costa", que e outra pessoa.
            assertThat(PersonNameMatcher.isTruncatedPrefix(LUIS_CADASTRO, LUIS_CAMERA)).isFalse();
        }

        @Test
        @DisplayName("★ prefixo curto demais e RECUSADO")
        void prefixoCurtoDemais() {
            // "maria santos" tem exatamente 12 normalizados: e o exemplo que
            // reprova o piso de 12 e justifica o de 16.
            assertThat(PersonNameMatcher.normalize("Maria SANTOS")).hasSize(12);
            assertThat(PersonNameMatcher.isTruncatedPrefix("Maria SANTOS", "Maria SANTOS DA SILVA"))
                    .as("nome generico e curto nao pode virar prefixo de meio mundo")
                    .isFalse();

            assertThat(PersonNameMatcher.normalize("Ana CAROLINA")).hasSize(12);
            assertThat(PersonNameMatcher.isTruncatedPrefix("Ana CAROLINA", "Ana CAROLINA MAGBO"))
                    .isFalse();
        }

        @Test
        @DisplayName("exatamente no piso (16) PASSA — a porta e >=, nao >")
        void exatamenteNoPiso() {
            String recebido = "Ana Carolina MAG";
            assertThat(PersonNameMatcher.normalize(recebido))
                    .hasSize(PersonNameMatcher.MIN_PREFIXO_NORMALIZADO);
            assertThat(PersonNameMatcher.isTruncatedPrefix(recebido, "Ana Carolina MAGBO")).isTrue();
        }

        @Test
        @DisplayName("★ o piso nunca barra uma truncagem real (32 crus -> bem acima de 16)")
        void pisoNaoBarraTruncagemReal() {
            // Ate o pior caso realista — nome de 32 crus cheio de abreviacoes,
            // que perde quatro tokens de uma letra na normalizacao — aterrissa
            // acima do piso. E o que garante ausencia de falso-negativo.
            String piorCaso = "Maria A. B. C. DOS SANTOS SILVAX";
            assertThat(piorCaso).hasSize(32);
            assertThat(PersonNameMatcher.normalize(piorCaso).length())
                    .isGreaterThan(PersonNameMatcher.MIN_PREFIXO_NORMALIZADO);
        }

        @Test
        @DisplayName("★ nome IGUAL nao e prefixo — os dois predicados sao disjuntos")
        void igualNaoEhPrefixo() {
            // Manter matches e isTruncatedPrefix sem sobreposicao e o que impede
            // alguem de trocar um pelo outro e, de quebra, impor o piso de 16 a
            // um casamento exato — que nao precisa dele.
            assertThat(PersonNameMatcher.isTruncatedPrefix(LUIS_CADASTRO, LUIS_CADASTRO)).isFalse();
            assertThat(PersonNameMatcher.isTruncatedPrefix("Sammy MAGBO", "Sammy K. MAGBO"))
                    .as("normalizam para a mesma coisa: caso de matches, nao de prefixo")
                    .isFalse();
        }

        @Test
        @DisplayName("nome ausente ou ilegivel nunca vira prefixo")
        void ausenteNaoEhPrefixo() {
            assertThat(PersonNameMatcher.isTruncatedPrefix(null, LUIS_CADASTRO)).isFalse();
            assertThat(PersonNameMatcher.isTruncatedPrefix(LUIS_CAMERA, null)).isFalse();
            assertThat(PersonNameMatcher.isTruncatedPrefix("A. B. C.", LUIS_CADASTRO)).isFalse();
        }

        @Test
        @DisplayName("acento e caixa continuam valendo dentro do prefixo")
        void normalizacaoValeNoPrefixo() {
            assertThat(PersonNameMatcher.isTruncatedPrefix(
                    "AURELIE GONCALVES DE OL", "Aurélie Gonçalves de Oliveira")).isTrue();
        }
    }

    @Nested
    @DisplayName("★ acento transliterado pela camera (producao, 11/08/2026)")
    class AcentoTransliterado {

        /**
         * Os quinze casos REAIS. A camera manda o acento como caractere ASCII
         * solto ANTES da letra: 57 pessoas reconhecidas nao casavam com o
         * cadastro por isto.
         *
         * @return {nome como a camera manda, nome como o cadastro tem}
         */
        static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments> casosReais() {
            return java.util.stream.Stream.of(
                    // agudo
                    org.junit.jupiter.params.provider.Arguments.of("S'A", "SÁ"),
                    org.junit.jupiter.params.provider.Arguments.of("LABB'E", "LABBÉ"),
                    org.junit.jupiter.params.provider.Arguments.of("ARA'UJO", "ARAÚJO"),
                    // til
                    org.junit.jupiter.params.provider.Arguments.of("BRAND~AO", "BRANDÃO"),
                    org.junit.jupiter.params.provider.Arguments.of("Jo~ao", "João"),
                    org.junit.jupiter.params.provider.Arguments.of("ANCI~AES", "ANCIÃES"),
                    // circunflexo
                    org.junit.jupiter.params.provider.Arguments.of("C^ORTE", "CÔRTE"),
                    org.junit.jupiter.params.provider.Arguments.of("L^OBO", "LÔBO"),
                    org.junit.jupiter.params.provider.Arguments.of("DUP^AQUIER", "DUPÂQUIER"),
                    // grave
                    org.junit.jupiter.params.provider.Arguments.of("CHAUVI`ERE", "CHAUVIÈRE"),
                    org.junit.jupiter.params.provider.Arguments.of("CARRI`ERES", "CARRIÈRES"),
                    // trema
                    org.junit.jupiter.params.provider.Arguments.of("Isma\"el", "Ismaël"),
                    org.junit.jupiter.params.provider.Arguments.of("ISA\"IA", "ISAÏA"),
                    org.junit.jupiter.params.provider.Arguments.of("Chlo\"e", "Chloë"));
        }

        @org.junit.jupiter.params.ParameterizedTest(name = "★ camera ''{0}'' casa com cadastro ''{1}''")
        @org.junit.jupiter.params.provider.MethodSource("casosReais")
        void casoRealCasa(String daCamera, String doCadastro) {
            assertThat(PersonNameMatcher.matchesRecebido(daCamera, doCadastro))
                    .as("%s foi lido pela camera e existe no cadastro como %s", daCamera, doCadastro)
                    .isTrue();
        }

        @org.junit.jupiter.params.ParameterizedTest(name = "antes da correcao ''{0}'' NAO casava")
        @org.junit.jupiter.params.provider.MethodSource("casosReais")
        void casoRealNaoCasavaAntes(String daCamera, String doCadastro) {
            // O defeito congelado. matches e a comparacao literal, sem
            // decodificacao — e o que rodava em producao ate 11/08/2026.
            // Se um dia isto passar a ser true, a decodificacao vazou para o
            // caminho simetrico e o cadastro tambem esta sendo decodificado.
            assertThat(PersonNameMatcher.matches(daCamera, doCadastro))
                    .as("a leitura literal continua nao casando — e por isso que a segunda leitura existe")
                    .isFalse();
        }

        @Test
        @DisplayName("★ o dano nao era so separar: a letra sozinha SUMIA")
        void oDanoRealDaSeparacao() {
            // Com o acento na PRIMEIRA silaba o marcador parte o nome e deixa
            // uma letra solta, que a regra 5 (inicial abreviada) entao apaga.
            // Por isso "C^ORTE" nao virava "c orte" no fim: virava "orte".
            assertThat(PersonNameMatcher.normalize("C^ORTE")).isEqualTo("orte");
            assertThat(PersonNameMatcher.normalize("L^OBO")).isEqualTo("obo");
            assertThat(PersonNameMatcher.normalize("S'A")).isNull();

            assertThat(PersonNameMatcher.normalizeRecebido("C^ORTE")).contains("corte");
            assertThat(PersonNameMatcher.normalizeRecebido("S'A")).containsExactly("sa");
        }

        @Test
        @DisplayName("★ a letra vem em QUALQUER caixa — tres dos quinze sao minusculas")
        void marcadorAntesDeMinuscula() {
            // Medido: "Jo~ao", "Isma\"el" e "Chlo\"e". Uma regra restrita a
            // maiuscula deixaria estes tres exatamente como estavam.
            assertThat(PersonNameMatcher.decodificarAcentoTransliterado("Jo~ao")).isEqualTo("Joao");
            assertThat(PersonNameMatcher.decodificarAcentoTransliterado("Isma\"el")).isEqualTo("Ismael");
            assertThat(PersonNameMatcher.decodificarAcentoTransliterado("Chlo\"e")).isEqualTo("Chloe");
        }

        @Test
        @DisplayName("os cinco marcadores, e so eles")
        void cincoMarcadores() {
            assertThat(PersonNameMatcher.decodificarAcentoTransliterado("a'b~c^d`e\"f"))
                    .isEqualTo("abcdef");
            // Hifen e ponto continuam sendo pontuacao comum: quem os trata e o
            // normalize, e "Jean-Pierre" nao pode virar "JeanPierre" aqui.
            assertThat(PersonNameMatcher.decodificarAcentoTransliterado("Jean-Pierre M."))
                    .isEqualTo("Jean-Pierre M.");
        }

        @Test
        @DisplayName("nome sem marcador tem UMA leitura so")
        void semMarcadorUmaLeitura() {
            assertThat(PersonNameMatcher.normalizeRecebido("Marie Dupont"))
                    .containsExactly("marie dupont");
        }

        @Test
        @DisplayName("nome ilegivel devolve lista VAZIA, nunca null nem elemento null")
        void ilegivelListaVazia() {
            assertThat(PersonNameMatcher.normalizeRecebido(null)).isEmpty();
            assertThat(PersonNameMatcher.normalizeRecebido("A. B. C.")).isEmpty();
            assertThat(PersonNameMatcher.normalizeRecebido("...")).isEmpty();
            assertThat(PersonNameMatcher.matchesRecebido(null, "Ana Silva")).isFalse();
            assertThat(PersonNameMatcher.matchesRecebido("Ana Silva", null)).isFalse();
        }

        @Test
        @DisplayName("a decodificacao tambem alcanca o nome TRUNCADO em 32")
        void transliteradoETruncadoJuntos() {
            // Os dois defeitos do aparelho no mesmo nome: acento transliterado
            // E corte em 32 caracteres. Um nao pode anular o outro.
            String daCamera = "Jo~ao Fernando FIGUEIREDO DOS S";
            assertThat(PersonNameMatcher.normalizeRecebido(daCamera))
                    .anyMatch(leitura -> PersonNameMatcher.isTruncatedPrefixNormalizado(
                            leitura, PersonNameMatcher.normalize("João Fernando FIGUEIREDO DOS SANTOS")));
        }
    }

    @Nested
    @DisplayName("★ apostrofo LEGITIMO nao pode ser corrompido")
    class ApostrofoLegitimo {

        @Test
        @DisplayName("★ cadastro D'ÁVILA e recebido D'AVILA continuam casando")
        void davila() {
            // ⚠️ ESTE E O TESTE QUE PROIBE A SOLUCAO INGENUA. Se a
            // decodificacao SUBSTITUISSE a leitura literal em vez de somar-se a
            // ela, "D'AVILA" viraria "davila" e deixaria de casar com o
            // cadastro "D'ÁVILA", que normaliza para "avila" (o "D" solto cai
            // pela regra 5). Este par era um dos DOIS que ja funcionavam antes
            // da correcao — quebra-lo seria trocar um defeito por outro.
            assertThat(PersonNameMatcher.matchesRecebido("D'AVILA", "D'ÁVILA")).isTrue();
            assertThat(PersonNameMatcher.matchesRecebido("Ana D'AVILA", "Ana D'ÁVILA")).isTrue();
        }

        @Test
        @DisplayName("★ O'BRIEN continua casando consigo mesmo")
        void obrien() {
            assertThat(PersonNameMatcher.matchesRecebido("O'BRIEN", "O'BRIEN")).isTrue();
            assertThat(PersonNameMatcher.matchesRecebido("Sean O'BRIEN", "Sean O'BRIEN")).isTrue();
        }

        @Test
        @DisplayName("★ as DUAS leituras do apostrofo sao oferecidas — o sistema nao escolhe")
        void duasLeiturasDoApostrofo() {
            // "S'A" e SÁ e "D'AVILA" e D'ÁVILA: os mesmos tres caracteres
            // (letra, apostrofo, maiuscula) com dois sentidos. Nao ha regra de
            // posicao que os separe, entao ambas as leituras ficam disponiveis
            // e quem arbitra e a exigencia de casamento UNICO no chamador.
            assertThat(PersonNameMatcher.normalizeRecebido("D'AVILA"))
                    .containsExactly("avila", "davila");
        }

        @Test
        @DisplayName("★★ o CADASTRO nunca e decodificado — e este teste quebra se alguem decodificar")
        void cadastroNuncaEDecodificado() {
            // ⚠️ GUARDA CONTRA A "SIMPLIFICACAO" DE APLICAR A DECODIFICACAO NOS
            // DOIS LADOS. O texto da camera e ambiguo (o aparelho jogou fora a
            // letra acentuada); o do cadastro esta certo, com o apostrofo E o
            // acento cada um como ele mesmo. Igualar os dois lados nao empata:
            // troca um defeito por outro, e o novo atinge a familia D'/O'/N'/L'
            // que esta correcao existe para nao quebrar.
            assertThat(PersonNameMatcher.normalize("D'ÁVILA"))
                    .as("o apostrofo do cadastro SEPARA — e o 'D' solto cai pela regra 5")
                    .isEqualTo("avila");

            // O par que morre se o cadastro passar a ser decodificado:
            // "N'Diaye" viraria "ndiaye" e nao casaria mais com a grafia
            // separada que a biblioteca facial costuma trazer.
            assertThat(PersonNameMatcher.normalize("N'Diaye Fatou")).isEqualTo("diaye fatou");
            assertThat(PersonNameMatcher.matchesRecebido("N Diaye Fatou", "N'Diaye Fatou"))
                    .as("decodificar o cadastro faria este casamento REAL desaparecer")
                    .isTrue();

            assertThat(PersonNameMatcher.matchesRecebido("DAVILA", "D'ÁVILA"))
                    .as("o cadastro continua valendo pela leitura literal dele")
                    .isFalse();
        }

        @Test
        @DisplayName("★ nenhum casamento que funcionava antes deixou de funcionar")
        void estritamenteAditivo() {
            // A leitura literal continua na lista, entao matchesRecebido e um
            // superconjunto de matches. Se algum dia isto falhar, a
            // decodificacao passou a substituir em vez de somar.
            String[][] jaFuncionavam = {
                    {"Sammy MAGBO", "Sammy K. MAGBO"},
                    {"Aurelie Goncalves", "Aurélie Gonçalves"},
                    {"Jean-Pierre Martin", "Jean Pierre Martin"},
                    {"N'Diaye Fatou", "N Diaye Fatou"},
                    {"MARIE DUPONT", "marie dupont"},
                    {"D'AVILA", "D'ÁVILA"},
                    {"O'BRIEN", "O'BRIEN"}};
            for (String[] par : jaFuncionavam) {
                assertThat(PersonNameMatcher.matches(par[0], par[1])).isTrue();
                assertThat(PersonNameMatcher.matchesRecebido(par[0], par[1]))
                        .as("'%s' x '%s' casava antes e tem de continuar casando", par[0], par[1])
                        .isTrue();
            }
        }

        @Test
        @DisplayName("★ pessoas diferentes continuam diferentes")
        void naoAfrouxou() {
            assertThat(PersonNameMatcher.matchesRecebido("Ana Silva", "Ana Souza")).isFalse();
            assertThat(PersonNameMatcher.matchesRecebido("Marie Dupont", "Marie Dupond")).isFalse();
            assertThat(PersonNameMatcher.matchesRecebido("Ana Silva", "Ana Beatriz Silva")).isFalse();
            // O marcador nao pode fabricar casamento entre nomes distintos.
            assertThat(PersonNameMatcher.matchesRecebido("BRAND~AO", "BRANDAA")).isFalse();
            assertThat(PersonNameMatcher.matchesRecebido("S'A", "SE")).isFalse();
        }
    }

    @Nested
    @DisplayName("robustez")
    class Robustez {

        @Test
        @DisplayName("null nao estoura")
        void nulo() {
            assertThat(PersonNameMatcher.normalize(null)).isNull();
        }

        @Test
        @DisplayName("nome casa consigo mesmo")
        void reflexivo() {
            assertThat(PersonNameMatcher.matches("Aurélie Gonçalves", "Aurélie Gonçalves")).isTrue();
        }

        @Test
        @DisplayName("a ordem dos argumentos nao muda o resultado")
        void simetrico() {
            assertThat(PersonNameMatcher.matches("Sammy MAGBO", "Sammy K. MAGBO"))
                    .isEqualTo(PersonNameMatcher.matches("Sammy K. MAGBO", "Sammy MAGBO"));
        }
    }
}
