package com.magbo.access.integration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * PARÂMETROS DE RELATÓRIO — fonte única do piso de visita curta.
 *
 * O piso é uma property do backend (magbo.report.min-visit-seconds), mas o
 * Rapport CDI é calculado no cliente. Enquanto o número vivia repetido como
 * constante no JS, mudar a property sem mudar o JS fazia a MESMA tela mostrar
 * dois números para o mesmo dia — e nada acusava a divergência.
 */
class ReportConfigIT extends AbstractIT {

    private static final String URL = "/api/access/report-config";

    @Test
    @DisplayName("devolve o piso de visita curta vindo da property")
    void devolveOPiso() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);

        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk())
                // 60 no application-test.properties, como nos outros três perfis.
                .andExpect(jsonPath("$.minVisitSeconds").value(60));
    }

    /**
     * Quem opera o CDI não é admin, e precisa do valor para a tela mostrar o
     * mesmo número que o relatório do servidor.
     */
    @Test
    @DisplayName("basta estar autenticado — não é endpoint de admin")
    void bastaEstarAutenticado() throws Exception {
        String token = TestAuthHelper.loginAdmin(mockMvc);
        mockMvc.perform(MockMvcRequestBuilders.get(URL)
                        .header(HttpHeaders.AUTHORIZATION, TestAuthHelper.bearer(token)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("sem token é negado")
    void semTokenEhNegado() throws Exception {
        mockMvc.perform(MockMvcRequestBuilders.get(URL))
                .andExpect(status().isForbidden());
    }
}
