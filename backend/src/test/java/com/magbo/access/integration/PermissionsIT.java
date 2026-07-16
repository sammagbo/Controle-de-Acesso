package com.magbo.access.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.magbo.access.TestFixtures;
import com.magbo.access.models.SystemUser;
import com.magbo.access.repositories.SystemUserRepository;
import com.magbo.access.security.Permissions;
import com.magbo.access.security.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.Map;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Permissoes granulares (Fase F). Testa o caminho REAL de autorizacao:
 * login por senha -> JWT -> @PreAuthorize. Sem spring-security-test (nao esta
 * no pom e a Fase I nao adiciona dependencias), entao nada de @WithMockUser.
 *
 * Regra do modelo: leitura por SETOR (can('cantine')); ESCRITA de entitlement
 * exige a permissao granular MEAL_ENTITLEMENT_WRITE. Um operador da cantina
 * SEM essa permissao le, mas nao escreve.
 */
class PermissionsIT extends AbstractIT {

    @Autowired
    private SystemUserRepository systemUserRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final ObjectMapper mapper = new ObjectMapper();

    private static final String OP_USER = "cantineiro";
    private static final String OP_PASS = "senha-op-teste";

    @BeforeEach
    void criarOperadorLimitado() {
        // system_users NAO e limpo pelo AbstractIT (admin do bootstrap fica).
        // Removemos so o operador de teste para recriar limpo a cada metodo.
        systemUserRepository.findByUsername(OP_USER)
                .ifPresent(systemUserRepository::delete);

        systemUserRepository.save(SystemUser.builder()
                .username(OP_USER)
                .passwordHash(passwordEncoder.encode(OP_PASS))
                .nomeCompleto("Operador da Cantina")
                .role(Role.OPERATOR)
                .setoresPermitidos("cantine")   // pode LER a cantina
                .permissoes(null)               // NAO pode ESCREVER
                .ativo(true)
                .build());
    }

    @Test
    @DisplayName("operador da cantina SEM MEAL_ENTITLEMENT_WRITE: PUT -> 403")
    void operadorSemPermissaoDeEscritaNaoEscreve() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        String token = TestAuthHelper.login(mockMvc, OP_USER, OP_PASS);

        String body = mapper.writeValueAsString(Map.of("status", "AUTHORIZED"));

        mockMvc.perform(MockMvcRequestBuilders.put(
                                "/api/admin/meal-entitlements/" + TestFixtures.EMPLOYEE_PILOTO)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("mesmo operador: leitura (GET) da cantina continua 200")
    void operadorLeMesmoSemEscrita() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        String token = TestAuthHelper.login(mockMvc, OP_USER, OP_PASS);

        // GET /{userId} (getOrPending -> findById) prova o "pode ler por setor".
        // NAO usar /summary aqui: esse endpoint quebra por um bug de tipo de
        // producao (ver MealEntitlementFlowIT#summaryQuebraPorBugDeTipo) e
        // mascararia o que este teste realmente valida (leitura autorizada).
        mockMvc.perform(MockMvcRequestBuilders.get(
                                "/api/admin/meal-entitlements/" + TestFixtures.EMPLOYEE_PILOTO)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("operador COM MEAL_ENTITLEMENT_WRITE: PUT -> 200")
    void operadorComPermissaoEscreve() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        SystemUser op = systemUserRepository.findByUsername(OP_USER).orElseThrow();
        op.setPermissoes(Permissions.MEAL_ENTITLEMENT_WRITE);
        systemUserRepository.save(op);

        String token = TestAuthHelper.login(mockMvc, OP_USER, OP_PASS);
        String body = mapper.writeValueAsString(Map.of("status", "AUTHORIZED"));

        mockMvc.perform(MockMvcRequestBuilders.put(
                                "/api/admin/meal-entitlements/" + TestFixtures.EMPLOYEE_PILOTO)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("ADMIN escreve sem precisar de permissao granular: PUT -> 200")
    void adminEscreveSempre() throws Exception {
        userRepository.save(TestFixtures.aluno(TestFixtures.EMPLOYEE_PILOTO, null));
        String token = TestAuthHelper.loginAdmin(mockMvc);
        String body = mapper.writeValueAsString(Map.of("status", "AUTHORIZED"));

        mockMvc.perform(MockMvcRequestBuilders.put(
                                "/api/admin/meal-entitlements/" + TestFixtures.EMPLOYEE_PILOTO)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("sem token: PUT -> negado (403)")
    void semTokenEhNegado() throws Exception {
        String body = mapper.writeValueAsString(Map.of("status", "AUTHORIZED"));

        // Endpoints protegidos por @PreAuthorize (method security) sem
        // AuthenticationEntryPoint customizado devolvem 403 para anonimo, nao
        // 401. E o comportamento real do app (o webhook, que valida o token na
        // mao, e quem devolve 401). Observacao de convencao REST no relatorio.
        mockMvc.perform(MockMvcRequestBuilders.put(
                                "/api/admin/meal-entitlements/" + TestFixtures.EMPLOYEE_PILOTO)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }
}
