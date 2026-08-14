package com.magbo.access.controllers;

import com.magbo.access.config.TotvsProperties;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.ResponseEntity;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * O LINK do TOTVS — e sobretudo os zeros à esquerda.
 *
 * A matrícula 0001764 e o número 1764 abrem fichas DIFERENTES. É o mesmo defeito
 * que o Excel produz na exportação para o HikCentral e que já custou uma correção
 * em massa; aqui ele abriria o prontuário de outra criança.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("TotvsLinkController — link, nunca cópia")
class TotvsLinkControllerTest {

    @Mock private UserRepository userRepository;

    private TotvsProperties props;
    private TotvsLinkController controller;

    @BeforeEach
    void setUp() {
        props = new TotvsProperties();
        controller = new TotvsLinkController(props, userRepository);
        when(userRepository.findById(anyString())).thenReturn(Optional.of(
                User.builder().id("0001764").nome("Aurélie Gonçalves")
                        .hikvisionEmployeeId("1234567890").tipo(UserType.ALUNO).ativo(true).build()));
    }

    @Test
    @DisplayName("★★ nasce DESLIGADO: sem padrão configurado, não há link")
    void nasceDesligado() {
        assertThat(props.configurado()).isFalse();
        ResponseEntity<?> r = controller.link("0001764");
        assertThat(r.getStatusCode().value())
                .as("501 e não 404: 'a escola não ligou a integração' ≠ 'esta pessoa não existe'")
                .isEqualTo(501);
    }

    @Test
    @DisplayName("★ a tela pergunta antes de mostrar botão")
    void configDizSeEstaLigado() {
        assertThat(controller.config().getBody()).containsEntry("configurado", false);
        props.setUrlPattern("https://x/ficha?ra={matricula}");
        assertThat(controller.config().getBody()).containsEntry("configurado", true);
    }

    @Test
    @DisplayName("★★★ os zeros à esquerda SOBREVIVEM — 0001764 não vira 1764")
    void zerosSobrevivem() {
        props.setUrlPattern("https://totvs.local/rm/ficha?ra={matricula}");
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) controller.link("0001764").getBody();
        assertThat(String.valueOf(body.get("url")))
                .as("cortar o zero abre a ficha de outra criança")
                .isEqualTo("https://totvs.local/rm/ficha?ra=0001764");
    }

    @Test
    @DisplayName("★ as outras fichas do padrão também são substituídas")
    void outrasFichas() {
        props.setUrlPattern("https://x/{hikvision}/{nome}");
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) controller.link("0001764").getBody();
        String url = String.valueOf(body.get("url"));
        assertThat(url).contains("1234567890");
        assertThat(url).as("o nome vai url-encoded").doesNotContain(" ");
    }

    @Test
    @DisplayName("★ pessoa inexistente é 404, não uma URL quebrada")
    void inexistenteE404() {
        props.setUrlPattern("https://x/{matricula}");
        when(userRepository.findById(anyString())).thenReturn(Optional.empty());
        assertThat(controller.link("9999").getStatusCode().value()).isEqualTo(404);
    }

    @Test
    @DisplayName("★★ nenhum dado de saúde atravessa esta rota — só a URL")
    void somenteUrl() {
        props.setUrlPattern("https://x/{matricula}");
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) controller.link("0001764").getBody();
        assertThat(body.keySet())
                .as("o prontuário vive no TOTVS; o MAGBO devolve um endereço e mais nada")
                .containsExactly("url");
    }
}
