package com.magbo.access.services;

import com.magbo.access.config.PresenceAutoCloseProperties;
import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.repositories.AccessLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * FECHAMENTO AUTOMATICO DE PRESENCAS.
 *
 * O CDI fecha as 17:00 e ninguem dorme la dentro — mas a presenca e derivada do
 * ULTIMO evento do usuario no ponto, entao quem entrou e nao passou o rosto na
 * saida fica "dentro" para sempre. No dia seguinte a tela abre com gente de
 * ontem, e o numero deixa de significar qualquer coisa.
 *
 * O job fecha o dia: para cada pessoa cujo ULTIMO evento do dia naquele ponto
 * foi ENTRADA, grava uma SAIDA sintetica na hora de fechamento.
 *
 * A saida sintetica e DECLARADA, nunca disfarcada de crachá:
 *   flag            = FECHAMENTO_AUTO
 *   created_by_user = system
 * Auditoria e relatorio conseguem separar "saiu" de "foi fechado" — sem isso o
 * sistema estaria inventando passagem que nao aconteceu, que e exatamente o
 * tipo de dado que destroi a confianca no registro inteiro.
 *
 * HORA GRAVADA: a de FECHAMENTO (17:00), nao a da execucao do job. E o que
 * torna o resultado deterministico e independe de o job ter rodado em ponto ou
 * ter atrasado por queda do servidor.
 *
 * IDEMPOTENTE por duas vias, e as duas importam:
 *   1. depois da primeira passada o ultimo evento vira SAIDA, entao nao ha mais
 *      candidato;
 *   2. mesmo assim, so grava se ainda nao houver um FECHAMENTO_AUTO daquele
 *      usuario/ponto/dia. A via (1) sozinha nao basta: alguem que entra DEPOIS
 *      do fechamento (ENTRADA as 17:30) volta a ser candidato, e sem a via (2)
 *      cada execucao seguinte gravaria outra SAIDA das 17:00.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PresenceAutoCloseService {

    /** Marca da saida sintetica — o que separa fechamento de passagem real. */
    public static final String FLAG_FECHAMENTO = "FECHAMENTO_AUTO";

    /** Autor institucional; nenhum operador humano assina este registro. */
    public static final String AUTOR_SISTEMA = "system";

    /** A escola vive em BRT; o servidor nao necessariamente. */
    public static final ZoneId ZONA_ESCOLA = ZoneId.of("America/Sao_Paulo");

    private final AccessLogRepository accessLogRepository;
    private final PresenceAutoCloseProperties properties;

    /**
     * Roda a cada 5 minutos e fecha todo ponto cuja hora de fechamento JA
     * passou no dia corrente.
     *
     * "Ja passou", e nao "e exatamente agora": se o backend estiver parado as
     * 17:00 — deploy, reboot, queda —, o fechamento ainda acontece assim que
     * ele voltar. Como a operacao e idempotente e a hora gravada e sempre a de
     * fechamento, repetir a verificacao nao custa nada e nao muda o resultado.
     */
    @Scheduled(cron = "${magbo.presence.auto-close.cron:-}", zone = "America/Sao_Paulo")
    public void scheduledClose() {
        if (!properties.isEnabled()) {
            log.debug("Fechamento automatico desligado por propriedade");
            return;
        }
        LocalDate hoje = LocalDate.now(ZONA_ESCOLA);
        LocalTime agora = LocalTime.now(ZONA_ESCOLA);

        properties.parsedTimes().forEach((pointId, fechamento) -> {
            if (agora.isBefore(fechamento)) return;
            int fechadas = closePoint(pointId, hoje, fechamento);
            if (fechadas > 0) {
                log.info("Fechamento automatico: {} presenca(s) encerrada(s) em {} as {}",
                        fechadas, pointId, fechamento);
            }
        });
    }

    /**
     * Fecha as presencas abertas de UM ponto num dia. Publico para o teste e
     * para um eventual acionamento manual.
     *
     * @return quantas SAIDAs sinteticas foram gravadas
     */
    @Transactional
    public int closePoint(String pointId, LocalDate dia, LocalTime horaDeFechamento) {
        if (pointId == null || pointId.isBlank() || dia == null || horaDeFechamento == null) {
            return 0;
        }

        List<AccessLog> doDia = accessLogRepository.findByPointIdAndTimestampBetweenOrderByTimestampAsc(
                pointId, dia.atStartOfDay(), dia.atTime(LocalTime.MAX));

        // Ultimo evento por pessoa (a lista ja vem em ordem crescente) e quem
        // ja tem fechamento gravado hoje.
        Map<String, AccessLog> ultimoPorUsuario = new LinkedHashMap<>();
        List<String> jaFechados = new ArrayList<>();
        for (AccessLog log : doDia) {
            if (log.getUserId() == null) continue;
            ultimoPorUsuario.put(log.getUserId(), log);
            if (log.getAction() == AccessAction.SAIDA && FLAG_FECHAMENTO.equals(log.getFlag())) {
                jaFechados.add(log.getUserId());
            }
        }

        LocalDateTime carimbo = dia.atTime(horaDeFechamento);
        List<AccessLog> sinteticas = new ArrayList<>();
        ultimoPorUsuario.forEach((userId, ultimo) -> {
            if (ultimo.getAction() != AccessAction.ENTRADA) return;
            if (jaFechados.contains(userId)) return;
            sinteticas.add(AccessLog.builder()
                    .userId(userId)
                    .pointId(pointId)
                    .action(AccessAction.SAIDA)
                    .timestamp(carimbo)
                    .flag(FLAG_FECHAMENTO)
                    .createdByUser(AUTOR_SISTEMA)
                    .build());
        });

        if (sinteticas.isEmpty()) return 0;
        accessLogRepository.saveAll(sinteticas);
        return sinteticas.size();
    }
}
