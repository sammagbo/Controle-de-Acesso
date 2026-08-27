package com.magbo.access.services;

import com.magbo.access.models.SystemSetting;
import com.magbo.access.repositories.SystemSettingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * A SURCOUCHE DOS REGLAGES (V024) — e o contrato que ela nao pode quebrar.
 *
 * ⚠️ O contrato e UM: «default = comportamento atual». Uma base sem linha
 * nenhuma comporta-se exatamente como antes da V024. Cada teste aqui e uma
 * forma de esse contrato falhar em silencio.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SettingsService — o valor do ecra cobre o default, e nada mais")
class SettingsServiceTest {

    @Mock private SystemSettingRepository repository;

    private SettingsService service;

    private void linhas(SystemSetting... ls) {
        when(repository.findAll()).thenReturn(List.of(ls));
        // forca recarga do cache
        ReflectionTestUtils.setField(service, "cacheCarregadoEm", 0L);
    }

    private static SystemSetting linha(String chave, String valor) {
        return SystemSetting.builder().chave(chave).valor(valor)
                .updatedBy("t").updatedAt(LocalDateTime.now()).build();
    }

    @BeforeEach
    void setUp() {
        service = new SettingsService(repository);
        linhas();
    }

    @Test
    @DisplayName("★★★ SEM linha gravada, TODO getter devolve o default — o contrato da V024")
    void semLinhaValeODefault() {
        assertThat(service.efetivoInt("magbo.x", 30)).isEqualTo(30);
        assertThat(service.efetivo("magbo.y", "abc")).isEqualTo("abc");
        assertThat(service.efetivoBool("magbo.z", true)).isTrue();
        assertThat(service.efetivoCsv("magbo.w")).isEmpty();
    }

    @Test
    @DisplayName("★★★ COM linha, o valor do ecra cobre o default")
    void comLinhaValeOEcra() {
        linhas(linha("magbo.cantine.duracao-maxima-minutos", "45"));
        assertThat(service.efetivoInt("magbo.cantine.duracao-maxima-minutos", 30)).isEqualTo(45);
    }

    @Test
    @DisplayName("★★★ valor ILEGIVEL numa chave numerica -> default, nunca excecao")
    void ilegivelVoltaAoDefault() {
        // `efetivo*` corre no caminho do WEBHOOK: um «abc» gravado por engano
        // nao pode derrubar a decisao de uma passagem.
        linhas(linha("magbo.cantine.duracao-maxima-minutos", "abc"));
        assertThat(service.efetivoInt("magbo.cantine.duracao-maxima-minutos", 30)).isEqualTo(30);
    }

    @Test
    @DisplayName("★★ CSV: trim, maiusculas, vazios fora")
    void csvNormalizado() {
        linhas(linha("magbo.cantine.turmas-dispensees", " 6e1 , tps/ps a ,, 6E1 "));
        assertThat(service.efetivoCsv("magbo.cantine.turmas-dispensees"))
                .containsExactlyInAnyOrder("6E1", "TPS/PS A");
    }

    @Test
    @DisplayName("★★★ gravar VAZIO apaga a linha — «voltar ao default» e acao de primeira classe")
    void vazioApagaALinha() {
        service.gravar("magbo.x", "", "sam");
        verify(repository).deleteById("magbo.x");
        verify(repository, never()).save(any());

        service.gravar("magbo.x", null, "sam");
        verify(repository, times(2)).deleteById("magbo.x");
    }

    @Test
    @DisplayName("★★ gravar registra QUEM — e a coluna que o ecra de configuracao mostra")
    void gravarRegistraQuem() {
        service.gravar("magbo.x", "42", "vie.scolaire");
        var captor = org.mockito.ArgumentCaptor.forClass(SystemSetting.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getUpdatedBy()).isEqualTo("vie.scolaire");
        assertThat(captor.getValue().getValor()).isEqualTo("42");
    }

    @Test
    @DisplayName("★★ a escrita INVALIDA o cache na mesma chamada")
    void escritaInvalidaOCache() {
        assertThat(service.efetivoInt("magbo.x", 1)).isEqualTo(1);   // cache carregado, vazio
        linhas(linha("magbo.x", "9"));
        ReflectionTestUtils.setField(service, "cacheCarregadoEm", System.currentTimeMillis());
        // sem gravar, o cache velho (vazio) ainda vale dentro do TTL…
        // …mas depois de gravar, a leitura seguinte VE o valor novo:
        service.gravar("magbo.y", "1", "t");
        assertThat(service.efetivoInt("magbo.x", 1)).isEqualTo(9);
    }

    @Test
    @DisplayName("★ chave ou autor em branco sao recusados; valor >512 tambem")
    void entradasInvalidas() {
        assertThatThrownBy(() -> service.gravar(" ", "1", "t"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.gravar("k", "1", " "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.gravar("k", "x".repeat(600), "t"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
