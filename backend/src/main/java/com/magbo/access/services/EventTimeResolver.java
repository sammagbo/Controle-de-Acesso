package com.magbo.access.services;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;

/**
 * Decide qual hora vai para o banco: a do EVENTO (dateTime do payload) ou, em
 * ultimo caso, a da RECEPCAO.
 *
 * Por que existe (incidente de 03/08/2026): o backend gravava
 * LocalDateTime.now() da recepcao. Um terminal esvaziou a fila offline — 33
 * eventos em 2 minutos, as 14:51, de passagens ocorridas horas antes — e os 33
 * acessos entraram no banco como se tivessem acontecido as 14:51. Os
 * relatorios mostraram duracoes medias NEGATIVAS e alunos na hora e no ponto
 * errados. Enfileirar e reenviar e comportamento normal dos MinMoe quando o
 * destino cai (observado 2x em bancada), entao a hora de recepcao nunca foi
 * uma aproximacao segura da hora do evento.
 *
 * FUSO: o payload traz offset explicito (os terminais da escola ainda saem de
 * fabrica em +08:00). O que importa e o INSTANTE, nao os digitos: convertemos
 * para America/Sao_Paulo, que e o fuso em que access_logs.timestamp e
 * access_attempts.timestamp vivem (coluna timestamp WITHOUT time zone, hora
 * local BRT — ver a regra "nunca setar hibernate.jdbc.time_zone").
 *
 * A hora de recepcao chega como parametro (e nao de um now() interno) porque o
 * chamador ja a mediu para o mesmo pacote: as guardas comparam evento e
 * recepcao no mesmo instante de referencia, e o teste consegue exercitar as
 * duas pontas da guarda sem mexer no relogio da maquina.
 *
 * Qualquer fallback e AUDITAVEL: sempre sai UMA linha INFO com o IP de origem
 * e o motivo. Nivel INFO, nao DEBUG, pela mesma razao do descarte de duplicata: em
 * producao o pacote loga em INFO, e um timestamp trocado em silencio e
 * exatamente o tipo de coisa que so aparece semanas depois, num relatorio que
 * ninguem consegue explicar.
 */
@Service
@Slf4j
public class EventTimeResolver {

    /** Fuso em que as colunas de timestamp do MAGBO vivem. */
    static final ZoneId ZONA_ESCOLA = ZoneId.of("America/Sao_Paulo");

    /**
     * Folga para o futuro. Cobre a dessincronia normal entre o relogio do
     * aparelho e o do servidor (segundos); acima disso o relogio esta errado, e
     * um evento "do futuro" corromperia relatorio e presenca.
     */
    static final Duration FOLGA_FUTURO = Duration.ofMinutes(5);

    /**
     * Idade maxima aceita. Uma fila offline de verdade se mede em horas; 30
     * dias e teto largo o bastante para nao descartar fila legitima nenhuma e
     * apertado o bastante para barrar aparelho que voltou ao relogio de fabrica
     * (tipicamente 1970 ou a data de build do firmware).
     */
    static final Duration IDADE_MAXIMA = Duration.ofDays(30);

    /**
     * @param rawDateTime dateTime do envelope do payload (pode ser null)
     * @param sourceIp    IP de origem da requisicao — identifica o aparelho na linha de log
     * @param recebidoEm  hora em que o pacote chegou; e o fallback e a referencia das guardas
     * @return hora do evento em America/Sao_Paulo, ou recebidoEm quando nao ha hora confiavel
     */
    public LocalDateTime resolve(String rawDateTime, String sourceIp, LocalDateTime recebidoEm) {
        if (rawDateTime == null || rawDateTime.isBlank()) {
            return recepcao(sourceIp, recebidoEm, "dateTime ausente no payload", rawDateTime);
        }

        LocalDateTime evento = parse(rawDateTime.trim());
        if (evento == null) {
            return recepcao(sourceIp, recebidoEm, "dateTime ilegivel", rawDateTime);
        }
        if (evento.isAfter(recebidoEm.plus(FOLGA_FUTURO))) {
            return recepcao(sourceIp, recebidoEm, "relogio do aparelho adiantado", rawDateTime);
        }
        if (evento.isBefore(recebidoEm.minus(IDADE_MAXIMA))) {
            return recepcao(sourceIp, recebidoEm, "hora do evento antiga demais", rawDateTime);
        }
        return evento;
    }

    /**
     * Formato normal: ISO 8601 COM offset, o unico que os aparelhos mandam.
     * Sem offset nao da para reconstruir o instante — a leitura mais proxima da
     * intencao do aparelho e assumir que ja veio na hora local da escola, o que
     * mantem o evento em vez de jogar a hora fora. As guardas continuam valendo
     * para ele.
     */
    private LocalDateTime parse(String raw) {
        try {
            return OffsetDateTime.parse(raw).atZoneSameInstant(ZONA_ESCOLA).toLocalDateTime();
        } catch (DateTimeParseException semOffset) {
            try {
                return LocalDateTime.parse(raw);
            } catch (DateTimeParseException ilegivel) {
                return null;
            }
        }
    }

    private LocalDateTime recepcao(String sourceIp, LocalDateTime recebidoEm, String motivo, String raw) {
        log.info("Hora do evento nao utilizavel, gravando a hora de recepcao (ip={}, motivo={}, dateTime={})",
                sourceIp, motivo, raw);
        return recebidoEm;
    }
}
