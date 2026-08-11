package com.magbo.access.services;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessLog;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * VISITAS a partir de access_logs — camada de RELATÓRIO.
 *
 * Emparelha ENTRADA→SAIDA da mesma pessoa, no mesmo ponto, no mesmo dia, e
 * aplica as duas regras de leitura que o dado cru não tem como expressar:
 *
 *  1. TIPO. Desde que os servidores existem em app_users (152 FUNCIONARIO + 49
 *     PROFESSOR), eles poluem os números do CDI: entram por segundos, quase
 *     nunca passam o rosto na saída, e o fechamento das 17:00 transforma isso
 *     em "permanência" de um dia inteiro. Os relatórios do CDI contam ALUNO por
 *     padrão; ver tudo é uma escolha explícita de quem lê.
 *
 *  2. VISITA CURTA. Entrar para dar um recado e sair em 20 segundos não é
 *     permanência. Abaixo de magbo.report.min-visit-seconds a visita não conta
 *     nem no total nem na média.
 *
 * E uma exclusão que não é regra de negócio, é honestidade: SAIDA sintética
 * (flag=FECHAMENTO_AUTO) NÃO é hora real de saída — entra no fecho da presença,
 * nunca numa média de duração. Somar 17:00 como se a pessoa tivesse passado o
 * rosto ali inventaria permanência.
 *
 * ⚠️ NADA É APAGADO. Isto lê access_logs e devolve números; o Journal continua
 * mostrando cada linha, inclusive as visitas curtas e os fechamentos
 * automáticos. Regra de leitura, não de escrita.
 */
@Service
@RequiredArgsConstructor
public class VisitStatsService {

    private final AccessLogRepository accessLogRepository;
    private final UserRepository userRepository;

    @Value("${magbo.report.min-visit-seconds:60}")
    private long minVisitSeconds;

    /** Piso de duração, em segundos, para uma visita contar. */
    public long minVisitSeconds() {
        return minVisitSeconds;
    }

    /** Uma visita emparelhada. `saida` null = pessoa não saiu (ou não passou o rosto). */
    public record Visit(String userId, String pointId, LocalDateTime entrada,
                        LocalDateTime saida, boolean fechamentoAutomatico) {

        public Long segundos() {
            return saida == null ? null : Duration.between(entrada, saida).getSeconds();
        }
    }

    /** Números prontos para a tela. */
    public record VisitStats(long visits, long uniquePeople, Integer avgDurationMin,
                             long shortVisitsIgnored, long openVisits) {
    }

    /**
     * Estatísticas de visita de um conjunto de pontos num período.
     *
     * @param incluirFuncionarios false (padrão das telas do CDI) conta só ALUNO
     */
    public VisitStats stats(List<String> pointIds, LocalDateTime from, LocalDateTime to,
                            boolean incluirFuncionarios) {
        List<Visit> visitas = visits(pointIds, from, to, incluirFuncionarios);

        long curtas = visitas.stream()
                .filter(v -> v.segundos() != null && v.segundos() < minVisitSeconds)
                .count();

        List<Visit> contam = visitas.stream()
                .filter(v -> v.segundos() == null || v.segundos() >= minVisitSeconds)
                .toList();

        // Média só sobre visitas FECHADAS por saída REAL. Visita aberta não tem
        // duração, e fechamento automático não tem hora de saída verdadeira.
        List<Visit> comDuracaoConfiavel = contam.stream()
                .filter(v -> v.saida() != null && !v.fechamentoAutomatico())
                .toList();

        Integer media = comDuracaoConfiavel.isEmpty() ? null
                : (int) Math.round(comDuracaoConfiavel.stream()
                        .mapToLong(v -> v.segundos() / 60L).average().orElse(0));

        Set<String> pessoas = new HashSet<>();
        contam.forEach(v -> pessoas.add(v.userId()));

        return new VisitStats(contam.size(), pessoas.size(), media, curtas,
                contam.stream().filter(v -> v.saida() == null).count());
    }

    /**
     * Emparelha as visitas de um período.
     *
     * Emparelhamento por pilha, não por índice par/ímpar: o dado real tem
     * ENTRADA sem SAIDA (a pessoa saiu sem passar o rosto) e SAIDA sem ENTRADA
     * (a passagem de entrada caiu na regra de mesma passagem, ou o dia começou
     * com alguém já dentro). Um pareamento posicional casaria a entrada de uma
     * visita com a saída de outra e produziria durações absurdas — inclusive
     * negativas, que foi o que apareceu nos relatórios.
     */
    /**
     * ENTRADAs de REPETICAO nao abrem visita — auditoria de 10/08/2026.
     *
     * As flags POSTO_FIXO e JA_PRESENTE foram ligadas as consultas e as telas,
     * mas o PAREAMENTO ficou de fora: cada ENTRADA marcada virava uma "visita
     * aberta" fantasma na pilha, e a fechada media do reconhecimento repetido
     * ate a saida, nao da entrada real. Medido com o incidente do aluno
     * 0003053 (E12:49 · E12:51 JP · E12:54 JP · S13:10): o card do CDI dizia
     * 4 visitas com media de 16 min onde a verdade e 1 visita de 21 (+1 aberta).
     *
     * ⚠️ ASSIMETRICO como as consultas: pula ENTRADA marcada, NUNCA uma SAIDA.
     * A saida marcada (a do posto fixo, p.ex.) continua FECHANDO a visita —
     * esconde-la reabriria o defeito de ocupacao de 10/08 dentro do pareador.
     *
     * Espelha AccessLogRepository.REPETICOES via as constantes dos services —
     * uma flag nova de repeticao exige entrar aqui tambem, e o teste de guarda
     * do repositorio nao alcanca este Set (e Java, nao @Query).
     */
    private static final Set<String> FLAGS_DE_REPETICAO = Set.of(
            PostoFixoService.FLAG_POSTO_FIXO,
            PresencaAbertaService.FLAG_JA_PRESENTE);

    private static boolean entradaDeRepeticao(AccessLog log) {
        return log.getAction() == AccessAction.ENTRADA
                && log.getFlag() != null
                && FLAGS_DE_REPETICAO.contains(log.getFlag());
    }

    public List<Visit> visits(List<String> pointIds, LocalDateTime from, LocalDateTime to,
                              boolean incluirFuncionarios) {
        if (pointIds == null || pointIds.isEmpty()) return List.of();

        List<AccessLog> logs = accessLogRepository
                .findByPointIdInAndTimestampBetweenOrderByTimestampDesc(pointIds, from, to);
        if (logs.isEmpty()) return List.of();

        Set<String> permitidos = incluirFuncionarios ? null : idsDeAlunos(logs);

        // (usuário, ponto, dia) -> eventos em ordem CRESCENTE
        Map<String, List<AccessLog>> porChave = new LinkedHashMap<>();
        for (AccessLog log : logs) {
            if (log.getUserId() == null) continue;
            if (permitidos != null && !permitidos.contains(log.getUserId())) continue;
            LocalDate dia = log.getTimestamp().toLocalDate();
            String chave = log.getUserId() + "|" + log.getPointId() + "|" + dia;
            porChave.computeIfAbsent(chave, k -> new ArrayList<>()).add(log);
        }

        List<Visit> visitas = new ArrayList<>();
        for (List<AccessLog> eventos : porChave.values()) {
            eventos.sort(Comparator.comparing(AccessLog::getTimestamp)
                    .thenComparing(AccessLog::getId, Comparator.nullsLast(Comparator.naturalOrder())));

            AccessLog entradaAberta = null;
            for (AccessLog e : eventos) {
                // Repeticao marcada nao abre visita — a pessoa ja esta dentro
                // (JA_PRESENTE) ou trabalha ali (POSTO_FIXO). Pular ANTES do
                // ramo de ENTRADA e o que impede a visita fantasma; a SAIDA
                // nunca e pulada (assimetria — ver o comentario do Set).
                if (entradaDeRepeticao(e)) continue;
                if (e.getAction() == AccessAction.ENTRADA) {
                    // Duas ENTRADAs seguidas: a anterior ficou sem saída.
                    if (entradaAberta != null) {
                        visitas.add(new Visit(entradaAberta.getUserId(), entradaAberta.getPointId(),
                                entradaAberta.getTimestamp(), null, false));
                    }
                    entradaAberta = e;
                } else if (e.getAction() == AccessAction.SAIDA && entradaAberta != null) {
                    visitas.add(new Visit(entradaAberta.getUserId(), entradaAberta.getPointId(),
                            entradaAberta.getTimestamp(), e.getTimestamp(),
                            PresenceAutoCloseService.FLAG_FECHAMENTO.equals(e.getFlag())));
                    entradaAberta = null;
                }
                // SAIDA sem ENTRADA aberta: ignorada — não há visita para fechar.
            }
            if (entradaAberta != null) {
                visitas.add(new Visit(entradaAberta.getUserId(), entradaAberta.getPointId(),
                        entradaAberta.getTimestamp(), null, false));
            }
        }
        return visitas;
    }

    /**
     * Matrículas dos logs que pertencem a ALUNO.
     *
     * Consulta só os ids que aparecem nos logs, e não app_users inteiro: são
     * 1200 pessoas cadastradas para tipicamente algumas dezenas de passagens.
     * Id sem cadastro em app_users NÃO entra — não há como afirmar que é aluno.
     */
    private Set<String> idsDeAlunos(List<AccessLog> logs) {
        Set<String> ids = new HashSet<>();
        logs.forEach(l -> { if (l.getUserId() != null) ids.add(l.getUserId()); });

        Map<String, UserType> tipos = new HashMap<>();
        userRepository.findAllById(ids).forEach(u -> tipos.put(u.getId(), u.getTipo()));

        Set<String> alunos = new HashSet<>();
        tipos.forEach((id, tipo) -> { if (tipo == UserType.ALUNO) alunos.add(id); });
        return alunos;
    }

    /** Tipos de usuário considerados "servidor" para o filtro das telas. */
    public static boolean ehServidor(User u) {
        return u != null && (u.getTipo() == UserType.PROFESSOR || u.getTipo() == UserType.FUNCIONARIO);
    }
}
