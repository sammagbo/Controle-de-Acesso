package com.magbo.access.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.magbo.access.TestFixtures;
import com.magbo.access.models.EntitlementStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Importacao em lote (Fase G). O ponto central e a TRANSACAO POR LINHA: o
 * upsert e @Transactional(REQUIRES_NEW) chamado via self-injection, entao uma
 * linha que falha nao arrasta as linhas boas. Este IT prova que a linha valida
 * PERSISTE mesmo com linhas invalidas no mesmo lote.
 */
class BulkEntitlementIT extends AbstractIT {

    private final ObjectMapper mapper = new ObjectMapper();

    @org.springframework.beans.factory.annotation.Autowired
    private com.magbo.access.repositories.SystemUserRepository systemUserRepository;

    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @Test
    @DisplayName("lote misto: contadores corretos, erros por linha, e a linha valida PERSISTE")
    void loteMistoPersisteLinhasValidas() throws Exception {
        // valida (existe) + inexistente + status invalido
        userRepository.save(TestFixtures.aluno("0001111", null));
        String token = TestAuthHelper.loginAdmin(mockMvc);

        List<Map<String, String>> lote = List.of(
                Map.of("userId", "0001111", "status", "AUTHORIZED"),   // ok
                Map.of("userId", "9990000", "status", "AUTHORIZED"),   // aluno inexistente
                Map.of("userId", "0001111", "status", "BANANA")        // status invalido (mesmo id, mas falha antes)
        );
        // Nota: a 3a linha reusa 0001111 mas com status invalido -> falha na
        // validacao ANTES do upsert; a 1a ja gravou. Como sao linhas distintas
        // e a 1a nao existia, ela conta como criada.

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/meal-entitlements/bulk")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(lote)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRecebido").value(3))
                .andExpect(jsonPath("$.totalCriado").value(1))
                .andExpect(jsonPath("$.totalFalhas").value(2))
                .andExpect(jsonPath("$.erros", org.hamcrest.Matchers.hasSize(2)));

        assertThat(mealEntitlementRepository.findById("0001111"))
                .as("★ transacao por linha: a linha valida sobreviveu as falhas do lote")
                .isPresent()
                .get()
                .satisfies(e -> assertThat(e.getStatus()).isEqualTo(EntitlementStatus.AUTHORIZED));

        assertThat(mealEntitlementRepository.findById("9990000"))
                .as("aluno inexistente nao criou nada")
                .isEmpty();
    }

    @Test
    @DisplayName("os erros trazem a linha e o motivo")
    void errosTrazemLinhaEMotivo() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        List<Map<String, String>> lote = List.of(
                Map.of("userId", "9990000", "status", "AUTHORIZED"));

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/meal-entitlements/bulk")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(lote)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalFalhas").value(1))
                .andExpect(jsonPath("$.erros[0].linha").value("1"))
                .andExpect(jsonPath("$.erros[0].userId").value("9990000"))
                .andExpect(jsonPath("$.erros[0].erro",
                        org.hamcrest.Matchers.containsString("não encontrado")));
    }

    @Test
    @DisplayName("sem overwrite, linha existente NAO e sobrescrita (fica em ignorado)")
    void semOverwriteNaoSobrescreve() throws Exception {
        userRepository.save(TestFixtures.aluno("0001111", null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                "0001111", EntitlementStatus.NOT_AUTHORIZED));
        String token = TestAuthHelper.loginAdmin(mockMvc);

        List<Map<String, String>> lote = List.of(
                Map.of("userId", "0001111", "status", "AUTHORIZED"));

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/meal-entitlements/bulk")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(lote)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalIgnorado").value(1))
                .andExpect(jsonPath("$.totalAtualizado").value(0));

        assertThat(mealEntitlementRepository.findById("0001111").orElseThrow().getStatus())
                .as("sem overwrite, o status antigo permanece")
                .isEqualTo(EntitlementStatus.NOT_AUTHORIZED);
    }

    @Test
    @DisplayName("com overwrite=true, linha existente e atualizada")
    void comOverwriteSobrescreve() throws Exception {
        userRepository.save(TestFixtures.aluno("0001111", null));
        mealEntitlementRepository.save(TestFixtures.entitlement(
                "0001111", EntitlementStatus.NOT_AUTHORIZED));
        String token = TestAuthHelper.loginAdmin(mockMvc);

        List<Map<String, String>> lote = List.of(
                Map.of("userId", "0001111", "status", "AUTHORIZED"));

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/meal-entitlements/bulk?overwrite=true")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(lote)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalAtualizado").value(1))
                .andExpect(jsonPath("$.totalIgnorado").value(0));

        assertThat(mealEntitlementRepository.findById("0001111").orElseThrow().getStatus())
                .isEqualTo(EntitlementStatus.AUTHORIZED);
    }

    @Test
    @DisplayName("operador sem MEAL_ENTITLEMENT_WRITE nao pode importar em lote -> 403")
    void operadorSemPermissaoNaoImporta() throws Exception {
        // PermissionsIT ja cobre o 403 no PUT; aqui provamos no endpoint /bulk.
        systemUserRepository.findByUsername("op-bulk").ifPresent(systemUserRepository::delete);
        systemUserRepository.save(com.magbo.access.models.SystemUser.builder()
                .username("op-bulk")
                .passwordHash(passwordEncoder.encode("x"))
                .nomeCompleto("Op Bulk")
                .role(com.magbo.access.security.Role.OPERATOR)
                .setoresPermitidos("cantine")
                .permissoes(null)
                .ativo(true)
                .build());

        String token = TestAuthHelper.login(mockMvc, "op-bulk", "x");
        List<Map<String, String>> lote = List.of(Map.of("userId", "0001111", "status", "AUTHORIZED"));

        mockMvc.perform(MockMvcRequestBuilders.post("/api/admin/meal-entitlements/bulk")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(lote)))
                .andExpect(status().isForbidden());
    }
}
