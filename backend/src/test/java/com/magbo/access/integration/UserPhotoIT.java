package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserPhotoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.io.ByteArrayOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * FOTOS DE IDENTIFICACAO — importacao e leitura, ponta a ponta.
 *
 * As fotos vivem no PostgreSQL e nao em disco, e a razao e verificavel:
 * deploy/docker-compose.yml monta UM volume no container do backend
 * (../backend/target em /app), que e a saida do Maven — `mvn clean` a apaga e
 * todo build a reescreve. Foto escrita ali nao sobrevive ao proprio
 * procedimento de deploy. No banco, ela entra no pg_dump que ja existe.
 *
 * ⚠️ SAO FOTOS DE MENORES. Alem das regras de casamento, este IT cobra o que
 * protege as criancas: leitura EXIGE autenticacao, a exclusao e definitiva, e
 * a simulacao nao escreve um byte.
 */
class UserPhotoIT extends AbstractIT {

    @Autowired
    private UserPhotoRepository userPhotoRepository;

    private static final String PREVIEW = "/api/admin/photos/import/preview";
    private static final String APPLY = "/api/admin/photos/import";

    /** Matricula do Pronote: 7 digitos COM zeros a esquerda. */
    private static final String MATRICULA = "0004048";
    /** employeeNo do HikCentral: 10 digitos, outra pessoa. */
    private static final String EMPLOYEE_NO = "1234567890";
    private static final String FUNC = "FUNC-501";

    @BeforeEach
    void limparFotos() {
        userPhotoRepository.deleteAll();
    }

    // ───────────────── Fixtures de imagem ─────────────────

    /**
     * JPEG minimo VALIDO no que importa aqui: comeca com FF D8 FF, que e o que
     * o servico usa para decidir se e imagem. O resto e enchimento — o sistema
     * nao decodifica a imagem, so a guarda e a devolve.
     *
     * @param marca byte que varia para produzir conteudos (e SHA-256) diferentes
     */
    private static byte[] jpeg(int marca) {
        byte[] b = new byte[64];
        b[0] = (byte) 0xFF; b[1] = (byte) 0xD8; b[2] = (byte) 0xFF;
        b[3] = (byte) marca;
        return b;
    }

    private static byte[] png() {
        byte[] b = new byte[64];
        byte[] assinatura = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        System.arraycopy(assinatura, 0, b, 0, assinatura.length);
        return b;
    }

    private static MockMultipartFile arquivo(String nome, byte[] bytes) {
        return new MockMultipartFile("files", nome, "image/jpeg", bytes);
    }

    private static byte[] zipCom(String... nomes) throws Exception {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(saida)) {
            int marca = 1;
            for (String nome : nomes) {
                zip.putNextEntry(new ZipEntry(nome));
                zip.write(jpeg(marca++));
                zip.closeEntry();
            }
        }
        return saida.toByteArray();
    }

    private void cadastro() {
        userRepository.save(User.builder()
                .id(MATRICULA).nome("DUPONT Marie").tipo(UserType.ALUNO)
                .turma("3B").ativo(true).hikvisionEmployeeId(MATRICULA).build());
        userRepository.save(User.builder()
                .id(FUNC).nome("Aldair TRINDADE").tipo(UserType.FUNCIONARIO)
                .ativo(true).hikvisionEmployeeId(EMPLOYEE_NO).build());
    }

    // ═════════════ 1. Casamento ═════════════

    @Test
    @DisplayName("★ 1. casa pela MATRICULA — com os zeros a esquerda intactos")
    void casaPelaMatricula() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].acao").value("CRIAR"))
                .andExpect(jsonPath("$.linhas[0].userId").value(MATRICULA))
                .andExpect(jsonPath("$.linhas[0].casouPor").value("MATRICULA"));

        assertThat(userPhotoRepository.findById(MATRICULA))
                .as("o zero a esquerda tem que sobreviver: 0004048 nao e 4048")
                .isPresent();
    }

    @Test
    @DisplayName("★ 2. casa pelo employeeNo do HikCentral quando o nome nao e a matricula")
    void casaPeloEmployeeNo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(EMPLOYEE_NO + ".jpg", jpeg(2)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].acao").value("CRIAR"))
                .andExpect(jsonPath("$.linhas[0].userId").value(FUNC))
                .andExpect(jsonPath("$.linhas[0].casouPor").value("HIKVISION"));

        assertThat(userPhotoRepository.findById(FUNC)).isPresent();
    }

    /**
     * O arquivo que nao acha dono NAO pode sumir. Numa pasta de 1200, o que se
     * precisa saber ao fim e exatamente quais ficaram de fora, e por que.
     */
    @Test
    @DisplayName("★ 3. arquivo sem dono e RELATADO por linha, com o nome e o motivo")
    void arquivoSemDonoERelatado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .file(arquivo("9999999.jpg", jpeg(2)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.CRIAR").value(1))
                .andExpect(jsonPath("$.totais.SEM_CORRESPONDENCIA").value(1))
                .andExpect(jsonPath("$.semCorrespondencia.length()").value(1))
                .andExpect(jsonPath("$.semCorrespondencia[0].nomeArquivo").value("9999999.jpg"))
                .andExpect(jsonPath("$.semCorrespondencia[0].detalhe").value(
                        org.hamcrest.Matchers.containsString("9999999")));

        assertThat(userPhotoRepository.count())
                .as("so a que casou foi gravada")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("★ 4. a SIMULACAO nao escreve um byte")
    void simulacaoNaoEscreve() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(PREVIEW)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .file(arquivo(EMPLOYEE_NO + ".jpg", jpeg(2)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(false))
                .andExpect(jsonPath("$.totais.CRIAR").value(2));

        assertThat(userPhotoRepository.count())
                .as("preview que grava e preview que mente")
                .isZero();
    }

    /** Reimportar a mesma pasta nao pode reescrever 1200 linhas. */
    @Test
    @DisplayName("★ 5. foto identica vira PULAR; foto diferente vira ATUALIZAR")
    void identicaPulaDiferenteAtualiza() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].acao").value("PULAR"));

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(7)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].acao").value("ATUALIZAR"));

        assertThat(userPhotoRepository.count()).isEqualTo(1);
    }

    /**
     * Tipo pelo CONTEUDO. Extensao e Content-Type sao declarados por quem
     * envia; um arquivo qualquer renomeado para .jpg passaria pelos dois.
     */
    @Test
    @DisplayName("★ 6. arquivo que nao e imagem e RECUSADO mesmo com extensao .jpg")
    void naoImagemERecusado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", "MZ isto nao e imagem".getBytes()))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].acao").value("RECUSADO"));

        assertThat(userPhotoRepository.count()).isZero();
    }

    @Test
    @DisplayName("★ 7. PNG tambem entra — o formato nao e so JPEG")
    void pngEntra() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".png", png()))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].acao").value("CRIAR"));

        assertThat(userPhotoRepository.findById(MATRICULA).orElseThrow().getContentType())
                .isEqualTo("image/png");
    }

    /**
     * ★ Dois arquivos para a mesma pessoa: NENHUM entra.
     *
     * Aplicar o primeiro e recusar o segundo seria o sistema escolhendo, pela
     * ordem alfabetica de um diretorio, qual e o rosto daquela pessoa. Numa
     * portaria, rosto errado no cadastro certo e saida liberada em nome de
     * outro. Os DOIS aparecem como CONFLITO, com o nome um do outro, e o
     * operador decide.
     */
    @Test
    @DisplayName("★ 8. dois arquivos para a mesma pessoa no mesmo lote -> CONFLITO nos dois, NENHUM aplicado")
    void doisArquivosParaAMesmaPessoa() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .file(arquivo(MATRICULA + ".png", png()))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.CONFLITO").value(2))
                .andExpect(jsonPath("$.totais.CRIAR").value(0))
                // A mensagem cita os dois arquivos: sem isso o operador nao
                // sabe qual par apagar.
                .andExpect(jsonPath("$.linhas[0].detalhe").value(
                        org.hamcrest.Matchers.containsString(MATRICULA + ".png")))
                .andExpect(jsonPath("$.linhas[1].detalhe").value(
                        org.hamcrest.Matchers.containsString(MATRICULA + ".jpg")));

        assertThat(userPhotoRepository.count())
                .as("o sistema nao escolhe o rosto de ninguem")
                .isZero();
    }

    /**
     * O conflito nao pode apagar a foto que ja estava certa: quem ja tinha
     * retrato continua com ele enquanto o operador resolve a duplicata.
     */
    @Test
    @DisplayName("★ 8b. conflito no lote nao mexe na foto ja cadastrada")
    void conflitoNaoApagaAFotoExistente() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());
        String shaAntes = userPhotoRepository.findById(MATRICULA).orElseThrow().getSha256();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(5)))
                        .file(arquivo(MATRICULA + ".png", png()))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.CONFLITO").value(2));

        assertThat(userPhotoRepository.findById(MATRICULA).orElseThrow().getSha256())
                .as("a foto boa continua onde estava")
                .isEqualTo(shaAntes);
    }

    /** O caminho da pasta nao entra no casamento — a matricula esta no NOME. */
    @Test
    @DisplayName("★ 9. arquivo dentro de subpasta casa pelo nome, nao pelo caminho")
    void subpastaNaoAtrapalha() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo("turma3B/" + MATRICULA + ".jpg", jpeg(1)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].acao").value("CRIAR"))
                .andExpect(jsonPath("$.linhas[0].userId").value(MATRICULA));
    }

    // ═════════════ 2. ZIP ═════════════

    @Test
    @DisplayName("★ 10. ZIP: simulacao lista as linhas e nao grava; aplicacao grava")
    void zipSimulaEAplica() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();
        byte[] zip = zipCom(MATRICULA + ".jpg", EMPLOYEE_NO + ".jpg", "0000000.jpg");

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/photos/import/preview/zip")
                        .contentType("application/zip").content(zip)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(false))
                .andExpect(jsonPath("$.totais.CRIAR").value(2))
                .andExpect(jsonPath("$.totais.SEM_CORRESPONDENCIA").value(1));
        assertThat(userPhotoRepository.count()).isZero();

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/photos/import/zip")
                        .contentType("application/zip").content(zip)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(true));
        assertThat(userPhotoRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("★ 11. ZIP com pastas: entradas de diretorio e lixo do macOS sao ignorados")
    void zipComPastasEIgnorados() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(saida)) {
            zip.putNextEntry(new ZipEntry("fotos/"));          // diretorio
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("__MACOSX/._x.jpg")); // lixo do zipador
            zip.write(new byte[]{1, 2, 3});
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("fotos/" + MATRICULA + ".jpg"));
            zip.write(jpeg(1));
            zip.closeEntry();
        }

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/photos/import/zip")
                        .contentType("application/zip").content(saida.toByteArray())
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totais.TOTAL").value(1))
                .andExpect(jsonPath("$.totais.CRIAR").value(1));
    }

    @Test
    @DisplayName("★ 12. ZIP ilegivel devolve 400 com mensagem pronta para a tela")
    void zipIlegivel() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/photos/import/preview/zip")
                        .contentType("application/zip").content("isto nao e um zip".getBytes())
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("error"));
    }

    // ═════════════ 3. Leitura, e a protecao ═════════════

    @Test
    @DisplayName("★ 13. a foto volta com o content-type e o ETag certos")
    void leituraDevolveAImagem() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();
        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        String etag = mockMvc.perform(MockMvcRequestBuilders.get("/api/users/" + MATRICULA + "/photo")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                // private, nunca public: um proxy da rede da escola nao pode
                // guardar retrato de aluno e servi-lo a quem pedir.
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL,
                        org.hamcrest.Matchers.containsString("private")))
                .andReturn().getResponse().getHeader(HttpHeaders.ETAG);

        assertThat(etag).isNotBlank();

        // Revalidacao: com o mesmo ETag, 304 e nenhum byte de volta.
        mockMvc.perform(MockMvcRequestBuilders.get("/api/users/" + MATRICULA + "/photo")
                        .header(HttpHeaders.IF_NONE_MATCH, etag)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isNotModified());
    }

    /**
     * ★ A regra que protege as criancas: sem token, nao ha foto. E o que torna
     * impossivel montar um <img src> aberto — e por isso que a tela busca por
     * fetch com cabecalho e monta um objectURL.
     */
    @Test
    @DisplayName("★ 14. SEM autenticacao a foto nao sai — nem com a matricula certa")
    void leituraExigeAutenticacao() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();
        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/users/" + MATRICULA + "/photo"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @DisplayName("★ 15. importar SEM autenticacao nao passa")
    void importacaoExigeAutenticacao() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.multipart(PREVIEW)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1))))
                .andExpect(status().is4xxClientError());
        assertThat(userPhotoRepository.count()).isZero();
    }

    @Test
    @DisplayName("★ 16. pessoa sem foto devolve 404 — a tela cai no avatar de iniciais")
    void semFotoDevolve404() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        mockMvc.perform(MockMvcRequestBuilders.get("/api/users/" + MATRICULA + "/photo")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isNotFound());
    }

    /** Exclusao DEFINITIVA — sem soft delete, sem lixeira. */
    @Test
    @DisplayName("★ 17. apagar remove a linha de verdade")
    void apagarRemoveDeVerdade() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();
        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.delete("/api/admin/photos/" + MATRICULA)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        assertThat(userPhotoRepository.findById(MATRICULA)).isEmpty();

        mockMvc.perform(MockMvcRequestBuilders.delete("/api/admin/photos/" + MATRICULA)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isNotFound());
    }

    /**
     * Apagar a pessoa apaga o retrato JUNTO. Sem isto a imagem — possivelmente
     * de um menor — ficaria presa a um id que ja nao existe: ninguem a
     * encontraria para apagar, e ela sobreviveria a cada backup dali em diante.
     */
    @Test
    @DisplayName("★ 18. remover o cadastro apaga a foto na mesma transacao")
    void removerCadastroApagaAFoto() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();
        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(EMPLOYEE_NO + ".jpg", jpeg(3)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());
        assertThat(userPhotoRepository.findById(FUNC)).isPresent();

        // FUNC-501 nao tem passagem nenhuma, entao a remocao e permitida.
        mockMvc.perform(MockMvcRequestBuilders.delete("/api/users/staff/" + FUNC)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        assertThat(userPhotoRepository.findById(FUNC))
                .as("cadastro apagado, retrato apagado")
                .isEmpty();
    }

    @Test
    @DisplayName("★ 19. o resumo conta quantas pessoas ja tem foto")
    void resumoConta() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();
        mockMvc.perform(MockMvcRequestBuilders.multipart(APPLY)
                        .file(arquivo(MATRICULA + ".jpg", jpeg(1)))
                        .file(arquivo(EMPLOYEE_NO + ".jpg", jpeg(2)))
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        mockMvc.perform(MockMvcRequestBuilders.get("/api/admin/photos/summary")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comFoto").value(2));
    }

    /**
     * ★ NAO EXISTE EXPORTACAO. A ausencia de rota nao aparece em teste nenhum
     * por si so; esta e a linha que a torna deliberada. Se alguem acrescentar
     * um "baixar todas", este teste quebra e a conversa acontece.
     */
    @Test
    @DisplayName("★ 20. nao ha endpoint de exportacao em massa")
    void naoHaExportacao() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastro();

        for (String rota : new String[]{
                "/api/admin/photos", "/api/admin/photos/export",
                "/api/admin/photos/all", "/api/admin/photos/download"}) {
            mockMvc.perform(MockMvcRequestBuilders.get(rota)
                            .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                    .andExpect(status().is4xxClientError());
        }
    }

    /** O IP da camera nunca alimenta esta tabela — o webhook nao a conhece. */
    @Test
    @DisplayName("★ 21. evento de camera nao cria foto nenhuma")
    void cameraNaoGuardaImagem() throws Exception {
        cadastro();
        seedMapping(TestFixtures.IP_CAMERA_ENTRADA, "PORT1",
                com.magbo.access.models.AccessAction.ENTRADA);

        mockMvc.perform(TestFixtures.cameraWebhook(
                        TestFixtures.payload("camera-alarm-success.txt"),
                        TestFixtures.IP_CAMERA_ENTRADA))
                .andExpect(status().isOk());

        assertThat(userPhotoRepository.count())
                .as("faceImage e backgroundImage seguem descartadas, como sempre foram")
                .isZero();
    }
}
