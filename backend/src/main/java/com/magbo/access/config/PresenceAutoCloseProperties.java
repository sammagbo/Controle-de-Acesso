package com.magbo.access.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Horario de fechamento por PONTO, para o encerramento automatico de presencas.
 *
 * Mapa e nao valor unico porque cada espaco fecha na sua hora: o CDI fecha as
 * 17:00, e quando a cantina entrar no ar basta acrescentar REFEI1 aqui — sem
 * recompilar e sem tocar no codigo do job.
 *
 * Configuracao:
 *   magbo.presence.auto-close.times[BIBLIO]=17:00
 *
 * Os colchetes sao o que garante a chave LITERAL: sem eles o Spring
 * canonicaliza o nome da propriedade e a chave chegaria em minusculas, sem
 * casar com o point_id. O getter normaliza para maiuscula de qualquer forma,
 * para que as duas formas funcionem.
 */
@Component
@ConfigurationProperties(prefix = "magbo.presence.auto-close")
@Getter
@Setter
public class PresenceAutoCloseProperties {

    /** Kill-switch: false desliga o fechamento sem mexer no cron. */
    private boolean enabled = true;

    /** point_id -> hora de fechamento ("HH:mm"). Vazio = nada a fechar. */
    private Map<String, String> times = new LinkedHashMap<>();

    /**
     * Pontos configurados com a hora ja convertida, chave em MAIUSCULA.
     * Entrada com hora ilegivel e descartada aqui — um horario mal digitado
     * no .env nao pode derrubar o job (e com ele o fechamento dos OUTROS
     * pontos), nem inventar uma hora de fechamento.
     */
    public Map<String, LocalTime> parsedTimes() {
        Map<String, LocalTime> out = new LinkedHashMap<>();
        times.forEach((point, hora) -> {
            if (point == null || point.isBlank() || hora == null || hora.isBlank()) return;
            try {
                out.put(point.trim().toUpperCase(), LocalTime.parse(hora.trim()));
            } catch (Exception ignored) {
                // Reportado pelo job, que tem logger; aqui so nao entra no mapa.
            }
        });
        return out;
    }
}
