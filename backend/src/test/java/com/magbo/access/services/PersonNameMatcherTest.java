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
