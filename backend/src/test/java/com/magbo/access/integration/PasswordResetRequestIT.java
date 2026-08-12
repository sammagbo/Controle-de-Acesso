package com.magbo.access.integration;

import com.magbo.access.models.PasswordResetRequest;
import com.magbo.access.repositories.PasswordResetRequestRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * "ESQUECI A SENHA" OFFLINE — pedido registrado, fila do admin, bilhete fechado.
 *
 * O unico caminho sem autenticacao e a CRIACAO (quem pede e quem nao consegue
 * entrar). Por isso os testes cobram, alem do fluxo, as tres guardas: resposta
 * generica identica (anti-enumeracao), dedupe de pendente, e o que o admin ve.
 */
class PasswordResetRequestIT extends AbstractIT {

    private static final String CRIAR = "/api/auth/password-reset-request";
    private static final String FILA = "/api/admin/password-reset-requests";

    @Autowired PasswordResetRequestRepository resetRepo;

    @BeforeEach
    void limparPedidos() {
        resetRepo.deleteAll();
    }

    private org.springframework.test.web.servlet.RequestBuilder pedido(String username) {
        return MockMvcRequestBuilders.post(CRIAR)
                .contentType(APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\"}");
    }

    @Test
    @DisplayName("★ pedido SEM token e registrado — e quem pede nao consegue entrar mesmo")
    void pedidoSemTokenRegistra() throws Exception {
        mockMvc.perform(pedido("viescolaire"))
                .andExpect(status().isOk());

        assertThat(resetRepo.count()).isEqualTo(1);
        PasswordResetRequest r = resetRepo.findAll().get(0);
        assertThat(r.getUsername()).isEqualTo("viescolaire");
        assertThat(r.getStatus()).isEqualTo(PasswordResetRequest.Status.PENDING);
    }

    @Test
    @DisplayName("★ username existente e inexistente recebem a MESMA resposta — anti-enumeracao")
    void respostaIdenticaParaExistenteEInexistente() throws Exception {
        // 'admin' existe (bootstrap); 'nao-existe-999' nao.
        String r1 = mockMvc.perform(pedido("admin")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String r2 = mockMvc.perform(pedido("nao-existe-999")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(r1).isEqualTo(r2);
        // E o pedido do nome errado TAMBEM fica registrado — e informacao
        // util para o admin ("alguem nao sabe o nome da conta").
        assertThat(resetRepo.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("★ dedupe: pedir duas vezes nao cria fila — atualiza o pendente")
    void dedupeDePendente() throws Exception {
        mockMvc.perform(pedido("viescolaire")).andExpect(status().isOk());
        mockMvc.perform(pedido("VIESCOLAIRE")).andExpect(status().isOk());
        mockMvc.perform(pedido("viescolaire")).andExpect(status().isOk());

        assertThat(resetRepo.count())
                .as("um pendente por pessoa, qualquer caixa")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("★ a fila e ADMIN-only; tratar fecha o bilhete com quem tratou")
    void filaEhAdminETratarFecha() throws Exception {
        mockMvc.perform(pedido("viescolaire")).andExpect(status().isOk());

        // Sem token: fora. (403 e nao 401 e a divida conhecida do projeto.)
        mockMvc.perform(MockMvcRequestBuilders.get(FILA))
                .andExpect(status().is4xxClientError());

        String token = TestAuthHelper.loginAdmin(mockMvc);
        mockMvc.perform(MockMvcRequestBuilders.get(FILA)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].username").value("viescolaire"))
                .andExpect(jsonPath("$[0].status").value("PENDING"));

        Long id = resetRepo.findAll().get(0).getId();
        mockMvc.perform(MockMvcRequestBuilders.post(FILA + "/" + id + "/handle")
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());

        PasswordResetRequest fechado = resetRepo.findById(id).orElseThrow();
        assertThat(fechado.getStatus()).isEqualTo(PasswordResetRequest.Status.HANDLED);
        assertThat(fechado.getHandledBy()).isEqualTo("admin");
        assertThat(fechado.getHandledAt()).isNotNull();
    }

    @Test
    @DisplayName("pedido tratado nao bloqueia um novo pendente da mesma pessoa")
    void tratadoNaoBloqueiaNovo() throws Exception {
        mockMvc.perform(pedido("viescolaire")).andExpect(status().isOk());
        String token = TestAuthHelper.loginAdmin(mockMvc);
        Long id = resetRepo.findAll().get(0).getId();
        mockMvc.perform(MockMvcRequestBuilders.post(FILA + "/" + id + "/handle")
                .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)));

        mockMvc.perform(pedido("viescolaire")).andExpect(status().isOk());
        assertThat(resetRepo.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("vazio e gigante recebem o 200 generico e NAO gravam nada")
    void vazioEGiganteNaoGravam() throws Exception {
        mockMvc.perform(pedido("")).andExpect(status().isOk());
        mockMvc.perform(pedido("x".repeat(60))).andExpect(status().isOk());
        assertThat(resetRepo.count()).isZero();
    }
}
