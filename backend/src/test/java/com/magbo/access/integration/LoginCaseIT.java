package com.magbo.access.integration;

import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * LOGIN SEM DIFERENCIAR CAIXA NO USERNAME — a senha continua exata.
 *
 * Uso real (12/08/2026): o operador digitava o nome em minusculas e a tela
 * dizia "credenciais invalidas" — o cadastro estava em maiusculas. A regra
 * vive no backend (findByUsernameFlexivel): uma tela que forcasse maiusculas
 * esconderia o defeito e o deixaria vivo para a API.
 */
class LoginCaseIT extends AbstractIT {

    @Autowired SystemUserRepository systemUserRepository;
    @Autowired PasswordEncoder encoder;

    private void operador(String username, String senha) {
        systemUserRepository.save(SystemUser.builder()
                .username(username)
                .passwordHash(encoder.encode(senha))
                .nomeCompleto("Operador " + username)
                .role(Role.OPERATOR)
                .setoresPermitidos("*")
                .ativo(true)
                .build());
    }

    private org.springframework.test.web.servlet.RequestBuilder login(String u, String p) {
        return MockMvcRequestBuilders.post("/api/auth/login")
                .contentType(APPLICATION_JSON)
                .content("{\"username\":\"" + u + "\",\"password\":\"" + p + "\"}");
    }

    @Test
    @DisplayName("★ cadastro em MAIUSCULAS, digitado em minusculas -> entra")
    void minusculasEntram() throws Exception {
        operador("VIESCOLA1", "senha-forte-1");
        mockMvc.perform(login("viescola1", "senha-forte-1"))
                .andExpect(status().isOk())
                // O token e a sessao carregam o nome CANONICO do cadastro,
                // nao o que foi digitado — tudo a jusante ve um nome so.
                .andExpect(jsonPath("$.username").value("VIESCOLA1"));
    }

    @Test
    @DisplayName("caixa mista tambem entra")
    void caixaMistaEntra() throws Exception {
        operador("VIESCOLA2", "senha-forte-1");
        mockMvc.perform(login("VieScola2", "senha-forte-1"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("★ a SENHA continua exata — caixa errada na senha e recusada")
    void senhaContinuaCaseSensitive() throws Exception {
        operador("VIESCOLA3", "SenhaForte1");
        mockMvc.perform(login("viescola3", "senhaforte1"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("★ gemeos de caixa legados: o casamento EXATO vence — ninguem perde o acesso")
    void gemeosDeCaixaExatoVence() throws Exception {
        operador("Sam", "senha-do-sam");
        operador("SAM", "senha-do-SAM");

        // Cada um entra exatamente como sempre entrou.
        mockMvc.perform(login("Sam", "senha-do-sam")).andExpect(status().isOk());
        mockMvc.perform(login("SAM", "senha-do-SAM")).andExpect(status().isOk());

        // A forma que nao casa exato com NENHUM dos dois e ambigua -> recusa.
        // Escolher um seria autenticar alguem como outra pessoa.
        mockMvc.perform(login("sam", "senha-do-sam")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("★ criar operador que so difere pela caixa e recusado na porta")
    void gemeoDeCaixaNovoRecusado() throws Exception {
        operador("VIESCOLA4", "senha-forte-1");
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.post("/api/system-users")
                        .header(org.springframework.http.HttpHeaders.AUTHORIZATION,
                                TestAuthHelper.bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content("{\"username\":\"viescola4\",\"password\":\"outra-senha-9\","
                                + "\"nomeCompleto\":\"Gemeo\",\"role\":\"OPERATOR\","
                                + "\"setoresPermitidos\":\"*\"}"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @DisplayName("username com espacos nas pontas entra (trim no resolvedor)")
    void espacosNasPontas() throws Exception {
        operador("VIESCOLA5", "senha-forte-1");
        mockMvc.perform(login("  viescola5  ", "senha-forte-1"))
                .andExpect(status().isOk());
    }
}
