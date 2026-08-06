package com.magbo.access.services;

import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * BUSCA DE ALUNO PARA A AUTORIZACAO DE SAIDA.
 *
 * A tela existia com um campo de MATRICULA em branco. A Vie Scolaire conhece os
 * alunos pelo nome, nao pelo numero, e um digito trocado criava em silencio uma
 * autorizacao para a crianca errada — ou para ninguem. O que se testa aqui e a
 * busca conseguir ACHAR: quem nao acha digita a matricula de cabeca de novo, e
 * volta-se ao mesmo defeito.
 *
 * O acento e o caso central, nao a excecao: e uma escola francesa, e o teclado
 * do posto nem sempre tem os mortos. Quem digita "Goncalves" TEM de encontrar
 * "Gonçalves".
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class StudentSearchServiceTest {

    @Mock
    private UserRepository userRepository;

    private StudentSearchService service() {
        return new StudentSearchService(userRepository);
    }

    private static User aluno(String id, String nome, String turma) {
        return User.builder().id(id).nome(nome).turma(turma)
                .tipo(UserType.ALUNO).ativo(true).build();
    }

    private static User servidor(String id, String nome) {
        return User.builder().id(id).nome(nome)
                .tipo(UserType.FUNCIONARIO).ativo(true).build();
    }

    /** Nomes reais em forma: acento, cedilha, sobrenome composto. */
    private final List<User> BASE = List.of(
            aluno("0001764", "Aurélie Gonçalves", "2A"),
            aluno("0004486", "Marie Dupont", "2B"),
            aluno("0007777", "Jean-Pierre de la Fontaine", "1E1"),
            aluno("0009999", "Ana Souza", "2A"),
            servidor("FUNC-007", "Aurélie Martin")
    );

    private List<String> ids(List<User> us) {
        return us.stream().map(User::getId).toList();
    }

    // ───────────────────── Por nome ─────────────────────

    @Nested
    @DisplayName("busca por nome")
    class PorNome {

        @Test
        @DisplayName("★ fragmento do nome basta — ninguém digita o nome inteiro")
        void fragmento() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("dupont", 20))).containsExactly("0004486");
        }

        @Test
        @DisplayName("fragmento do MEIO do nome também casa")
        void fragmentoDoMeio() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("la fontaine", 20))).containsExactly("0007777");
        }

        @Test
        @DisplayName("★ SEM acento encontra COM acento — Goncalves acha Gonçalves")
        void semAcentoAchaComAcento() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("goncalves", 20))).containsExactly("0001764");
        }

        @Test
        @DisplayName("★ COM acento também encontra (quem tem teclado francês)")
        void comAcentoTambemAcha() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("Gonçalves", 20))).containsExactly("0001764");
        }

        @Test
        @DisplayName("★ acento no PRIMEIRO nome: aurelie acha Aurélie")
        void acentoNoPrimeiroNome() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("aurelie", 20))).containsExactly("0001764");
        }

        @Test
        @DisplayName("★ caixa não importa")
        void caixaNaoImporta() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("MARIE", 20)))
                    .isEqualTo(ids(service().buscar("marie", 20)))
                    .containsExactly("0004486");
        }

        @Test
        @DisplayName("espaço sobrando não impede o encontro")
        void espacoSobrando() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("  dupont  ", 20))).containsExactly("0004486");
        }
    }

    // ───────────────────── Por matrícula ─────────────────────

    @Nested
    @DisplayName("busca por matrícula")
    class PorMatricula {

        @Test
        @DisplayName("★ matrícula inteira, com os zeros à esquerda")
        void matriculaInteira() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("0001764", 20))).containsExactly("0001764");
        }

        @Test
        @DisplayName("★ pedaço da matrícula também casa — quem lembra só do fim")
        void pedacoDaMatricula() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("1764", 20))).containsExactly("0001764");
        }

        @Test
        @DisplayName("turma casa — dá para listar a 2A inteira")
        void porTurma() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(ids(service().buscar("2A", 20)))
                    .containsExactlyInAnyOrder("0001764", "0009999");
        }
    }

    // ───────────────────── Quem NÃO é selecionável ─────────────────────

    @Nested
    @DisplayName("★ só ALUNO é selecionável")
    class SoAluno {

        @Test
        @DisplayName("★ servidor NUNCA aparece, mesmo casando pelo nome")
        void servidorNaoAparece() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            // "Aurélie" casa com a aluna E com a funcionária.
            assertThat(ids(service().buscar("aurelie", 20)))
                    .as("o filtro é do SERVIDOR: uma tela que esqueça de filtrar não pode "
                            + "autorizar a saída de uma funcionária")
                    .containsExactly("0001764");
        }

        @Test
        @DisplayName("aluno inativo não aparece (findByAtivoTrue não o traz)")
        void inativoNaoAparece() {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(BASE.get(0)));
            assertThat(ids(service().buscar("marie", 20))).isEmpty();
        }
    }

    // ───────────────────── Limites e robustez ─────────────────────

    @Nested
    @DisplayName("limites e robustez")
    class Limites {

        @Test
        @DisplayName("★ menos de 2 caracteres devolve vazio — 1 letra casaria com meia escola")
        void buscaCurta() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(service().buscar("a", 20)).isEmpty();
            assertThat(service().buscar("", 20)).isEmpty();
            assertThat(service().buscar(null, 20)).isEmpty();
            assertThat(service().buscar("   ", 20)).isEmpty();
        }

        @Test
        @DisplayName("respeita o limite pedido")
        void respeitaLimite() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(service().buscar("2A", 1)).hasSize(1);
        }

        @Test
        @DisplayName("limite ausente ou absurdo cai no padrão / no teto")
        void limiteAbsurdo() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(service().buscar("0", null)).hasSizeLessThanOrEqualTo(StudentSearchService.LIMITE_PADRAO);
            assertThat(service().buscar("0", 9999)).hasSizeLessThanOrEqualTo(StudentSearchService.LIMITE_MAXIMO);
            assertThat(service().buscar("0", -5)).hasSizeLessThanOrEqualTo(StudentSearchService.LIMITE_PADRAO);
        }

        @Test
        @DisplayName("resultado sai em ordem de nome — lista estável para escolher")
        void ordemDeNome() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(service().buscar("0", 20))
                    .extracting(User::getNome)
                    .isSortedAccordingTo(java.util.Comparator.naturalOrder());
        }

        @Test
        @DisplayName("nada casa -> lista vazia, não erro")
        void nadaCasa() {
            when(userRepository.findByAtivoTrue()).thenReturn(BASE);
            assertThat(service().buscar("zzzz", 20)).isEmpty();
        }

        @Test
        @DisplayName("aluno com campos nulos não derruba a busca")
        void camposNulos() {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    User.builder().id("0001111").nome(null).turma(null)
                            .tipo(UserType.ALUNO).ativo(true).build()));
            assertThat(service().buscar("marie", 20)).isEmpty();
            assertThat(ids(service().buscar("1111", 20))).containsExactly("0001111");
        }
    }

    @Nested
    @DisplayName("normalizar")
    class Normalizar {

        @Test
        @DisplayName("tira acento, baixa a caixa, colapsa espaço")
        void normaliza() {
            assertThat(StudentSearchService.normalizar("  Aurélie   GONÇALVES ")).isEqualTo("aurelie goncalves");
        }

        @Test
        @DisplayName("vazio e nulo viram null")
        void vazio() {
            assertThat(StudentSearchService.normalizar(null)).isNull();
            assertThat(StudentSearchService.normalizar("   ")).isNull();
        }
    }
}
