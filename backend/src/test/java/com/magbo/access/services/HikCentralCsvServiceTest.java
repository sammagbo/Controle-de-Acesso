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
 * CONTEUDO DO CSV DE IMPORTACAO DO HIKCENTRAL (F7b).
 *
 * O que se testa aqui e o ARQUIVO, caractere a caractere, porque o destinatario
 * e um sistema de terceiros que nao valida nada: uma coluna trocada de nome ou
 * um zero comido nao dao erro, dao um cadastro errado que so aparece quando um
 * aluno e negado no terminal semanas depois.
 *
 * A regra de ouro do procedimento: `Person ID` = identificador como TEXTO, com
 * os zeros a esquerda preservados (docs/operacional/procedimento-hikcentral.md).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HikCentralCsvServiceTest {

    @Mock
    private UserRepository userRepository;

    private HikCentralCsvService service() {
        return new HikCentralCsvService(userRepository);
    }

    private static User aluno(String id, String nome, String hikId, boolean ativo) {
        return User.builder()
                .id(id).nome(nome).tipo(UserType.ALUNO)
                .hikvisionEmployeeId(hikId).ativo(ativo)
                .build();
    }

    private static User servidor(String id, String nome) {
        return User.builder()
                .id(id).nome(nome).tipo(UserType.FUNCIONARIO).ativo(true).build();
    }

    // ───────────────────── Zeros a esquerda ─────────────────────

    @Nested
    @DisplayName("zeros a esquerda — a regra critica do procedimento")
    class ZerosAEsquerda {

        @Test
        @DisplayName("★ matricula 0001764 sai INTEIRA e entre aspas")
        void matriculaComZerosSaiIntacta() {
            String csv = service().escrever(List.of(aluno("0001764", "Marie Dupont", null, true)));

            assertThat(csv).contains("\"0001764\"");
            assertThat(csv)
                    .as("nada de 1764 solto em lugar nenhum do arquivo")
                    .doesNotContain(";1764;")
                    .doesNotContain("\"1764\"");
        }

        @Test
        @DisplayName("★ TODO campo sai entre aspas, nao so os que 'precisam'")
        void todosOsCamposSaoCitados() {
            String csv = service().escrever(List.of(aluno("0004486", "Jean Martin", null, true)));
            String linha = csv.split("\r\n")[1];

            assertThat(linha).isEqualTo(
                    "\"0004486\";\"Jean\";\"Martin\";\"All Departments/ALUNOS\"");
        }

        @Test
        @DisplayName("id com muitos zeros nao perde nenhum")
        void muitosZeros() {
            assertThat(service().escrever(List.of(aluno("0000007", "Ana Silva", null, true))))
                    .contains("\"0000007\"");
        }
    }

    // ───────────────────── Qual identificador sai ─────────────────────

    @Nested
    @DisplayName("Person ID")
    class PersonId {

        @Test
        @DisplayName("★ sem face ligada -> sai a MATRICULA (e o que faz o evento casar depois)")
        void semFaceUsaMatricula() {
            assertThat(service().personId(aluno("0001764", "Marie Dupont", null, true)))
                    .isEqualTo("0001764");
        }

        @Test
        @DisplayName("★ com face ligada -> sai o identificador EXISTENTE, nunca a matricula")
        void comFaceUsaOIdentificadorExistente() {
            assertThat(service().personId(aluno("0001764", "Marie Dupont", "1234567890", true)))
                    .as("reimportar nao pode trocar a face de dono")
                    .isEqualTo("1234567890");
        }

        @Test
        @DisplayName("identificador em branco conta como ausente")
        void identificadorEmBrancoEhAusente() {
            assertThat(service().personId(aluno("0001764", "Marie Dupont", "   ", true)))
                    .isEqualTo("0001764");
        }
    }

    // ───────────────────── Nome ─────────────────────

    @Nested
    @DisplayName("quebra do nome em Prénom / Nom de famille")
    class QuebraDoNome {

        @Test
        @DisplayName("★ e o inverso exato do montarNome do import (ida e volta)")
        void idaEVolta() {
            HikCentralCsvService s = service();
            String nome = "Marie Dupont";

            String prenom = s.prenom(nome);
            String nom = s.nomDeFamille(nome);

            assertThat(prenom).isEqualTo("Marie");
            assertThat(nom).isEqualTo("Dupont");
            assertThat((prenom + " " + nom).trim())
                    .as("o que sai daqui volta identico pelo importador")
                    .isEqualTo(nome);
        }

        @Test
        @DisplayName("sobrenome composto fica inteiro no Nom de famille")
        void sobrenomeComposto() {
            HikCentralCsvService s = service();
            assertThat(s.prenom("Jean Pierre de la Fontaine")).isEqualTo("Jean");
            assertThat(s.nomDeFamille("Jean Pierre de la Fontaine")).isEqualTo("Pierre de la Fontaine");
        }

        @Test
        @DisplayName("nome de uma palavra so -> Nom de famille VAZIO, sem repetir o Prénom")
        void nomeDeUmaPalavra() {
            HikCentralCsvService s = service();
            assertThat(s.prenom("Ronaldo")).isEqualTo("Ronaldo");
            assertThat(s.nomDeFamille("Ronaldo")).isEmpty();
        }

        @Test
        @DisplayName("espacos sobrando nao viram campo vazio")
        void espacosSobrando() {
            HikCentralCsvService s = service();
            assertThat(s.prenom("  Marie   Dupont  ")).isEqualTo("Marie");
            assertThat(s.nomDeFamille("  Marie   Dupont  ")).isEqualTo("Dupont");
        }

        @Test
        @DisplayName("nome nulo ou vazio nao estoura")
        void nomeAusente() {
            HikCentralCsvService s = service();
            assertThat(s.prenom(null)).isEmpty();
            assertThat(s.nomDeFamille(null)).isEmpty();
            assertThat(s.prenom("   ")).isEmpty();
        }

        @Test
        @DisplayName("acento sobrevive")
        void acentoSobrevive() {
            assertThat(service().escrever(List.of(aluno("0001111", "Aurélie Gonçalves", null, true))))
                    .contains("\"Aurélie\";\"Gonçalves\"");
        }
    }

    // ───────────────────── Formato do arquivo ─────────────────────

    @Nested
    @DisplayName("formato do arquivo")
    class Formato {

        @Test
        @DisplayName("★ cabecalho com os MESMOS nomes que o importador le")
        void cabecalho() {
            assertThat(service().escrever(List.of()))
                    .isEqualTo("\"ID\";\"Prénom\";\"Nom de famille\";\"Service\"\r\n");
        }

        @Test
        @DisplayName("★ lista vazia devolve SO o cabecalho, nunca string vazia")
        void listaVaziaTemCabecalho() {
            String csv = service().escrever(List.of());
            assertThat(csv).isNotEmpty();
            assertThat(csv.split("\r\n")).hasSize(1);
        }

        @Test
        @DisplayName("null nao estoura")
        void listaNula() {
            assertThat(service().escrever(null)).startsWith("\"ID\"");
        }

        @Test
        @DisplayName("★ fim de linha CRLF (RFC 4180) — LF sozinho vira uma linha so no HCP")
        void crlf() {
            String csv = service().escrever(List.of(
                    aluno("0001111", "A B", null, true),
                    aluno("0002222", "C D", null, true)));

            assertThat(csv).contains("\r\n");
            assertThat(csv.split("\r\n")).hasSize(3);   // cabecalho + 2
        }

        @Test
        @DisplayName("★ SEM BOM — o destinatario e o HCP, nao o Excel")
        void semBom() {
            assertThat(service().escrever(List.of())).doesNotStartWith("﻿");
        }

        @Test
        @DisplayName("aspa dentro do nome vira aspa dupla (RFC 4180)")
        void aspaInterna() {
            assertThat(HikCentralCsvService.aspas("Jean \"Jojo\" Martin"))
                    .isEqualTo("\"Jean \"\"Jojo\"\" Martin\"");
        }

        @Test
        @DisplayName("ponto-e-virgula dentro do campo fica contido pelas aspas")
        void separadorInterno() {
            // O nome quebra no ESPACO, entao o ";" fica dentro do sobrenome —
            // e as aspas impedem que ele vire um separador de coluna.
            String csv = service().escrever(List.of(aluno("0001111", "Ana Silva;Souza", null, true)));

            assertThat(csv).contains("\"Silva;Souza\"");
            assertThat(csv.split("\r\n")[1])
                    .as("continua sendo UMA linha de 4 campos")
                    .isEqualTo("\"0001111\";\"Ana\";\"Silva;Souza\";\"All Departments/ALUNOS\"");
        }

        @Test
        @DisplayName("Service dos alunos e o que o importador devolve como ALUNO")
        void serviceDeAluno() {
            assertThat(service().escrever(List.of(aluno("0001111", "A B", null, true))))
                    .contains("\"All Departments/ALUNOS\"");
        }
    }

    // ───────────────────── Selecao ─────────────────────

    @Nested
    @DisplayName("quem entra no arquivo")
    class Selecao {

        private final List<User> base = List.of(
                aluno("0003333", "Carla Rocha", null, true),         // sem face, ativo
                aluno("0001111", "Ana Souza", null, true),           // sem face, ativo
                aluno("0002222", "Bruno Lima", "1234567890", true),  // JA tem face
                aluno("0004444", "Davi Alves", null, false),         // INATIVO
                servidor("FUNC-001", "Eva Nunes")                    // nao e aluno
        );

        @Test
        @DisplayName("★ MISSING_FACE: so aluno ativo SEM identificador")
        void missingFace() {
            when(userRepository.findAll()).thenReturn(base);

            assertThat(service().selecionar(HikCentralCsvService.Scope.MISSING_FACE))
                    .extracting(User::getId)
                    .containsExactly("0001111", "0003333");
        }

        @Test
        @DisplayName("ALL: todo aluno ativo, com face ou sem")
        void todos() {
            when(userRepository.findAll()).thenReturn(base);

            assertThat(service().selecionar(HikCentralCsvService.Scope.ALL))
                    .extracting(User::getId)
                    .containsExactly("0001111", "0002222", "0003333");
        }

        @Test
        @DisplayName("★ servidor NUNCA entra — o cadastro deles nao vem daqui")
        void servidorFicaDeFora() {
            when(userRepository.findAll()).thenReturn(base);

            assertThat(service().selecionar(HikCentralCsvService.Scope.ALL))
                    .extracting(User::getId)
                    .doesNotContain("FUNC-001");
        }

        @Test
        @DisplayName("aluno inativo fica de fora dos dois escopos")
        void inativoFicaDeFora() {
            when(userRepository.findAll()).thenReturn(base);

            assertThat(service().selecionar(HikCentralCsvService.Scope.ALL))
                    .extracting(User::getId).doesNotContain("0004444");
            assertThat(service().selecionar(HikCentralCsvService.Scope.MISSING_FACE))
                    .extracting(User::getId).doesNotContain("0004444");
        }

        @Test
        @DisplayName("★ ordem estavel por matricula — dois exports iguais dao arquivos iguais")
        void ordemEstavel() {
            when(userRepository.findAll()).thenReturn(base);
            HikCentralCsvService s = service();

            assertThat(s.gerar(HikCentralCsvService.Scope.ALL))
                    .isEqualTo(s.gerar(HikCentralCsvService.Scope.ALL));
        }

        @Test
        @DisplayName("ninguem pendente -> arquivo com cabecalho e nada mais")
        void ninguemPendente() {
            when(userRepository.findAll()).thenReturn(List.of(
                    aluno("0002222", "Bruno Lima", "1234567890", true)));

            assertThat(service().gerar(HikCentralCsvService.Scope.MISSING_FACE).split("\r\n"))
                    .hasSize(1);
        }
    }
}
