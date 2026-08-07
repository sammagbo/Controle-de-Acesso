package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AS CAMERAS DA PORTARIA, PONTA A PONTA.
 *
 * Ate 07/08/2026 todo evento das DeepinView chegava, respondia 200 e morria em
 * "Evento nao tratado, descartado": a portaria — o ponto de maior movimento da
 * escola — era invisivel para o sistema.
 *
 * ⚠️ SOBRE OS FIXTURES: os payloads de src/test/resources/payloads/camera-*.txt
 * foram montados a partir da DESCRICAO ESCRITA da captura de 07/08, campo a
 * campo, e NAO de um arquivo de tcpdump — a captura nao esta nesta maquina
 * (procurada por nome e por conteudo em todo o perfil, no repositorio, no git e
 * na outra copia do projeto). A ESTRUTURA e a descrita; o que foi inferido
 * esta listado no relatorio da entrega. O parser e deliberadamente tolerante
 * por causa disso: campo diferente do esperado degrada para "nao reconhecido",
 * que vira tentativa negada com motivo, em vez de derrubar o webhook.
 */
class PortariaCameraIT extends AbstractIT {

    /** Nome como a camera o escreve — o cadastro tem a inicial do meio. */
    private static final String NOME_CAMERA = "Sammy MAGBO";
    private static final String NOME_CADASTRO = "Sammy K. MAGBO";

    /**
     * certificateNumber do fixture. Formato REAL da captura (16 digitos com
     * zeros a esquerda); digitos trocados por ficticios — o repositorio e
     * publico e isto e numero de documento.
     */
    private static final String DOCUMENTO = "0000000000009001";

    private String sucesso() {
        return TestFixtures.payload("camera-alarm-success.txt");
    }

    private User servidor(String id, String nome, String cameraPersonId) {
        return userRepository.save(User.builder()
                .id(id).nome(nome).tipo(UserType.FUNCIONARIO).ativo(true)
                .cameraPersonId(cameraPersonId).build());
    }

    private void entradaMapeada() {
        seedMapping(TestFixtures.IP_CAMERA_ENTRADA, "PORT1", AccessAction.ENTRADA);
    }

    private AccessLog unicoLog() {
        assertThat(accessLogRepository.findAll()).hasSize(1);
        return accessLogRepository.findAll().get(0);
    }

    private AccessAttempt unicaTentativa() {
        assertThat(accessAttemptRepository.findAll()).hasSize(1);
        return accessAttemptRepository.findAll().get(0);
    }

    // ═════════════ 1. Casamento pelo documento ja guardado ═════════════

    @Test
    @DisplayName("★ 1. reconhecida pelo camera_person_id ja gravado -> access_log em PORT1/ENTRADA")
    void casaPeloDocumentoGuardado() throws Exception {
        entradaMapeada();
        // Nome do cadastro DIFERENTE do da camera de proposito: prova que o
        // casamento foi pelo documento e nao pelo nome.
        servidor("FUNC-001", "Nome Totalmente Diferente", DOCUMENTO);

        mockMvc.perform(TestFixtures.cameraWebhook(sucesso(), TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        AccessLog log = unicoLog();
        assertThat(log.getUserId()).isEqualTo("FUNC-001");
        assertThat(log.getPointId()).isEqualTo("PORT1");
        assertThat(log.getAction()).isEqualTo(AccessAction.ENTRADA);
        assertThat(log.getAuthMethod()).isEqualTo(AuthMethod.FACE);
        assertThat(log.getHikvisionSubEventType())
                .as("camera nao classifica autenticacao — e assim que se distingue de terminal")
                .isNull();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("a camera de SAIDA (.166) grava SAIDA, nao ENTRADA")
    void sentidoVemDoIp() throws Exception {
        seedMapping(TestFixtures.IP_CAMERA_SAIDA, "PORT1", AccessAction.SAIDA);
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        mockMvc.perform(TestFixtures.cameraWebhook(sucesso(), TestFixtures.IP_CAMERA_SAIDA))
                .andExpect(status().isOk());

        assertThat(unicoLog().getAction()).isEqualTo(AccessAction.SAIDA);
    }

    // ═════════════ 2. Casamento por nome + gravacao do documento ═════════════

    @Test
    @DisplayName("★ 2. casa pelo NOME e GRAVA o documento na pessoa")
    void casaPeloNomeEGuardaODocumento() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, null);

        mockMvc.perform(TestFixtures.cameraWebhook(sucesso(), TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(unicoLog().getUserId()).isEqualTo("FUNC-001");
        assertThat(userRepository.findById("FUNC-001"))
                .get()
                .extracting(User::getCameraPersonId)
                .as("★ da proxima passagem em diante a identificacao e deterministica")
                .isEqualTo(DOCUMENTO);
    }

    @Test
    @DisplayName("★ 2c. nome CORTADO em 32 pela camera vira acesso (caso real FUNC-036)")
    void nomeTruncadoViraAcesso() throws Exception {
        entradaMapeada();
        servidor("FUNC-036", "Luis Fernando FIGUEIREDO DOS SANTOS", null);

        // Caso de producao de 07/08/2026: a camera manda o nome cortado em 32
        // caracteres e a pessoa, que EXISTE em app_users, era registrada como
        // UNKNOWN_FACE — e como nunca era reconhecida, nunca ganhava o
        // camera_person_id que resolveria as passagens seguintes.
        String corpo = TestFixtures.comCertificateNumber(
                TestFixtures.comNomeDeCamera(sucesso(), "Luis Fernando FIGUEIREDO DOS SAN"),
                "0000000000001056");

        mockMvc.perform(TestFixtures.cameraWebhook(corpo, TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessAttemptRepository.count())
                .as("★ nao pode sobrar tentativa negada: a pessoa foi reconhecida")
                .isZero();
        assertThat(unicoLog().getUserId()).isEqualTo("FUNC-036");
        assertThat(userRepository.findById("FUNC-036"))
                .get()
                .extracting(User::getCameraPersonId)
                .as("★ o prefixo grava o documento igual ao casamento exato — so acontece uma vez")
                .isEqualTo("0000000000001056");
    }

    @Test
    @DisplayName("★ 2d. nome cortado que casa com DOIS cadastros nao vira acesso")
    void nomeTruncadoAmbiguoNaoViraAcesso() throws Exception {
        entradaMapeada();
        servidor("FUNC-036", "Luis Fernando FIGUEIREDO DOS SANTOS", null);
        servidor("FUNC-037", "Luis Fernando FIGUEIREDO DOS SANTOS JUNIOR", null);

        String corpo = TestFixtures.comCertificateNumber(
                TestFixtures.comNomeDeCamera(sucesso(), "Luis Fernando FIGUEIREDO DOS SAN"),
                "0000000000001056");

        mockMvc.perform(TestFixtures.cameraWebhook(corpo, TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("★ o corte em 32 nao distingue pai de filho — escolher um seria liberar no nome errado")
                .isZero();
        assertThat(unicaTentativa().getDenialReason()).isEqualTo(DenialReason.AMBIGUOUS_NAME);
        assertThat(userRepository.findById("FUNC-036"))
                .get().extracting(User::getCameraPersonId).isNull();
        assertThat(userRepository.findById("FUNC-037"))
                .get().extracting(User::getCameraPersonId).isNull();
    }

    @Test
    @DisplayName("★ 2b. a segunda passagem ja entra pelo documento (nome irrelevante)")
    void segundaPassagemUsaODocumento() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, null);

        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comPId(sucesso(), "evento-1"),
                        TestFixtures.IP_CAMERA_ENTRADA, 300))
                .andExpect(status().isOk());

        // O cadastro muda de nome; so o documento liga as duas passagens.
        User u = userRepository.findById("FUNC-001").orElseThrow();
        u.setNome("Nome Trocado Depois");
        userRepository.save(u);

        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comPId(sucesso(), "evento-2"),
                        TestFixtures.IP_CAMERA_ENTRADA, 0))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll())
                .as("duas passagens, as duas atribuidas a mesma pessoa")
                .hasSize(2)
                .allSatisfy(l -> assertThat(l.getUserId()).isEqualTo("FUNC-001"));
    }

    // ═════════════ 3. Homonimos ═════════════

    @Test
    @DisplayName("★ 3. DOIS homonimos -> AMBIGUOUS_NAME, e NADA em access_logs")
    void homonimosNaoViramAcesso() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, null);
        userRepository.save(User.builder()
                .id("0001764").nome(NOME_CAMERA).tipo(UserType.ALUNO).ativo(true).build());

        mockMvc.perform(TestFixtures.cameraWebhook(sucesso(), TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count())
                .as("★ escolher um dos dois seria liberar a passagem no nome da pessoa errada")
                .isZero();

        AccessAttempt t = unicaTentativa();
        assertThat(t.getDenialReason()).isEqualTo(DenialReason.AMBIGUOUS_NAME);
        assertThat(t.getUserId()).isNull();
        assertThat(t.getNomeSnapshot())
                .as("o nome lido e a unica pista de quem passou")
                .isEqualTo(NOME_CAMERA);
        assertThat(t.getPointId()).isEqualTo("PORT1");
        assertThat(t.getAuthMethod()).isEqualTo(AuthMethod.FACE);
        assertThat(t.getAuthResult())
                .as("a CAMERA reconheceu; quem recusou foi o MAGBO — e divergencia")
                .isEqualTo(AuthResult.SUCCESS);
        assertThat(t.getAuthorizationResult()).isEqualTo(AuthorizationResult.DENIED);

        assertThat(userRepository.findById("FUNC-001"))
                .get().extracting(User::getCameraPersonId)
                .as("nada e gravado quando ha duvida")
                .isNull();
    }

    // ═════════════ 4. Abaixo do limiar ═════════════

    @Test
    @DisplayName("★ 4. similaridade abaixo do limiar -> UNKNOWN_FACE, sem acesso")
    void abaixoDoLimiar() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, null);

        String fraco = TestFixtures.comSimilaridade(sucesso(), 0.42);
        mockMvc.perform(TestFixtures.cameraWebhook(fraco, TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(unicaTentativa().getDenialReason()).isEqualTo(DenialReason.UNKNOWN_FACE);
        assertThat(userRepository.findById("FUNC-001"))
                .get().extracting(User::getCameraPersonId).isNull();
    }

    // ═════════════ 5. Comparacao falhada ═════════════

    @Test
    @DisplayName("★ 5. contrastFailed -> UNKNOWN_FACE, sem nome, sem acesso")
    void contrastFailed() throws Exception {
        entradaMapeada();

        mockMvc.perform(TestFixtures.cameraWebhook(
                        TestFixtures.payload("camera-alarm-contrast-failed.txt"),
                        TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        AccessAttempt t = unicaTentativa();
        assertThat(t.getDenialReason()).isEqualTo(DenialReason.UNKNOWN_FACE);
        assertThat(t.getNomeSnapshot()).isNull();
        assertThat(t.getEmployeeNoRaw())
                .as("employee_no_raw e NOT NULL — a tentativa tem de ficar atribuivel a algo")
                .isNotBlank();
    }

    // ═════════════ 6. Parts descartaveis ═════════════

    @Test
    @DisplayName("★ 6. part MoveDetection.xml sozinha -> 200 e NADA gravado")
    void moveDetectionSozinha() throws Exception {
        entradaMapeada();

        mockMvc.perform(TestFixtures.cameraMultipart(TestFixtures.IP_CAMERA_ENTRADA,
                        TestFixtures.moveDetectionPart()))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("★ 6b. MoveDetection.xml JUNTO com o alarmResult nao atrapalha o reconhecimento")
    void moveDetectionJuntoComAlarme() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        String corpo = TestFixtures.cameraHaSegundos(
                TestFixtures.comIpDeCamera(sucesso(), TestFixtures.IP_CAMERA_ENTRADA), 0);

        mockMvc.perform(TestFixtures.cameraMultipart(TestFixtures.IP_CAMERA_ENTRADA,
                        TestFixtures.moveDetectionPart(),
                        TestFixtures.jsonPart("alarmResult", corpo),
                        TestFixtures.imagemDeRosto()))
                .andExpect(status().isOk());

        assertThat(unicoLog().getUserId()).isEqualTo("FUNC-001");
    }

    @Test
    @DisplayName("★ so parts de imagem (as TRES da captura real) -> 200 e nada gravado")
    void soImagens() throws Exception {
        entradaMapeada();

        // A captura de 07/08 mostrou dois nomes de part que eu nunca tinha
        // visto: backgroundImage (a cena inteira, ~460KB) e faceLibImage (a
        // foto da biblioteca facial). O descarte e por Content-Type, nao por
        // nome — este teste prende essa escolha, porque descartar por nome
        // faria cada nome novo de firmware virar WARN "payload nao parseavel".
        mockMvc.perform(TestFixtures.cameraMultipart(TestFixtures.IP_CAMERA_ENTRADA,
                        TestFixtures.imagemDeRosto(),
                        TestFixtures.imagemDeFundo(),
                        TestFixtures.imagemDaBiblioteca()))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    @Test
    @DisplayName("faceCapture sozinha nao vira acesso nem tentativa")
    void faceCaptureSozinha() throws Exception {
        entradaMapeada();

        mockMvc.perform(TestFixtures.cameraMultipart(TestFixtures.IP_CAMERA_ENTRADA,
                        TestFixtures.jsonPart("faceCapture",
                                TestFixtures.payload("camera-face-capture.txt")),
                        TestFixtures.imagemDeRosto()))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isZero();
        assertThat(accessAttemptRepository.count()).isZero();
    }

    // ═════════════ 7. Mesma passagem (30s) ═════════════

    @Test
    @DisplayName("★ 7. quem para diante da camera gera UM acesso, nao um por evento")
    void mesmaPassagemColapsa() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        // Tres reconhecimentos em 6 segundos, cada um com faceId proprio — sao
        // eventos DIFERENTES (o dedup de ingestao deixa passar e faz certo).
        // Quem colapsa e a regra de mesma passagem, de 30s.
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                            TestFixtures.comPId(sucesso(), "evento-" + i),
                            TestFixtures.IP_CAMERA_ENTRADA, 6 - (i * 3)))
                    .andExpect(status().isOk());
        }

        assertThat(accessLogRepository.count())
                .as("★ a camera nao espera ninguem encostar nela — sem esta regra seriam 3")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("★ 7b. passagens separadas por mais de 30s contam as duas")
    void passagensSeparadasContamAsDuas() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comPId(sucesso(), "manha"),
                        TestFixtures.IP_CAMERA_ENTRADA, 300))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comPId(sucesso(), "tarde"),
                        TestFixtures.IP_CAMERA_ENTRADA, 0))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("★ faceId REPETIDO entre eventos distintos nao pode descartar passagem")
    void faceIdRepetidoNaoDescarta() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        // Na captura de 07/08 o mesmo faceId 69205 aparece num contrastFailed
        // as 10:45:53 e num reconhecimento as 10:46:01 — pessoas diferentes.
        // Se faceId fosse a chave do dedup de ingestao, a segunda passagem
        // sumiria em silencio. pId diferente + 5 min de intervalo -> DUAS.
        for (int i = 0; i < 2; i++) {
            String corpo = TestFixtures.comPId(
                    TestFixtures.comFaceId(sucesso(), "69205"), "deteccao-" + i);
            mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                            corpo, TestFixtures.IP_CAMERA_ENTRADA, 300 - (i * 300)))
                    .andExpect(status().isOk());
        }

        assertThat(accessLogRepository.count())
                .as("★ faceId se repete no payload real; ele NAO e chave de ingestao")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("★ 7c. desconhecido parado colapsa, mesmo com pId novo a cada deteccao")
    void tentativaNegadaColapsa() throws Exception {
        entradaMapeada();

        // O pId muda a CADA deteccao — 38 valores distintos em 38 ocorrencias
        // na captura. E a situacao real de quem fica parado no portao. Sem
        // identidade no payload (contrastFailed nao traz candidato), o colapso
        // e por ponto+acao+motivo+janela.
        for (int i = 0; i < 3; i++) {
            String corpo = TestFixtures.comPId(
                    TestFixtures.payload("camera-alarm-contrast-failed.txt"), "deteccao-" + i);
            mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                            corpo, TestFixtures.IP_CAMERA_ENTRADA, 6 - (i * 3)))
                    .andExpect(status().isOk());
        }

        assertThat(accessAttemptRepository.count())
                .as("★ sem isto, um desconhecido parado no portao enche o feed sozinho")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("★ 7d. O CUSTO: dois estranhos DIFERENTES em 30s viram UMA linha")
    void doisEstranhosDiferentesColapsam() throws Exception {
        entradaMapeada();

        // contrastFailed nao traz nada que distinga um estranho de outro: pId e
        // unico por deteccao, faceId se repete entre pessoas. Este teste
        // CONGELA o preco da decisao para que ele seja uma escolha visivel e
        // nao uma surpresa: a contagem de nao reconhecidos e "em quantos
        // momentos passou pelo menos um estranho", nunca "quantos estranhos".
        for (int i = 0; i < 2; i++) {
            String corpo = TestFixtures.comPId(
                    TestFixtures.payload("camera-alarm-contrast-failed.txt"), "pessoa-" + i);
            mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                            corpo, TestFixtures.IP_CAMERA_ENTRADA, 5 - (i * 5)))
                    .andExpect(status().isOk());
        }

        assertThat(accessAttemptRepository.count())
                .as("custo aceito: o feed manda o operador olhar o portao, nao contar gente")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("★ 7e. reconhecido-e-recusado colapsa por PESSOA, nao por ponto")
    void reconhecidoRecusadoColapsaPorPessoa() throws Exception {
        entradaMapeada();
        // Ninguem no cadastro -> UNKNOWN_FACE, mas COM certificateNumber.
        String pessoaA = TestFixtures.comCertificateNumber(sucesso(), "0000000000001111");
        String pessoaB = TestFixtures.comNomeDeCamera(
                TestFixtures.comCertificateNumber(sucesso(), "0000000000002222"), "Outra Pessoa");

        for (int i = 0; i < 2; i++) {
            mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                            TestFixtures.comPId(pessoaA, "a" + i),
                            TestFixtures.IP_CAMERA_ENTRADA, 6 - (i * 3)))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comPId(pessoaB, "b0"), TestFixtures.IP_CAMERA_ENTRADA, 1))
                .andExpect(status().isOk());

        assertThat(accessAttemptRepository.count())
                .as("★ com documento ha identidade: A colapsa consigo, B entra separado")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("reentrega do MESMO pacote (mesmo pId) e descartada pelo dedup de ingestao")
    void reentregaDoMesmoPacote() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        String corpo = TestFixtures.cameraHaSegundos(
                TestFixtures.comIpDeCamera(sucesso(), TestFixtures.IP_CAMERA_ENTRADA), 0);
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(TestFixtures.cameraMultipart(TestFixtures.IP_CAMERA_ENTRADA,
                            TestFixtures.jsonPart("alarmResult", corpo)))
                    .andExpect(status().isOk());
        }

        assertThat(accessLogRepository.count()).isEqualTo(1);
    }

    // ═════════════ Hora do evento ═════════════

    @Test
    @DisplayName("★ o timestamp gravado e a hora do EVENTO, nao a da recepcao")
    void horaDoEvento() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        LocalDateTime antes = LocalDateTime.now();
        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        sucesso(), TestFixtures.IP_CAMERA_ENTRADA, 600))
                .andExpect(status().isOk());

        assertThat(unicoLog().getTimestamp())
                .as("a camera tambem enfileira; a fila esvaziada nao pode carimbar a hora errada")
                .isBefore(antes.minusMinutes(5))
                .isAfter(antes.minusMinutes(15));
    }

    @Test
    @DisplayName("hora ilegivel cai para a hora de recepcao (mesma guarda dos MinMoe)")
    void horaIlegivelCaiParaRecepcao() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        String corpo = TestFixtures.comDateTimeDeCamera(
                TestFixtures.comIpDeCamera(sucesso(), TestFixtures.IP_CAMERA_ENTRADA), "nao-e-data");

        LocalDateTime antes = LocalDateTime.now().minusSeconds(5);
        mockMvc.perform(TestFixtures.cameraMultipart(TestFixtures.IP_CAMERA_ENTRADA,
                        TestFixtures.jsonPart("alarmResult", corpo)))
                .andExpect(status().isOk());

        assertThat(unicoLog().getTimestamp()).isAfter(antes);
    }

    // ═════════════ Nunca cria pessoa ═════════════

    @Test
    @DisplayName("★ evento de camera NUNCA cria cadastro")
    void nuncaCriaPessoa() throws Exception {
        entradaMapeada();
        long antes = userRepository.count();

        mockMvc.perform(TestFixtures.cameraWebhook(sucesso(), TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(userRepository.count())
                .as("aluno vem do Pronote, servidor vem das telas de servidor")
                .isEqualTo(antes);
        assertThat(unicaTentativa().getDenialReason()).isEqualTo(DenialReason.UNKNOWN_FACE);
    }

    @Test
    @DisplayName("sem token o evento de camera nao entra")
    void exigeToken() throws Exception {
        entradaMapeada();
        servidor("FUNC-001", NOME_CADASTRO, DOCUMENTO);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .multipart(TestFixtures.WEBHOOK_URL)
                        .part(TestFixtures.jsonPart("alarmResult", sucesso()))
                        .with(TestFixtures.remoteAddr(TestFixtures.IP_CAMERA_ENTRADA)))
                .andExpect(status().isUnauthorized());

        assertThat(accessLogRepository.count()).isZero();
    }
}
