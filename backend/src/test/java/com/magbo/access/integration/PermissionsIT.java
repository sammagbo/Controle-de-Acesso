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
        // NAO usar /summary aqui: o comportamento dele ja e coberto por
        // MealEntitlementFlowIT#summaryRetornaContagensCorretas e misturaria
        // outra logica ao que este teste realmente valida (leitura autorizada).
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

    // ─────────────────────────────────────────────────────────────
    // O ENDPOINT QUE CONCEDE — /api/system-users
    // ─────────────────────────────────────────────────────────────
    // A tela de operadores agora oferece as permissoes granulares
    // (fix/permissions-ui), o que faz deste endpoint a porta de TODA elevacao
    // de privilegio do sistema. Dois furos apontados pelo painel de 14/08:
    // nenhum teste provava que um OPERATOR e recusado aqui (um PUT aceita
    // `role` e `permissoes` no mesmo corpo — a auto-elevacao completa), e
    // validatePermissoes nao era EXECUTADO por teste nenhum — as guardas do
    // Vitest sao grep de codigo-fonte, e inverter a condicao do whitelist
    // (aceitar so o invalido) passava na suite inteira.

    @Test
    @DisplayName("★★★ OPERATOR nao cria operador nem eleva a si mesmo: POST/PUT -> 403")
    void operadorNaoAlcancaSystemUsers() throws Exception {
        String token = TestAuthHelper.login(mockMvc, OP_USER, OP_PASS);
        Long meuId = systemUserRepository.findByUsername(OP_USER).orElseThrow().getId();

        // criar outro operador: recusado
        mockMvc.perform(MockMvcRequestBuilders.post("/api/system-users")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "username", "intruso", "password", "x",
                                "nomeCompleto", "Intruso", "role", "ADMIN"))))
                .andExpect(status().isForbidden());

        // elevar A SI MESMO — role e permissoes no mesmo corpo: recusado
        mockMvc.perform(MockMvcRequestBuilders.put("/api/system-users/" + meuId)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "role", "ADMIN", "permissoes", "*"))))
                .andExpect(status().isForbidden());

        // e nada mudou no banco
        SystemUser eu = systemUserRepository.findByUsername(OP_USER).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(eu.getRole()).isEqualTo(Role.OPERATOR);
        org.assertj.core.api.Assertions.assertThat(eu.getPermissoes()).isNull();
    }

    @Test
    @DisplayName("★★★ validatePermissoes EXECUTADO: invalida -> 400, cada valida de TODAS -> 200")
    void whitelistDePermissoesRodaDeVerdade() throws Exception {
        // ⚠️ Este teste mata a mutacao que o painel descreveu: inverter o
        // whitelist para `if (val.equals("*") || TODAS.contains(val)) throw`
        // mantem as strings que os testes de grep procuram e rejeitaria toda
        // caixa que a propria tela oferece com 400. Aqui o codigo RODA:
        // se a invalida passar OU uma valida falhar, o teste quebra.
        String token = TestAuthHelper.loginAdmin(mockMvc);
        Long opId = systemUserRepository.findByUsername(OP_USER).orElseThrow().getId();

        // permissao inventada: 400, e o corpo diz qual
        mockMvc.perform(MockMvcRequestBuilders.put("/api/system-users/" + opId)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("permissoes", "INVENTADA"))))
                .andExpect(status().isBadRequest());

        // cada permissao REAL da fonte unica: aceita. Iterar sobre TODAS e o
        // ponto — se um nome cair da lista no merge, este teste quebra sem
        // ninguem precisar lembrar dele.
        for (String perm : com.magbo.access.security.Permissions.TODAS) {
            mockMvc.perform(MockMvcRequestBuilders.put("/api/system-users/" + opId)
                            .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(Map.of("permissoes", perm))))
                    .andExpect(status().isOk());
        }

        // e a ultima gravacao esta no banco
        org.assertj.core.api.Assertions.assertThat(
                systemUserRepository.findByUsername(OP_USER).orElseThrow().getPermissoes())
                .isEqualTo(com.magbo.access.security.Permissions.TODAS
                        .get(com.magbo.access.security.Permissions.TODAS.size() - 1));
    }
}
