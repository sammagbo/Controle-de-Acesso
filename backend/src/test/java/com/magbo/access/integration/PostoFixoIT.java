package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.services.PostoFixoService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * POSTO FIXO — quem TRABALHA no ponto, ponta a ponta.
 *
 * Producao, 10/08/2026: o porteiro (Aldair TRINDADE) e as pessoas da Vie
 * Scolaire que ficam de pe no portao (Gustavo AMARAL, Clarice ALVES) sao
 * reconhecidos pela camera dezenas de vezes por dia. A tela do Portail e os
 * contadores enchiam de linhas iguais, e o numero de movimentos do dia deixou
 * de dizer alguma coisa.
 *
 * O QUE ESTE IT COBRA, e a ordem importa: primeiro que NADA se perde, depois
 * que o ruido sai das telas.
 *
 *   1. a primeira passagem do dia fica normal, sem flag;
 *   2. as seguintes SAO GRAVADAS, com flag POSTO_FIXO;
 *   3. o mesmo dia em OUTRO ponto e intocado (o porteiro que vai ao CDI conta);
 *   4. o dia seguinte recomeca do zero;
 *   5. o Journal (auditoria) continua listando tudo, e ganha a lente;
 *   6. a tela do setor esconde por padrao e mostra quando pedem;
 *   7. os contadores nao contam a repeticao — inclusive o card de ALERTAS,
 *      que era o risco mais feio: a marca criada para calar ruido virando ela
 *      propria um alerta;
 *   8. nada e apagado — a contagem crua continua batendo com o total.
 *
 * A camera e o caminho escolhido de proposito: e por ela que o problema
 * aparece na escola, e ela nao espera ninguem encostar em nada.
 */
class PostoFixoIT extends AbstractIT {

    /** certificateNumber do fixture (ficticio; o repositorio e publico). */
    private static final String DOCUMENTO = "0000000000009001";
    private static final String PORTEIRO = "FUNC-900";
    private static final String HOJE = LocalDate.now().toString();

    private String sucesso() {
        return TestFixtures.payload("camera-alarm-success.txt");
    }

    /**
     * O porteiro: postado em PORT1, reconhecido pelo documento ja guardado.
     *
     * Cadastrado como FUNCIONARIO porque e o que ele e — e porque so
     * PROFESSOR/FUNCIONARIO podem receber posto fixo (StaffAdminService).
     */
    private User porteiroPostadoNoPortao() {
        return userRepository.save(User.builder()
                .id(PORTEIRO).nome("Aldair TRINDADE").tipo(UserType.FUNCIONARIO)
                .ativo(true).departamento("PORTARIA")
                .cameraPersonId(DOCUMENTO)
                .postoFixoPointId("PORT1")
                .build());
    }

    private void entradaMapeada() {
        seedMapping(TestFixtures.IP_CAMERA_ENTRADA, "PORT1", AccessAction.ENTRADA);
    }

    /**
     * Uma passagem de camera, `segundosAtras` no passado, com pId proprio.
     *
     * O pId novo e obrigatorio: ele e a chave do dedup de INGESTAO das cameras,
     * e repeti-lo faria o segundo evento ser descartado antes de chegar a regra
     * que este teste exercita — o teste passaria testando outra coisa.
     */
    private void passagemDaCamera(String pId, long segundosAtras) throws Exception {
        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comPId(sucesso(), pId),
                        TestFixtures.IP_CAMERA_ENTRADA, segundosAtras))
                .andExpect(status().isOk());
    }

    private List<AccessLog> logsEmOrdem() {
        return accessLogRepository.findAll().stream()
                .sorted(java.util.Comparator.comparing(AccessLog::getTimestamp))
                .toList();
    }

    // ═════════════ 1. A regra ═════════════

    /**
     * O caso do porteiro, com os numeros da escola: quatro reconhecimentos
     * espacados por minutos. Nenhum e leitura repetida (a regra dos 30s nao os
     * alcanca, e nem deveria), e nenhum pode sumir.
     */
    @Test
    @DisplayName("★ 1. primeira passagem do dia normal; as seguintes GRAVADAS com flag POSTO_FIXO")
    void primeiraNormalRepeticoesMarcadas() throws Exception {
        entradaMapeada();
        porteiroPostadoNoPortao();

        passagemDaCamera("chegada", 3600);   // 1h atras
        passagemDaCamera("volta-1", 2400);
        passagemDaCamera("volta-2", 1200);
        passagemDaCamera("volta-3", 300);

        List<AccessLog> logs = logsEmOrdem();
        assertThat(logs)
                .as("as QUATRO passagens estao gravadas — a regra esconde, nunca descarta")
                .hasSize(4);

        assertThat(logs.get(0).getFlag())
                .as("a primeira do dia e uma passagem como qualquer outra")
                .isNull();
        assertThat(logs.subList(1, 4))
                .allSatisfy(l -> assertThat(l.getFlag())
                        .isEqualTo(PostoFixoService.FLAG_POSTO_FIXO));

        assertThat(logs).allSatisfy(l -> {
            assertThat(l.getUserId()).isEqualTo(PORTEIRO);
            assertThat(l.getPointId()).isEqualTo("PORT1");
        });
    }

    /**
     * O ponto central do desenho: a marca e do PAR pessoa+ponto, nao da pessoa.
     * Quem esta postado no portao continua sendo rastreado normalmente em
     * qualquer outro lugar — se ele passa no CDI, aquilo e uma visita e conta.
     */
    @Test
    @DisplayName("★ 2. passagem em OUTRO ponto no mesmo dia nao recebe flag")
    void outroPontoNaoEAfetado() throws Exception {
        entradaMapeada();
        seedMapping("10.10.0.7", "BIBLIO", AccessAction.ENTRADA);
        porteiroPostadoNoPortao();

        passagemDaCamera("portao-1", 3600);
        passagemDaCamera("portao-2", 1800);   // esta recebe a flag

        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comIpDeCamera(
                                TestFixtures.comPId(sucesso(), "cdi-1"), "10.10.0.7"),
                        "10.10.0.7", 900))
                .andExpect(status().isOk());

        List<AccessLog> noCdi = accessLogRepository.findAll().stream()
                .filter(l -> "BIBLIO".equals(l.getPointId())).toList();

        assertThat(noCdi).hasSize(1);
        assertThat(noCdi.get(0).getFlag())
                .as("BIBLIO nao e o posto dele: a visita conta como a de qualquer pessoa")
                .isNull();
    }

    /**
     * A fronteira do dia. Sem ela a flag seria "toda passagem depois da
     * primeira de todas", e a partir do segundo dia a pessoa nunca mais
     * apareceria numa tela — nem quando fosse o unico registro da manha.
     */
    @Test
    @DisplayName("★ 3. o contador zera no dia seguinte: a primeira passagem de amanha e normal")
    void diaSeguinteRecomecaDoZero() throws Exception {
        entradaMapeada();
        porteiroPostadoNoPortao();

        // Ontem: chegada + duas repeticoes.
        gravarPassagemDe(LocalDate.now().minusDays(1).atTime(7, 30));
        gravarPassagemDe(LocalDate.now().minusDays(1).atTime(11, 0));
        gravarPassagemDe(LocalDate.now().minusDays(1).atTime(16, 0));

        // Hoje, primeira do dia — pela camera, o caminho de verdade.
        passagemDaCamera("hoje-chegada", 300);

        AccessLog deHoje = accessLogRepository.findAll().stream()
                .filter(l -> l.getTimestamp().toLocalDate().equals(LocalDate.now()))
                .findFirst().orElseThrow();

        assertThat(deHoje.getFlag())
                .as("dia novo, contagem nova — senao a pessoa desapareceria para sempre")
                .isNull();
    }

    /** Ninguem sem posto fixo e afetado: e o comportamento historico intacto. */
    @Test
    @DisplayName("★ 4. sem posto fixo, nada muda — nenhuma passagem recebe flag")
    void semPostoFixoNadaMuda() throws Exception {
        entradaMapeada();
        userRepository.save(User.builder()
                .id("FUNC-901").nome("Aldair TRINDADE").tipo(UserType.FUNCIONARIO)
                .ativo(true).cameraPersonId(DOCUMENTO)
                .build());   // postoFixoPointId nulo

        passagemDaCamera("uma", 3600);
        passagemDaCamera("duas", 1800);
        passagemDaCamera("tres", 300);

        assertThat(accessLogRepository.findAll())
                .hasSize(3)
                .allSatisfy(l -> assertThat(l.getFlag()).isNull());
    }

    /**
     * Posto em PORT1 nao vale para PORT2 — sao portoes diferentes, e quem esta
     * de servico num aparece no outro como qualquer pessoa.
     */
    @Test
    @DisplayName("★ 5. o posto e de UM ponto: PORT2 nao herda a marca de PORT1")
    void postoNaoVazaParaOutroPortao() throws Exception {
        entradaMapeada();
        seedMapping("10.10.0.8", "PORT2", AccessAction.ENTRADA);
        porteiroPostadoNoPortao();

        passagemDaCamera("port1-1", 3600);
        passagemDaCamera("port1-2", 2400);

        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comIpDeCamera(
                                TestFixtures.comPId(sucesso(), "port2-1"), "10.10.0.8"),
                        "10.10.0.8", 600))
                .andExpect(status().isOk());

        assertThat(accessLogRepository.findAll().stream()
                .filter(l -> "PORT2".equals(l.getPointId())).toList())
                .singleElement()
                .satisfies(l -> assertThat(l.getFlag()).isNull());
    }

    // ═════════════ 2. As telas ═════════════

    /**
     * A tela do setor: esconde por padrao, mostra quando o operador pede.
     * Mesmo padrao ja validado do filtro de tipo — parametro, nunca regra fixa.
     */
    @Test
    @DisplayName("★ 6. /logs/{ponto} esconde a repeticao por padrao e a devolve com incluirPostoFixo")
    void telaDoSetorEscondeEMostraSobPedido() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        entradaMapeada();
        porteiroPostadoNoPortao();

        passagemDaCamera("chegada", 3600);
        passagemDaCamera("volta-1", 1800);
        passagemDaCamera("volta-2", 300);

        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/PORT1")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/PORT1")
                        .param("incluirPostoFixo", "true")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    /**
     * O Journal e a visao de AUDITORIA e nao esconde linha nenhuma sem que
     * alguem peca. Sem filtro: tudo. Com a lente: o recorte pedido.
     */
    @Test
    @DisplayName("★ 7. o Journal continua listando TUDO, e a lente de posto fixo recorta os dois lados")
    void journalListaTudoEFiltra() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        entradaMapeada();
        porteiroPostadoNoPortao();

        passagemDaCamera("chegada", 3600);
        passagemDaCamera("volta-1", 1800);
        passagemDaCamera("volta-2", 300);

        mockMvc.perform(journal(token).param("limit", "500"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));

        mockMvc.perform(journal(token).param("limit", "500").param("postoFixo", "SEULEMENT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mockMvc.perform(journal(token).param("limit", "500").param("postoFixo", "SANS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        // Valor que a tela nunca manda: nao pode estreitar nada em silencio.
        mockMvc.perform(journal(token).param("limit", "500").param("postoFixo", "talvez"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder journal(String token) {
        return MockMvcRequestBuilders.get("/api/access/logs/all")
                .param("dateFrom", HOJE)
                .param("dateTo", HOJE)
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token));
    }

    // ═════════════ 3. Os contadores ═════════════

    /**
     * O card de ALERTAS era o risco mais feio da entrega: ele conta "linha com
     * flag", e a flag nova existe justamente para calar ruido. Sem a exclusao,
     * a direcao abriria o painel e veria dezenas de alertas onde nao ha nenhum.
     */
    @Test
    @DisplayName("★ 8. os contadores nao contam a repeticao — nem como movimento, nem como ALERTA")
    void contadoresIgnoramARepeticao() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        entradaMapeada();
        porteiroPostadoNoPortao();

        passagemDaCamera("chegada", 3600);
        passagemDaCamera("volta-1", 1800);
        passagemDaCamera("volta-2", 900);
        passagemDaCamera("volta-3", 300);

        mockMvc.perform(MockMvcRequestBuilders.get("/api/stats/global")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalToday").value(1))
                .andExpect(jsonPath("$.alertasHoje").value(0))
                .andExpect(jsonPath("$.blockedToday").value(0));
    }

    /**
     * A prova de que nada foi apagado, dita em numeros: a contagem CRUA do
     * repositorio continua vendo as quatro linhas que a tela reduziu a uma.
     */
    @Test
    @DisplayName("★ 9. nada e apagado: a contagem crua ve as 4 linhas que a tela mostra como 1")
    void nadaEApagado() throws Exception {
        entradaMapeada();
        porteiroPostadoNoPortao();

        passagemDaCamera("chegada", 3600);
        passagemDaCamera("volta-1", 1800);
        passagemDaCamera("volta-2", 900);
        passagemDaCamera("volta-3", 300);

        LocalDateTime inicioDoDia = LocalDate.now().atStartOfDay();

        assertThat(accessLogRepository.countByTimestampGreaterThanEqual(inicioDoDia))
                .as("a contagem CRUA e a prova de que as linhas continuam la")
                .isEqualTo(4);
        assertThat(accessLogRepository.countRelevantesSince(inicioDoDia))
                .as("a contagem de TELA e a que ignora a repeticao")
                .isEqualTo(1);
        assertThat(accessLogRepository.count()).isEqualTo(4);
    }

    // ═════════════ 4. A porta de escrita ═════════════

    /**
     * ALUNO nunca ganha posto fixo, e a garantia e estrutural: a unica porta de
     * escrita e a tela de servidores, que recusa qualquer id que nao seja
     * PROFESSOR/FUNCIONARIO antes de tocar o cadastro.
     */
    @Test
    @DisplayName("★ 10. ALUNO nao pode receber posto fixo nem por chamada direta")
    void alunoNaoRecebePostoFixo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        userRepository.save(TestFixtures.aluno("0004048", "3B"));

        mockMvc.perform(MockMvcRequestBuilders.put("/api/users/staff/0004048")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"postoFixoPointId\":\"PORT1\"}")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isBadRequest());

        assertThat(userRepository.findById("0004048").orElseThrow().getPostoFixoPointId())
                .isNull();
    }

    /** Ponto inexistente e recusado na hora, com o valor na mensagem. */
    @Test
    @DisplayName("★ 11. ponto desconhecido e recusado — e o cadastro nao muda")
    void pontoDesconhecidoERecusado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        porteiroPostadoNoPortao();

        mockMvc.perform(MockMvcRequestBuilders.put("/api/users/staff/" + PORTEIRO)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"postoFixoPointId\":\"PORTARIA\"}")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isBadRequest());

        assertThat(userRepository.findById(PORTEIRO).orElseThrow().getPostoFixoPointId())
                .as("recusa nao pode deixar o cadastro pela metade")
                .isEqualTo("PORT1");
    }

    /** Vazio LIMPA — e como se desfaz a marcacao quando a pessoa sai do posto. */
    @Test
    @DisplayName("★ 12. campo vazio limpa o posto fixo; ausente nao mexe nele")
    void vazioLimpaAusenteNaoMexe() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        porteiroPostadoNoPortao();

        // Salvar SEM o campo: o posto tem que sobreviver a uma edicao de
        // departamento — senao mudar o setor de alguem apagaria a marcacao.
        mockMvc.perform(MockMvcRequestBuilders.put("/api/users/staff/" + PORTEIRO)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"departamento\":\"VIE SCOLAIRE\"}")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());
        assertThat(userRepository.findById(PORTEIRO).orElseThrow().getPostoFixoPointId())
                .isEqualTo("PORT1");

        mockMvc.perform(MockMvcRequestBuilders.put("/api/users/staff/" + PORTEIRO)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"postoFixoPointId\":\"\"}")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());
        assertThat(userRepository.findById(PORTEIRO).orElseThrow().getPostoFixoPointId())
                .isNull();
    }

    /** A lista de servidores carrega o posto — a tela precisa dele para exibir. */
    @Test
    @DisplayName("★ 13. a lista de servidores devolve o posto fixo de cada um")
    void listaDeServidoresTrazOPosto() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        porteiroPostadoNoPortao();

        mockMvc.perform(MockMvcRequestBuilders.get("/api/users/staff")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(PORTEIRO))
                .andExpect(jsonPath("$[0].postoFixoPointId").value("PORT1"));
    }

    // ───────────────── Helpers ─────────────────

    /**
     * Passagem gravada direto no banco, para montar cenario de OUTRO dia.
     *
     * O caminho da camera nao serve aqui: o EventTimeResolver rejeita evento
     * com mais de 30 dias e, mais perto, a hora de ontem chegaria como hora de
     * ontem — que e justamente o que se quer, mas sem a marcacao feita pelo
     * fluxo, porque o cenario de ontem e so pano de fundo do teste de hoje.
     */
    private void gravarPassagemDe(LocalDateTime quando) {
        accessLogRepository.save(AccessLog.builder()
                .userId(PORTEIRO)
                .pointId("PORT1")
                .action(AccessAction.ENTRADA)
                .timestamp(quando)
                .build());
    }
}
