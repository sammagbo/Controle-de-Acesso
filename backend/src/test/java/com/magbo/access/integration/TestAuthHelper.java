package com.magbo.access.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * Login real via POST /api/auth/login (permitAll) devolvendo o JWT.
 *
 * spring-security-test nao esta no pom e a Fase I nao pode adicionar
 * dependencias — entao nada de @WithMockUser: os ITs autenticam pelo caminho
 * de producao (DaoAuthenticationProvider + BCrypt + JwtService), o que de
 * quebra tambem exercita o fluxo de login.
 *
 * O ADMIN sai de graca: AdminBootstrap cria admin/admin1234 (pinado no perfil
 * test) uma vez por contexto, e AbstractIT nunca limpa system_users.
 */
final class TestAuthHelper {

    private TestAuthHelper() {
    }

    static final String ADMIN_USERNAME = "admin";
    static final String ADMIN_PASSWORD = "admin1234";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    static String login(MockMvc mockMvc, String username, String password) throws Exception {
        String body = MAPPER.writeValueAsString(
                java.util.Map.of("username", username, "password", password));

        String response = mockMvc.perform(MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .status().isOk())
                .andReturn().getResponse().getContentAsString();

        return MAPPER.readTree(response).get("token").asText();
    }

    static String loginAdmin(MockMvc mockMvc) throws Exception {
        return login(mockMvc, ADMIN_USERNAME, ADMIN_PASSWORD);
    }

    static String bearer(String token) {
        return "Bearer " + token;
    }
}
