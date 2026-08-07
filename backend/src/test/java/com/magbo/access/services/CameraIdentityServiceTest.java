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
            User sam = pessoa("FUNC-001", "Qualquer Nome Diferente", "CAM-000041");
            when(userRepository.findByCameraPersonId("CAM-000041")).thenReturn(Optional.of(sam));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user()).isSameAs(sam);
            // Determinístico: nem chegou a varrer o cadastro por nome.
            verify(userRepository, never()).findByAtivoTrue();
        }

        @Test
        @DisplayName("documento desconhecido cai para o casamento por nome")
        void documentoDesconhecidoCaiParaNome() throws Exception {
            when(userRepository.findByCameraPersonId("CAM-000041")).thenReturn(Optional.empty());
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.user().getId()).isEqualTo("FUNC-001");
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
                    .isEqualTo("CAM-000041");
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
            when(userRepository.findByCameraPersonId("CAM-000041")).thenReturn(Optional.empty());
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
            // Biblioteca exigente (90%): 0.87 passaria pela property (0.70) mas
            // nao pelo rigor que quem configurou a lista escolheu.
            String json = TestFixtures.comLimiarDaBiblioteca(
                    TestFixtures.payload("camera-alarm-success.txt"), 90);

            assertThat(service.resolver(dto(json)).resultado())
                    .isEqualTo(CameraIdentityService.Resultado.DESCONHECIDO);
        }

        @Test
        @DisplayName("★ escalas misturadas: 0.87 contra FDLibThreshold=70 e RECONHECIMENTO")
        void escalasMisturadas() throws Exception {
            // O payload traz fracao (similarity 0.87) e percentual
            // (FDLibThreshold 70). Comparar cru daria 0.87 < 70 e reprovaria
            // TODO reconhecimento bom — em silencio, parecendo defeito de camera.
            when(userRepository.findByAtivoTrue()).thenReturn(List.of(
                    pessoa("FUNC-001", "Sammy K. MAGBO", null)));

            var id = service.resolver(sucesso());

            assertThat(id.resultado()).isEqualTo(CameraIdentityService.Resultado.IDENTIFICADO);
            assertThat(id.similaridade()).isEqualTo(0.87);
        }

        @Test
        @DisplayName("normalizacao: percentual vira fracao, fracao fica")
        void normalizacao() {
            assertThat(CameraIdentityService.normalizarSimilaridade(70.0)).isEqualTo(0.70);
            assertThat(CameraIdentityService.normalizarSimilaridade(0.87)).isEqualTo(0.87);
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
            assertThat(id.similaridade()).isEqualTo(0.17);
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
