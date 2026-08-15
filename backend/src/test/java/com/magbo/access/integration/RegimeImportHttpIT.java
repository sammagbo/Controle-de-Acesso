package com.magbo.access.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.magbo.access.TestFixtures;
import com.magbo.access.models.RegimeGeneral;
import com.magbo.access.models.RegimeSortie;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.StudentRegimeEventRepository;
import com.magbo.access.repositories.StudentRegimeRepository;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A CARGA EM LOTE DOS REGIMES, PELO CAMINHO REAL — HTTP e banco juntos.
 *
 * ⚠️ ESTE ARQUIVO EXISTE PORQUE FALTAVA. O painel de revisão apontou: nenhum
 * teste de integração tocava /api/admin/regimes/import/*, então as guardas de
 * escrita e a transação nunca rodavam JUNTAS na suíte. O que havia era
 * `RegimeImportServiceTest`, que mocka o `RegimeSortieService` — ele prova a
 * decisão de cada linha e não prova nada sobre o que chega ao banco, sobre o
 * @PreAuthorize, sobre a serialização do corpo, nem sobre o que acontece com as
 * linhas já gravadas quando uma falha no meio.
 *
 * É o caminho que grava QUEM AUTORIZOU UMA CRIANÇA A SAIR SOZINHA da escola.
 * Merece rodar inteiro.
 *
 * O que este IT prende, e que o teste de unidade não alcançava:
 *   1. o preview não grava — verificado no BANCO, não num mock;
 *   2. o apply grava, com `source=BULK` no histórico;
 *   3. quem não tem REGIME_WRITE leva 403 nos DOIS endpoints;
 *   4. o corpo JSON que o frontend manda de fato desserializa em RegimeImportRow;
 *   5. matrícula com ZEROS À ESQUERDA sobrevive à viagem inteira (é o defeito
 *      que o xlsx introduz e que transformaria a autorização de uma criança na
 *      de outra).
 */
class RegimeImportHttpIT extends AbstractIT {

    @Autowired private StudentRegimeRepository regimeRepository;
    @Autowired private StudentRegimeEventRepository eventRepository;
    @Autowired private SystemUserRepository systemUserRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    private final ObjectMapper mapper = new ObjectMapper();

    /** Matrícula COM zero à esquerda — o formato real do Pronote. */
    private static final String ALUNO = "0001764";

    private static final String OP_SEM = "op-sem-regime";
    private static final String OP_COM = "op-com-regime";
    private static final String SENHA = "senha-teste";

    @BeforeEach
    void semear() {
        regimeRepository.deleteAll();
        eventRepository.deleteAll();
        userRepository.save(TestFixtures.aluno(ALUNO, "6A"));

        for (String u : List.of(OP_SEM, OP_COM)) {
            systemUserRepository.findByUsername(u).ifPresent(systemUserRepository::delete);
        }
        systemUserRepository.save(SystemUser.builder()
                .username(OP_SEM).passwordHash(passwordEncoder.encode(SENHA))
                .nomeCompleto("Operador sem direito").role(Role.OPERATOR)
                .setoresPermitidos("portail").permissoes(null).ativo(true).build());
        systemUserRepository.save(SystemUser.builder()
                .username(OP_COM).passwordHash(passwordEncoder.encode(SENHA))
                .nomeCompleto("Vie Scolaire").role(Role.OPERATOR)
                .setoresPermitidos("portail").permissoes("REGIME_WRITE").ativo(true).build());
    }

    /** Uma linha da planilha, como o frontend a manda. */
    private Map<String, String> linha(String matricula, String geral, String sortie) {
        return Map.of(
                "linha", "2",
                "matricula", matricula,
                "regimeGeneral", geral,
                "regimeSortie", sortie,
                "validFrom", "2026-09-01",
                "authorizedByFamily", "Mme Gonçalves");
    }

    // ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("★★★ o PREVIEW não grava — verificado no banco, não num mock")
    void previewNaoGravaNoBanco() throws Exception {
        String token = TestAuthHelper.login(mockMvc, OP_COM, SENHA);

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/regimes/import/preview")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(List.of(
                                linha(ALUNO, "EXTERNE", "REGIME_1")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(false))
                .andExpect(jsonPath("$.linhas[0].acao").value("CRIAR"));

        assertThat(regimeRepository.count())
                .as("simular não pode escrever — é a promessa inteira do dry-run")
                .isZero();
        assertThat(eventRepository.count())
                .as("nem histórico")
                .isZero();
    }

    @Test
    @DisplayName("★★★ o APPLY grava de verdade, com source=BULK, e a matrícula mantém o zero")
    void applyGravaComZeroAEsquerda() throws Exception {
        String token = TestAuthHelper.login(mockMvc, OP_COM, SENHA);

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/regimes/import/apply")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(List.of(
                                linha(ALUNO, "DEMI_PENSIONNAIRE", "REGIME_2")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aplicado").value(true));

        var gravados = regimeRepository.findAll();
        assertThat(gravados).hasSize(1);
        assertThat(gravados.get(0).getUserId())
                .as("⚠️ 0001764 e 1764 são DUAS crianças diferentes. Se o zero cair "
                  + "em qualquer ponto da viagem, a autorização de uma vira a de outra.")
                .isEqualTo(ALUNO);
        assertThat(gravados.get(0).getRegimeSortie()).isEqualTo(RegimeSortie.REGIME_2);
        assertThat(gravados.get(0).getRegimeGeneral()).isEqualTo(RegimeGeneral.DEMI_PENSIONNAIRE);

        assertThat(eventRepository.findAll())
                .as("todo regime gravado deixa histórico, e o lote se identifica como lote")
                .hasSize(1)
                .allSatisfy(e -> assertThat(e.getSource()).isEqualTo("BULK"));
    }

    @Test
    @DisplayName("★★★ sem REGIME_WRITE: 403 nos DOIS endpoints, e nada é gravado")
    void semPermissaoNaoImporta() throws Exception {
        String token = TestAuthHelper.login(mockMvc, OP_SEM, SENHA);
        String corpo = mapper.writeValueAsString(List.of(linha(ALUNO, "EXTERNE", "REGIME_1")));

        for (String rota : List.of("preview", "apply")) {
            mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/regimes/import/" + rota)
                            .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(corpo))
                    .andExpect(status().isForbidden());
        }
        assertThat(regimeRepository.count()).isZero();
    }

    @Test
    @DisplayName("★★ uma linha ruim NÃO derruba as boas — o lote inteiro não morre por uma célula")
    void linhaRuimNaoDerrubaOLote() throws Exception {
        String token = TestAuthHelper.login(mockMvc, OP_COM, SENHA);
        userRepository.save(TestFixtures.aluno("0002000", "6B"));

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/regimes/import/apply")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(List.of(
                                linha("9999999", "EXTERNE", "REGIME_1"),   // aluno que não existe
                                linha("0002000", "EXTERNE", "REGIME_3")))))  // boa
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].acao").value("CONFLITO"))
                .andExpect(jsonPath("$.linhas[1].acao").value("CRIAR"));

        assertThat(regimeRepository.count())
                .as("a linha boa foi gravada mesmo com a ruim no mesmo lote")
                .isEqualTo(1);
    }
}
