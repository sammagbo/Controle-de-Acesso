package com.magbo.access.integration;

import com.magbo.access.TestFixtures;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.services.PresencaAbertaService;
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
 * ENTRADA DE QUEM JA ESTA DENTRO, ponta a ponta.
 *
 * Producao, 10/08/2026: o aluno 0003053 entrou no CDI QUATRO vezes em cinco
 * minutos — 12:49, 12:51, 12:51, 12:54 — sem uma saida entre elas. Depois da
 * primeira ele ja estava dentro; as outras tres nao sao visitas.
 *
 * A regra de MESMA PASSAGEM (30 s) nao alcanca, e faz certo: o que se repete
 * aqui nao e a LEITURA, e a PRESENCA. Duas passagens separadas por dois minutos
 * podem ser reais — o que as desqualifica e a pessoa ja estar do lado de dentro.
 *
 * Como o posto fixo e a passagem rapida: marca, nunca apaga.
 */
class PresencaAbertaIT extends AbstractIT {

    private static final String ALUNO = "0003053";
    private static final String CDI = "BIBLIO";
    private static final String HOJE = LocalDate.now().toString();

    private void cadastrar() {
        userRepository.save(User.builder()
                .id(ALUNO).nome("Aluno Do Incidente").tipo(UserType.ALUNO)
                .turma("3B").ativo(true).hikvisionEmployeeId(ALUNO).build());
    }

    /** Passagem gravada direto — o cenario e sobre a REGRA, nao sobre o webhook. */
    private void passagem(String pointId, AccessAction action, int hora, int minuto, String flag) {
        accessLogRepository.save(AccessLog.builder()
                .userId(ALUNO).pointId(pointId).action(action)
                .timestamp(LocalDate.now().atTime(hora, minuto))
                .flag(flag).build());
    }

    /** Roda a regra como o AccessDecisionService a chama. */
    private String flagPara(int hora, int minuto) {
        return presencaAberta.flagDeEntradaRepetida(
                ALUNO, CDI, AccessAction.ENTRADA, LocalDate.now().atTime(hora, minuto));
    }

    @org.springframework.beans.factory.annotation.Autowired
    private PresencaAbertaService presencaAberta;

    // ═════════════ A regra ═════════════

    /** O incidente, com as quatro horas reais. */
    @Test
    @DisplayName("★ 1. 12:49 abre a visita; 12:51, 12:51 e 12:54 sao JA_PRESENTE")
    void oIncidenteDoAluno0003053() {
        cadastrar();

        passagem(CDI, AccessAction.ENTRADA, 12, 49, null);
        assertThat(flagPara(12, 51))
                .as("depois da primeira ele ja estava dentro")
                .isEqualTo(PresencaAbertaService.FLAG_JA_PRESENTE);

        passagem(CDI, AccessAction.ENTRADA, 12, 51, PresencaAbertaService.FLAG_JA_PRESENTE);
        assertThat(flagPara(12, 54))
                .as("a marcada tambem mantem a presenca aberta — ela E uma ENTRADA")
                .isEqualTo(PresencaAbertaService.FLAG_JA_PRESENTE);
    }

    @Test
    @DisplayName("★ 2. depois de uma SAIDA real, a proxima ENTRADA abre visita normalmente")
    void depoisDaSaidaAbreVisitaDeNovo() {
        cadastrar();

        passagem(CDI, AccessAction.ENTRADA, 9, 0, null);
        passagem(CDI, AccessAction.SAIDA, 9, 30, null);

        assertThat(flagPara(10, 0))
                .as("a pessoa saiu — esta e uma visita nova, e tem que contar")
                .isNull();
    }

    @Test
    @DisplayName("★ 3. a PRIMEIRA entrada do dia nunca e marcada")
    void primeiraDoDiaNaoEMarcada() {
        cadastrar();
        assertThat(flagPara(8, 0)).isNull();
    }

    // ═════════════ Onde a regra roda, e onde NAO roda ═════════════

    /**
     * ★ O PORTAO fica de fora — decisao do Sam, 10/08/2026.
     *
     * Ali a saida escapa com frequencia: sai-se por fora do campo da camera,
     * junto com outra pessoa, por outro portao. "Ja esta dentro" e palpite, nao
     * fato, e marcar uma reentrada com base nele esconderia uma ENTRADA REAL
     * dos contadores — perder entrada no portao e perder a informacao de quem
     * esta na escola.
     *
     * O ruido do portao ja tem dono, e e outro: POSTO_FIXO, marcado por pessoa
     * e por decisao explicita.
     */
    @Test
    @DisplayName("★ 4a. no PORTAO a repeticao NAO e marcada, por mais entradas que haja")
    void noPortaoNaoMarca() {
        cadastrar();
        passagem("PORT1", AccessAction.ENTRADA, 7, 30, null);
        passagem("PORT1", AccessAction.ENTRADA, 9, 0, null);

        assertThat(presencaAberta.flagDeEntradaRepetida(
                ALUNO, "PORT1", AccessAction.ENTRADA, LocalDate.now().atTime(11, 0)))
                .as("marcar aqui esconderia uma entrada real de quem voltou mesmo")
                .isNull();
    }

    /** O outro lado do mesmo par: em ponto INTERNO, a mesma sequencia marca. */
    @Test
    @DisplayName("★ 4b. em ponto INTERNO a mesma sequencia E marcada")
    void emPontoInternoMarca() {
        cadastrar();
        passagem(CDI, AccessAction.ENTRADA, 7, 30, null);
        passagem(CDI, AccessAction.ENTRADA, 9, 0, PresencaAbertaService.FLAG_JA_PRESENTE);

        assertThat(flagPara(11, 0))
                .as("no CDI o par entrada/saida e fechado — quem nao saiu esta dentro")
                .isEqualTo(PresencaAbertaService.FLAG_JA_PRESENTE);
    }

    /**
     * A nocao vem da AREA, nao de uma lista de pontos: cantina e enfermaria
     * entram sozinhas quando forem comissionadas, sem ninguem lembrar de mexer
     * na regra.
     */
    @Test
    @DisplayName("★ 4c. enfermaria e cantina ja entram pela AREA, sem lista nova")
    void areasInternasEntramSozinhas() {
        cadastrar();
        for (String ponto : new String[]{"ENFERM", "REFEI1", "REFEI2"}) {
            passagem(ponto, AccessAction.ENTRADA, 8, 0, null);
            assertThat(presencaAberta.flagDeEntradaRepetida(
                    ALUNO, ponto, AccessAction.ENTRADA, LocalDate.now().atTime(9, 0)))
                    .as("%s e area interna: presenca confiavel", ponto)
                    .isEqualTo(PresencaAbertaService.FLAG_JA_PRESENTE);
        }
        for (String portao : new String[]{"PORT1", "PORT2", "PORT3"}) {
            passagem(portao, AccessAction.ENTRADA, 8, 0, null);
            assertThat(presencaAberta.flagDeEntradaRepetida(
                    ALUNO, portao, AccessAction.ENTRADA, LocalDate.now().atTime(9, 0)))
                    .as("%s e portao: presenca nao e confiavel", portao)
                    .isNull();
        }
    }

    /** Ponto desconhecido: conservador — nao se infere presenca no que nao se conhece. */
    @Test
    @DisplayName("★ 4d. ponto desconhecido nao e marcado")
    void pontoDesconhecidoNaoMarca() {
        cadastrar();
        passagem("XPTO", AccessAction.ENTRADA, 8, 0, null);

        assertThat(presencaAberta.flagDeEntradaRepetida(
                ALUNO, "XPTO", AccessAction.ENTRADA, LocalDate.now().atTime(9, 0)))
                .isNull();
    }

    @Test
    @DisplayName("★ 4. entrada em OUTRO ponto nao e afetada")
    void outroPontoNaoEAfetado() {
        cadastrar();
        passagem(CDI, AccessAction.ENTRADA, 12, 49, null);

        assertThat(presencaAberta.flagDeEntradaRepetida(
                ALUNO, "REFEI1", AccessAction.ENTRADA, LocalDate.now().atTime(12, 55)))
                .as("estar dentro do CDI nao diz nada sobre a cantina")
                .isNull();
    }

    /**
     * ⚠️ SAIDA NUNCA e marcada. Marca-la seria exatamente o defeito de ocupacao
     * de 10/08: a saida sumiria das telas e a pessoa constaria dentro depois de
     * ter ido embora.
     */
    @Test
    @DisplayName("★ 5. SAIDA jamais recebe a flag, mesmo com presenca aberta")
    void saidaNuncaEMarcada() {
        cadastrar();
        passagem(CDI, AccessAction.ENTRADA, 12, 49, null);

        assertThat(presencaAberta.flagDeEntradaRepetida(
                ALUNO, CDI, AccessAction.SAIDA, LocalDate.now().atTime(12, 55)))
                .isNull();
    }

    @Test
    @DisplayName("★ 6. a fronteira do dia: a primeira entrada de hoje nao herda ontem")
    void diaSeguinteRecomeca() {
        cadastrar();
        // Ontem ele entrou e ninguem fechou (fora do CDI nao ha fechamento
        // automatico, e este caso tem que valer para qualquer ponto).
        accessLogRepository.save(AccessLog.builder()
                .userId(ALUNO).pointId(CDI).action(AccessAction.ENTRADA)
                .timestamp(LocalDate.now().minusDays(1).atTime(16, 0)).build());

        assertThat(flagPara(8, 0))
                .as("uma entrada pendurada de ontem nao pode marcar a de hoje")
                .isNull();
    }

    // ═════════════ Contagens e telas ═════════════

    @Test
    @DisplayName("★ 7. a repeticao sai dos contadores, e a contagem CRUA prova que nada sumiu")
    void foraDosContadores() {
        cadastrar();
        passagem(CDI, AccessAction.ENTRADA, 12, 49, null);
        passagem(CDI, AccessAction.ENTRADA, 12, 51, PresencaAbertaService.FLAG_JA_PRESENTE);
        passagem(CDI, AccessAction.ENTRADA, 12, 51, PresencaAbertaService.FLAG_JA_PRESENTE);
        passagem(CDI, AccessAction.ENTRADA, 12, 54, PresencaAbertaService.FLAG_JA_PRESENTE);

        LocalDateTime inicio = LocalDate.now().atStartOfDay();

        assertThat(accessLogRepository.countByTimestampGreaterThanEqual(inicio))
                .as("as QUATRO linhas continuam no banco")
                .isEqualTo(4);
        assertThat(accessLogRepository.countRelevantesSince(inicio))
                .as("a contagem de TELA ve UMA visita")
                .isEqualTo(1);
        assertThat(accessLogRepository.countBlockedSince(inicio))
                .as("JA_PRESENTE nao e alerta — a marca criada para calar ruido nao pode virar ruido")
                .isZero();
    }

    @Test
    @DisplayName("★ 8. a tela do setor esconde por padrao e devolve com incluirRepeticoes")
    void telaDoSetorEscondeEMostra() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastrar();
        passagem(CDI, AccessAction.ENTRADA, 12, 49, null);
        passagem(CDI, AccessAction.ENTRADA, 12, 51, PresencaAbertaService.FLAG_JA_PRESENTE);
        passagem(CDI, AccessAction.ENTRADA, 12, 54, PresencaAbertaService.FLAG_JA_PRESENTE);

        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/" + CDI)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        mockMvc.perform(MockMvcRequestBuilders.get("/api/access/logs/" + CDI)
                        .param("incluirRepeticoes", "true")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    @DisplayName("★ 9. o Journal continua listando TUDO, e a lente recorta os dois lados")
    void journalListaTudo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        cadastrar();
        passagem(CDI, AccessAction.ENTRADA, 12, 49, null);
        passagem(CDI, AccessAction.ENTRADA, 12, 51, PresencaAbertaService.FLAG_JA_PRESENTE);
        passagem(CDI, AccessAction.ENTRADA, 12, 54, PresencaAbertaService.FLAG_JA_PRESENTE);

        mockMvc.perform(journal(token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));

        mockMvc.perform(journal(token).param("repeticoes", "SEULEMENT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mockMvc.perform(journal(token).param("repeticoes", "SANS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    /**
     * ★ A OCUPACAO nao muda. A pessoa esta dentro desde 12:49 e continua dentro:
     * as entradas marcadas somem, a original fica, e o resultado e o mesmo de
     * antes da regra existir.
     */
    @Test
    @DisplayName("★ 10. a ocupacao nao e afetada — quem entrou continua dentro, uma vez")
    void ocupacaoIntacta() {
        cadastrar();
        passagem(CDI, AccessAction.ENTRADA, 12, 49, null);
        passagem(CDI, AccessAction.ENTRADA, 12, 51, PresencaAbertaService.FLAG_JA_PRESENTE);

        assertThat(accessLogRepository.countActiveUsersSince(LocalDate.now().atStartOfDay()))
                .as("uma pessoa dentro, nao duas nem zero")
                .isEqualTo(1);
    }

    /** A saida real fecha, mesmo depois de repeticoes marcadas. */
    @Test
    @DisplayName("★ 11. a SAIDA fecha a presenca mesmo depois de entradas marcadas")
    void saidaFechaDepoisDeMarcadas() {
        cadastrar();
        passagem(CDI, AccessAction.ENTRADA, 12, 49, null);
        passagem(CDI, AccessAction.ENTRADA, 12, 51, PresencaAbertaService.FLAG_JA_PRESENTE);
        passagem(CDI, AccessAction.SAIDA, 13, 0, null);

        assertThat(accessLogRepository.countActiveUsersSince(LocalDate.now().atStartOfDay()))
                .as("saiu — a saida nunca e escondida")
                .isZero();
        assertThat(flagPara(14, 0))
                .as("e a proxima entrada abre visita nova")
                .isNull();
    }

    // ═════════════ Ponta a ponta pelo webhook ═════════════

    /**
     * O caminho de verdade: dois eventos de camera, separados por minutos, sem
     * saida entre eles. O primeiro abre a visita; o segundo e gravado com a
     * flag.
     */
    @Test
    @DisplayName("★ 12. ponta a ponta pela camera: 2a entrada gravada com JA_PRESENTE")
    void pontaAPontaPelaCamera() throws Exception {
        seedMapping(TestFixtures.IP_CAMERA_ENTRADA, CDI, AccessAction.ENTRADA);
        userRepository.save(User.builder()
                .id(ALUNO).nome("Aluno Do Incidente").tipo(UserType.ALUNO)
                .turma("3B").ativo(true)
                .cameraPersonId("0000000000009001").build());

        String payload = TestFixtures.payload("camera-alarm-success.txt");
        // 300 s e 120 s atras: fora da janela de 30 s da mesma passagem, entao
        // as duas chegam ao banco — e o que este teste precisa exercitar.
        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comPId(payload, "entrada-1"),
                        TestFixtures.IP_CAMERA_ENTRADA, 300))
                .andExpect(status().isOk());
        mockMvc.perform(TestFixtures.cameraWebhookHaSegundos(
                        TestFixtures.comPId(payload, "entrada-2"),
                        TestFixtures.IP_CAMERA_ENTRADA, 120))
                .andExpect(status().isOk());

        List<AccessLog> logs = accessLogRepository.findAll().stream()
                .sorted(java.util.Comparator.comparing(AccessLog::getTimestamp)).toList();

        assertThat(logs).as("as duas passagens estao gravadas").hasSize(2);
        assertThat(logs.get(0).getFlag()).isNull();
        assertThat(logs.get(1).getFlag()).isEqualTo(PresencaAbertaService.FLAG_JA_PRESENTE);
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder journal(String token) {
        return MockMvcRequestBuilders.get("/api/access/logs/all")
                .param("dateFrom", HOJE).param("dateTo", HOJE).param("limit", "500")
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token));
    }
}
