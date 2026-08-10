package com.magbo.access.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.magbo.access.TestFixtures;
import com.magbo.access.dto.hikvision.CameraAlarmDto;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * IDENTIDADE A PARTIR DO ROSTO — a decisao mais perigosa do sistema.
 *
 * Numa portaria, atribuir a passagem a pessoa errada nao e um numero errado num
 * relatorio: e liberar a saida de uma crianca no nome de outra. Por isso a
 * regra e conservadora e estes testes cobrem sobretudo os casos em que o
 * sistema TEM de recusar.
 *
 * Os payloads vem dos fixtures de src/test/resources/payloads/ — os mesmos que
 * o IT usa —, entao unidade e integracao falam do mesmo arquivo.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CameraIdentityServiceTest {

    @Mock
    private UserRepository userRepository;

    private CameraIdentityService service;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new CameraIdentityService(userRepository);
        ReflectionTestUtils.setField(service, "limiarPadrao", 0.70);
    }

    private CameraAlarmDto dto(String json) throws Exception {
        return mapper.readValue(json, CameraAlarmDto.class);
    }

    private CameraAlarmDto sucesso() throws Exception {
        return dto(TestFixtures.payload("camera-alarm-success.txt"));
    }

    private static User pessoa(String id, String nome, String cameraPersonId) {
        return User.builder().id(id).nome(nome).tipo(UserType.FUNCIONARIO)
                .ativo(true).cameraPersonId(cameraPersonId).build();
    }

    // ───────────────── Caminho determinístico ─────────────────

    @Nested
    @DisplayName("★ 1. numero do documento ja guardado")
    class PorDocumento {

        @Test
        @DisplayName("★ casa pelo camera_person_id, sem olhar o nome")
        void casaPeloDocumento() throws Exception {
            User sam = pessoa("FUNC-001", "Qualquer Nome Diferente", "0000000000009001");
            when(userRepository.findByCameraPersonId("0000000000009001")).thenReturn(Optional.of(sam));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user()).isSameAs(sam);
            // Determinístico: nem chegou a varrer o cadastro por nome.
            verify(userRepository, never()).findByAtivoTrue();
        }

        @Test
        @DisplayName("documento desconhecido cai para o casamento por nome")
        void documentoDesconhecidoCaiParaNome() throws Exception {
            when(userRepository.findByCameraPersonId("0000000000009001")).thenReturn(Optional.empty());
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId()).isEqualTo("FUNC-001");
        }
    }

    // ───────────────── Identificador como matrícula ─────────────────

    @Nested
    @DisplayName("★ 1b. o certificateNumber COMO matricula / employeeNo")
    class PorIdentificador {

        /**
         * O caso de producao: desde 08/08/2026 as bibliotecas faciais foram
         * repovoadas pelo modulo de pessoas do HCP, e o certificateNumber que a
         * camera devolve E a matricula do aluno — com zeros ate 16 digitos.
         */
        private CameraAlarmDto comDocumento(String numero) throws Exception {
            return dto(TestFixtures.comCertificateNumber(
                    TestFixtures.payload("camera-alarm-success.txt"), numero));
        }

        private User aluno(String matricula, String nome, String hikvisionId) {
            return User.builder().id(matricula).nome(nome).tipo(UserType.ALUNO)
                    .ativo(true).hikvisionEmployeeId(hikvisionId).build();
        }

        @Test
        @DisplayName("★ matricula com zeros ate 16 digitos casa com app_users.id")
        void matriculaPreenchidaComZeros() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    aluno("0003535", "Nome Que Nao Casa", null)));

            var id = service.resolver(comDocumento("0000000000003535"));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId())
                    .as("os DOIS lados normalizados: '0000000000003535' e '0003535' sao o mesmo aluno")
                    .isEqualTo("0003535");
        }

        @Test
        @DisplayName("matricula SEM zeros tambem casa")
        void matriculaSemZeros() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    aluno("0003535", "Nome Que Nao Casa", null)));

            var id = service.resolver(comDocumento("3535"));

            assertThat(id.user().getId()).isEqualTo("0003535");
        }

        /** Os cadastros antigos do HCP: id de 10 digitos em hikvision_employee_id. */
        @Test
        @DisplayName("★ id de 10 digitos do HCP continua casando por hikvision_employee_id")
        void legadoDezDigitos() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    aluno("0004486", "Nome Que Nao Casa", "5629236986")));

            var id = service.resolver(comDocumento("5629236986"));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId()).isEqualTo("0004486");
        }

        @Test
        @DisplayName("numero que nao e de ninguem cai para o casamento por NOME")
        void numeroSemDonoCaiParaNome() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            var id = service.resolver(comDocumento("0000000000999999"));

            assertThat(id.resultado())
                    .as("o passo novo nao pode BLOQUEAR o caminho antigo quando nao acha ninguem")
                    .isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId()).isEqualTo("FUNC-001");
        }

        /**
         * ★ O DESEMPATE. O identificador foi digitado uma vez, no modulo de
         * pessoas do HCP, e aponta para UMA linha; o nome chega normalizado, as
         * vezes truncado em 32 caracteres, e casa por semelhanca. Quando os
         * dois discordam, a passagem e de quem o NUMERO diz — atribui-la ao
         * homonimo por causa de um campo de texto e, numa portaria, liberar a
         * saida de uma crianca no nome de outra.
         */
        @Test
        @DisplayName("★ numero aponta para A e o NOME para B -> vence o identificador")
        void identificadorVenceONome() throws Exception {
            User pelaMatricula = aluno("0003535", "Outra Pessoa Completamente", null);
            User peloNome = pessoa("FUNC-001", "Sammy K. MAGBO", null);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(pelaMatricula, peloNome));

            // O fixture traz o nome "Sammy MAGBO", que casaria com FUNC-001.
            var id = service.resolver(comDocumento("0000000000003535"));

            assertThat(id.user().getId())
                    .as("identificador e evidencia mais forte que nome")
                    .isEqualTo("0003535");
        }

        @Test
        @DisplayName("o certificateNumber e GRAVADO — a proxima passagem cai no passo 1")
        void gravaODocumento() throws Exception {
            User alvo = aluno("0003535", "Nome Que Nao Casa", null);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(alvo));

            service.resolver(comDocumento("0000000000003535"));

            ArgumentCaptor<User> salvo = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(salvo.capture());
            assertThat(salvo.getValue().getCameraPersonId())
                    .as("guarda o numero COMO VEIO, com os zeros — e o que a camera manda de novo")
                    .isEqualTo("0000000000003535");
        }

        @Test
        @DisplayName("dois cadastros com o mesmo numero normalizado -> NAO identifica por ele")
        void numeroDuplicadoNaoIdentifica() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    aluno("0003535", "Aluno Um", null),
                    aluno("3535", "Aluno Dois", null)));

            var id = service.resolver(comDocumento("0000000000003535"));

            assertThat(id.resultado())
                    .as("escolher um dos dois seria o sistema decidindo de quem e a passagem")
                    .isNotEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
        }
    }

    @Nested
    @DisplayName("normalizacao de zeros a esquerda")
    class Normalizacao {

        @Test
        @DisplayName("os tres formatos da mesma matricula colapsam no mesmo valor")
        void colapsam() {
            assertThat(CameraIdentityService.semZerosAEsquerda("0000000000003535")).isEqualTo("3535");
            assertThat(CameraIdentityService.semZerosAEsquerda("0003535")).isEqualTo("3535");
            assertThat(CameraIdentityService.semZerosAEsquerda("3535")).isEqualTo("3535");
        }

        @Test
        @DisplayName("nao numerico volta inteiro — FUNC-036 continua comparavel consigo mesmo")
        void naoNumerico() {
            assertThat(CameraIdentityService.semZerosAEsquerda("FUNC-036")).isEqualTo("FUNC-036");
            assertThat(CameraIdentityService.semZerosAEsquerda(" func-036 ")).isEqualTo("FUNC-036");
        }

        @Test
        @DisplayName("so zeros vira '0', nao vazio — vazio casaria com qualquer coisa")
        void soZeros() {
            assertThat(CameraIdentityService.semZerosAEsquerda("0000")).isEqualTo("0");
        }

        @Test
        @DisplayName("nulo e vazio devolvem null")
        void nuloEVazio() {
            assertThat(CameraIdentityService.semZerosAEsquerda(null)).isNull();
            assertThat(CameraIdentityService.semZerosAEsquerda("   ")).isNull();
        }
    }

    // ───────────────── Casamento por nome ─────────────────

    @Nested
    @DisplayName("★ 2. nome, e so quando e UNICO")
    class PorNome {

        @Test
        @DisplayName("★ 'Sammy MAGBO' da camera casa com 'Sammy K. MAGBO' do cadastro")
        void casaComInicialAbreviada() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null),
                    pessoa("FUNC-002", "Outra Pessoa", null)));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId()).isEqualTo("FUNC-001");
        }

        @Test
        @DisplayName("★ no casamento unico o documento e GRAVADO na pessoa")
        void gravaODocumento() throws Exception {
            User sam = pessoa("FUNC-001", "Sammy K. MAGBO", null);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(sam));

            service.resolver(sucesso());

            ArgumentCaptor<User> capturado = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(capturado.capture());
            assertThat(capturado.getValue().getCameraPersonId())
                    .as("da proxima passagem em diante a identificacao e deterministica")
                    .isEqualTo("0000000000009001");
        }

        @Test
        @DisplayName("★ DOIS homonimos -> AMBIGUO, e nada e gravado")
        void doisHomonimos() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null),
                    pessoa("ALU-0001", "Sammy MAGBO", null)));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.AMBIGUO);
            assertThat(id.user()).isNull();
            assertThat(id.motivoDeNegacao()).isEqualTo(DenialReason.AMBIGUOUS_NAME);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("★ nome fora do cadastro -> DESCONHECIDO, e o nome viaja para o log")
        void nomeForaDoCadastro() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-002", "Outra Pessoa", null)));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
            assertThat(id.motivoDeNegacao()).isEqualTo(DenialReason.UNKNOWN_FACE);
            assertThat(id.nome()).isEqualTo("Sammy MAGBO");
            assertThat(id.biblioteca()).isEqualTo("FUNCIONARIOS");
        }

        @Test
        @DisplayName("★ pessoa INATIVA nao entra no casamento (findByAtivoTrue)")
        void inativoNaoCasa() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of());

            assertThat(service.resolver(sucesso()).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
        }

        @Test
        @DisplayName("★ documento diferente ja gravado NAO e sobrescrito")
        void naoSobrescreveDocumento() throws Exception {
            User sam = pessoa("FUNC-001", "Sammy K. MAGBO", "CAM-OUTRO");
            when(userRepository.findByCameraPersonId("0000000000009001")).thenReturn(Optional.empty());
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(sam));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(sam.getCameraPersonId())
                    .as("repontar a identificacao em silencio e caso para olho humano")
                    .isEqualTo("CAM-OUTRO");
            verify(userRepository, never()).save(any());
        }
    }

    // ───────────────── Porta de similaridade ─────────────────

    @Nested
    @DisplayName("★ porta de similaridade")
    class Similaridade {

        @Test
        @DisplayName("★ abaixo do limiar da biblioteca -> tratado como NAO reconhecido")
        void abaixoDoLimiar() throws Exception {
            String json = TestFixtures.comSimilaridade(
                    TestFixtures.payload("camera-alarm-success.txt"), 0.55);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            var id = service.resolver(dto(json));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
            assertThat(id.motivoDeNegacao()).isEqualTo(DenialReason.UNKNOWN_FACE);
            // Nem chegou a consultar o cadastro: "achou parecido" nao e "achou".
            verify(userRepository, never()).findByCameraPersonId(any());
        }

        @Test
        @DisplayName("exatamente no limiar PASSA (>=, nao >)")
        void exatamenteNoLimiar() throws Exception {
            String json = TestFixtures.comSimilaridade(
                    TestFixtures.payload("camera-alarm-success.txt"), 0.70);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            assertThat(service.resolver(dto(json)).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
        }

        @Test
        @DisplayName("★ o limiar DA CAMERA tem precedencia sobre a property")
        void limiarDaCameraVence() throws Exception {
            // Biblioteca exigente (98%): o 0.95 do payload real passaria pela
            // property (0.70) mas nao pelo rigor que quem configurou a lista
            // escolheu.
            String json = TestFixtures.comLimiarDaBiblioteca(
                    TestFixtures.payload("camera-alarm-success.txt"), 98);

            assertThat(service.resolver(dto(json)).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
        }

        @Test
        @DisplayName("★ escalas misturadas: 0.95 contra FDLibThreshold=70 e RECONHECIMENTO")
        void escalasMisturadas() throws Exception {
            // Escalas confirmadas na captura de 07/08: o payload traz fracao
            // (similarity 0.95) e percentual (FDLibThreshold 70). Comparar cru
            // daria 0.95 < 70 e reprovaria
            // TODO reconhecimento bom — em silencio, parecendo defeito de camera.
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.similaridade()).isEqualTo(0.95);
        }

        @Test
        @DisplayName("normalizacao: percentual vira fracao, fracao fica")
        void normalizacao() {
            assertThat(CameraIdentityService.normalizarSimilaridade(70.0)).isEqualTo(0.70);
            assertThat(CameraIdentityService.normalizarSimilaridade(0.95)).isEqualTo(0.95);
            assertThat(CameraIdentityService.normalizarSimilaridade(1.0)).isEqualTo(1.0);
            assertThat(CameraIdentityService.normalizarSimilaridade(null)).isNull();
            assertThat(CameraIdentityService.normalizarSimilaridade(-1.0)).isNull();
            assertThat(CameraIdentityService.normalizarSimilaridade(Double.NaN)).isNull();
        }
    }

    // ───────────────── Comparação falhada ─────────────────

    @Nested
    @DisplayName("★ 3. comparacao falhada")
    class ComparacaoFalhada {

        @Test
        @DisplayName("★ contrastFailed -> DESCONHECIDO, sem nome e sem consultar cadastro")
        void contrastFailed() throws Exception {
            var id = service.resolver(dto(TestFixtures.payload("camera-alarm-contrast-failed.txt")));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
            assertThat(id.motivoDeNegacao()).isEqualTo(DenialReason.UNKNOWN_FACE);
            assertThat(id.nome()).isNull();
            assertThat(id.user()).isNull();
            verify(userRepository, never()).findByAtivoTrue();
        }

        @Test
        @DisplayName("a maxsimilarity da falha e reportada, para dar dimensao no log")
        void reportaMaxSimilaridade() throws Exception {
            var id = service.resolver(dto(TestFixtures.payload("camera-alarm-contrast-failed.txt")));
            assertThat(id.similaridade()).isEqualTo(0.13);
        }
    }

    // ───────────────── Nome truncado em 32 pela camera ─────────────────

    @Nested
    @DisplayName("★ nome cortado em 32 caracteres pela biblioteca facial")
    class NomeTruncado {

        // Os dois casos de producao de 07/08/2026: registrados como
        // UNKNOWN_FACE com a pessoa EXISTINDO em app_users.
        private static final String LUIS_CAMERA = "Luis Fernando FIGUEIREDO DOS SAN";
        private static final String LUIS_CADASTRO = "Luis Fernando FIGUEIREDO DOS SANTOS";
        private static final String MARCOS_CAMERA = "Marcos Vinicius CLEMENTE FERREIR";
        private static final String MARCOS_CADASTRO = "Marcos Vinicius CLEMENTE FERREIRA";

        /** Payload de sucesso com o nome cortado e o documento do caso real. */
        private CameraAlarmDto truncado(String nomeRecebido, String documento) throws Exception {
            String json = TestFixtures.comCertificateNumber(
                    TestFixtures.comNomeDeCamera(
                            TestFixtures.payload("camera-alarm-success.txt"), nomeRecebido),
                    documento);
            return dto(json);
        }

        @Test
        @DisplayName("★ caso real 1: FUNC-036 'Luis Fernando FIGUEIREDO DOS SAN'")
        void casoLuisFernando() throws Exception {
            User luis = pessoa("FUNC-036", LUIS_CADASTRO, null);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(luis));

            var id = service.resolver(truncado(LUIS_CAMERA, "0000000000001056"));

            assertThat(id.resultado())
                    .as("★ antes disto virava UNKNOWN_FACE com a pessoa cadastrada")
                    .isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId()).isEqualTo("FUNC-036");
        }

        @Test
        @DisplayName("★ caso real 2: FUNC-201 'Marcos Vinicius CLEMENTE FERREIR'")
        void casoMarcosVinicius() throws Exception {
            User marcos = pessoa("FUNC-201", MARCOS_CADASTRO, null);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(marcos));

            var id = service.resolver(truncado(MARCOS_CAMERA, "0000000000000006"));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId()).isEqualTo("FUNC-201");
        }

        @Test
        @DisplayName("★ o casamento por prefixo GRAVA o documento, como o exato")
        void gravaODocumento() throws Exception {
            User luis = pessoa("FUNC-036", LUIS_CADASTRO, null);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(luis));

            service.resolver(truncado(LUIS_CAMERA, "0000000000001056"));

            ArgumentCaptor<User> capturado = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(capturado.capture());
            assertThat(capturado.getValue().getCameraPersonId())
                    .as("★ sem isto a pessoa cai no prefixo TODA passagem, para sempre")
                    .isEqualTo("0000000000001056");
        }

        @Test
        @DisplayName("★ prefixo que casa com DOIS cadastros -> AMBIGUO, e nada e gravado")
        void doisCadastrosComOMesmoPrefixo() throws Exception {
            // Pai e filho, ou dois irmaos: o corte em 32 nao os distingue.
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-036", LUIS_CADASTRO, null),
                    pessoa("0001764", "Luis Fernando FIGUEIREDO DOS SANTOS JUNIOR", null)));

            var id = service.resolver(truncado(LUIS_CAMERA, "0000000000001056"));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.AMBIGUO);
            assertThat(id.motivoDeNegacao()).isEqualTo(DenialReason.AMBIGUOUS_NAME);
            assertThat(id.user()).isNull();
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("★ prefixo CURTO demais -> DESCONHECIDO, mesmo com um so cadastro")
        void prefixoCurtoDemais() throws Exception {
            // "ana carolina" = 12 normalizados, abaixo do piso de 16. Sem o
            // piso, um nome generico e completo viraria prefixo de quem tivesse
            // a infelicidade de ser o unico a comecar assim.
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("0001764", "Ana Carolina MAGBO DA SILVA", null)));

            var id = service.resolver(truncado("Ana CAROLINA", "0000000000007777"));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
            assertThat(id.motivoDeNegacao()).isEqualTo(DenialReason.UNKNOWN_FACE);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("★ o casamento EXATO tem precedencia sobre o prefixo")
        void exatoVencePrefixo() throws Exception {
            // As duas sao gente de verdade, nao variacoes de escrita. Se o
            // prefixo ganhasse, a passagem da mae iria para a conta da filha.
            User exata = pessoa("FUNC-036", LUIS_CAMERA, null);
            User maisLonga = pessoa("0001764", LUIS_CADASTRO, null);
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(maisLonga, exata));

            var id = service.resolver(truncado(LUIS_CAMERA, "0000000000001056"));

            assertThat(id.resultado())
                    .as("★ havendo casamento exato unico, o prefixo nem e consultado")
                    .isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId()).isEqualTo("FUNC-036");
        }

        @Test
        @DisplayName("★ exato AMBIGUO nao cai para o prefixo")
        void exatoAmbiguoNaoCaiParaPrefixo() throws Exception {
            // Dois homonimos exatos + um prefixo unico: escolher o prefixo
            // seria "resolver" a ambiguidade inventando um terceiro candidato.
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-036", LUIS_CAMERA, null),
                    pessoa("FUNC-037", LUIS_CAMERA, null),
                    pessoa("0001764", LUIS_CADASTRO, null)));

            var id = service.resolver(truncado(LUIS_CAMERA, "0000000000001056"));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.AMBIGUO);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("o camera_person_id ja gravado continua vencendo tudo")
        void documentoVenceOPrefixo() throws Exception {
            User outra = pessoa("FUNC-999", "Nome Que Nao Tem Nada A Ver", "0000000000001056");
            when(userRepository.findByCameraPersonId("0000000000001056"))
                    .thenReturn(Optional.of(outra));

            var id = service.resolver(truncado(LUIS_CAMERA, "0000000000001056"));

            assertThat(id.user().getId()).isEqualTo("FUNC-999");
            verify(userRepository, never()).findByAtivoTrue();
        }

        @Test
        @DisplayName("nenhum cadastro comeca com o nome recebido -> DESCONHECIDO")
        void nenhumPrefixo() throws Exception {
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Outra Pessoa Completamente Diferente", null)));

            var id = service.resolver(truncado(LUIS_CAMERA, "0000000000001056"));

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
            assertThat(id.motivoDeNegacao()).isEqualTo(DenialReason.UNKNOWN_FACE);
        }
    }

    // ───────────────── Robustez do payload ─────────────────

    @Nested
    @DisplayName("payload torto nao derruba nada")
    class Robustez {

        @Test
        @DisplayName("dto nulo -> DESCONHECIDO")
        void dtoNulo() {
            assertThat(service.resolver(null).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
        }

        @Test
        @DisplayName("★ envelope sem alarmResult nao estoura")
        void semAlarmResult() throws Exception {
            assertThat(service.resolver(dto("{\"eventType\":\"alarmResult\"}")).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
        }

        @Test
        @DisplayName("★ listas vazias em qualquer nivel nao estouram")
        void listasVazias() throws Exception {
            assertThat(service.resolver(dto("{\"alarmResult\":[]}")).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
            assertThat(service.resolver(dto("{\"alarmResult\":[{\"faces\":[]}]}")).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
            assertThat(service.resolver(dto(
                    "{\"alarmResult\":[{\"faces\":[{\"identify\":[]}]}]}")).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
        }

        @Test
        @DisplayName("★ score vem EMBRULHADO ({\"value\":N}) — modelar como numero quebra tudo")
        void scoreEmbrulhado() throws Exception {
            // Regressao da captura de 07/08: eu tinha modelado faces[].score
            // como Double. No payload real ele e um OBJETO. Jackson estourava
            // em TODO evento, o controller devolvia 200 e a portaria ficava
            // invisivel — a falha mais cara possivel, porque nao aparece.
            String json = "{\"alarmResult\":[{\"faces\":[{\"score\":{\"value\":52},"
                    + "\"identify\":[{\"candidate\":[{\"similarity\":0.95,\"FDLibThreshold\":70,"
                    + "\"reserve_field\":{\"name\":\"Sammy MAGBO\"}}]}]}]}]}";
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            assertThat(service.resolver(dto(json)).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
        }

        @Test
        @DisplayName("candidato sem reserve_field -> sem nome, DESCONHECIDO")
        void candidatoSemNome() throws Exception {
            String json = "{\"alarmResult\":[{\"faces\":[{\"identify\":[{\"candidate\":"
                    + "[{\"similarity\":0.95,\"FDLibThreshold\":70}]}]}]}]}";
            assertThat(service.resolver(dto(json)).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
        }

        @Test
        @DisplayName("★ numeros como STRING sao aceitos (familia Hikvision alterna)")
        void numerosComoString() throws Exception {
            String json = "{\"alarmResult\":[{\"faces\":[{\"identify\":[{\"candidate\":"
                    + "[{\"similarity\":\"0.95\",\"FDLibThreshold\":\"70\","
                    + "\"reserve_field\":{\"name\":\"Sammy MAGBO\"}}]}]}]}]}";
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            assertThat(service.resolver(dto(json)).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
        }

        @Test
        @DisplayName("★ entre varios candidatos vence o de MAIOR similaridade")
        void melhorCandidato() throws Exception {
            String json = "{\"alarmResult\":[{\"faces\":[{\"identify\":[{\"candidate\":["
                    + "{\"similarity\":0.72,\"FDLibThreshold\":70,\"reserve_field\":{\"name\":\"Outra Pessoa\"}},"
                    + "{\"similarity\":0.95,\"FDLibThreshold\":70,\"reserve_field\":{\"name\":\"Sammy MAGBO\"}}"
                    + "]}]}]}]}";
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            var id = service.resolver(dto(json));

            assertThat(id.user().getId())
                    .as("confiar na ORDEM da lista seria apostar num detalhe de firmware")
                    .isEqualTo("FUNC-001");
            assertThat(id.similaridade()).isEqualTo(0.95);
        }
    }
}
