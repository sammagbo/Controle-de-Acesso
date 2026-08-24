package com.magbo.access.services;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.repositories.AccessAttemptRepository;
import com.magbo.access.repositories.AccessLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * MESMA PASSAGEM — a mesma pessoa lida duas vezes pelo terminal em segundos.
 *
 * Producao 03/08/2026: mesmo aluno, ENTRADA as 10:06:50 e de novo as 10:06:51.
 * Duas linhas em access_logs para uma unica passagem — o suficiente para
 * inflar contagem de movimentos, duplicar refeicao no relatorio e baguncar
 * qualquer calculo de permanencia.
 *
 * TERCEIRA camada de dedup do sistema, e as tres sao coisas diferentes — nao
 * substituem uma a outra:
 *
 *   1. {@link WebhookIngestionDedupService} — INFRAESTRUTURA. O aparelho
 *      reenviou o MESMO pacote (mesmo serialNo) porque o destino falhou.
 *   2. {@link DeduplicationService} — NEGOCIO da cantina. A pessoa quer uma
 *      segunda refeicao no mesmo dia (janela de 90s, politica configuravel).
 *   3. esta — LEITURA REPETIDA. O terminal reconheceu a mesma face duas vezes;
 *      sao eventos DIFERENTES, com serialNo novo, entao o dedup de ingestao
 *      deixa passar corretamente. Nao ha nada de errado com o pacote: o que se
 *      repete e a passagem fisica.
 *
 * Chave: pessoa + ponto + ACAO. A acao entra de proposito — ENTRADA seguida de
 * SAIDA no mesmo minuto e uma pessoa que entrou e saiu, nao uma leitura
 * repetida, e tem que continuar valendo.
 *
 * Janela fechada dos DOIS lados do instante do evento, nao so para tras: desde
 * que o backend grava a hora do EVENTO (e nao a da recepcao), uma fila offline
 * esvaziada entrega eventos fora de ordem, e o repetido pode chegar com hora
 * anterior a do que ja esta no banco.
 *
 * ⚠️⚠️ A CONSULTA AO BANCO NAO BASTA, E A CANTINA PROVOU ISSO EM 24/08/2026.
 *
 * A cantina tem QUATRO aparelhos num unico ponto: .10 e .12 na entrada, .13 e
 * .14 na saida. Duas pessoas passaram e cada uma foi lida por DOIS aparelhos:
 *
 *   09:02:42,317  FUNC-042  REFEI1 SAIDA   (do .13)
 *   09:02:42,538  FUNC-042  REFEI1 SAIDA   (do .14)   +221 ms
 *   09:04:29,589  FUNC-001  REFEI1 SAIDA   (do .14)
 *   09:04:29,974  FUNC-001  REFEI1 SAIDA   (do .13)   +385 ms
 *
 * As duas linhas de cada par ficaram no banco com O MESMO instante de evento,
 * dentro da janela — a regra estava certa e mesmo assim nao pegou. O motivo e
 * que {@link #alreadyRegistered} le o BANCO, e {@code process()} e
 * {@code @Transactional}: quando o segundo pedido consulta, o primeiro ainda
 * NAO COMMITOU. Duas transacoes concorrentes leem "nao existe" e ambas gravam.
 * E o classico ler-depois-escrever, e nenhuma janela o resolve — 30 s ou 300 s
 * dariam o mesmo resultado, porque o problema nao e o tamanho da janela.
 *
 * O CDI nunca viu isto: la ha UM leitor por sentido, entao nunca ha duas
 * transacoes concorrentes para a mesma pessoa, ponto e acao.
 *
 * Por isso existe {@link #reservar}: uma reserva ATOMICA em memoria, feita
 * antes de gravar, que fecha a corrida sem inventar janela nova — ela usa
 * exatamente a mesma. A consulta ao banco continua e continua necessaria: ela
 * cobre o que a memoria nao cobre (reinicio do processo, e a janela inteira
 * depois de a reserva expirar).
 */
@Service
@RequiredArgsConstructor
public class SamePassageService {

    private final AccessLogRepository accessLogRepository;
    private final AccessAttemptRepository accessAttemptRepository;

    @Value("${magbo.same-passage-window-seconds:30}")
    private long windowSeconds;

    /** Janela em segundos — entra na linha de log da supressao. */
    public long windowSeconds() {
        return windowSeconds;
    }

    /**
     * Ja existe ACESSO ACEITO desta pessoa, neste ponto, nesta acao, dentro da
     * janela?
     *
     * Sem chave completa (usuario, ponto ou acao ausentes) devolve false: sem
     * chave confiavel nao se descarta evento — mesma regra do dedup de
     * ingestao, e pelo mesmo motivo (nunca arriscar perder passagem real).
     */
    public boolean alreadyRegistered(String userId, String pointId, AccessAction action,
                                     LocalDateTime eventTime) {
        if (!keyUsavel(userId, pointId, action, eventTime)) return false;
        return accessLogRepository.existsByUserIdAndPointIdAndActionAndTimestampBetween(
                userId, pointId, action, eventTime.minusSeconds(windowSeconds),
                eventTime.plusSeconds(windowSeconds));
    }

    /**
     * Mesma pergunta do lado das NEGADAS, incluindo o resultado: repetir a
     * leitura repete a negativa, e a segunda linha nao acrescenta nada a
     * auditoria. Motivo diferente = fato diferente, e passa.
     */
    public boolean alreadyAttempted(String employeeNoRaw, String pointId, AccessAction action,
                                    AuthorizationResult authorizationResult, DenialReason denialReason,
                                    LocalDateTime eventTime) {
        if (!keyUsavel(employeeNoRaw, pointId, action, eventTime)) return false;
        if (authorizationResult == null || denialReason == null) return false;
        return accessAttemptRepository
                .existsByEmployeeNoRawAndPointIdAndActionAndAuthorizationResultAndDenialReasonAndTimestampBetween(
                        employeeNoRaw, pointId, action, authorizationResult, denialReason,
                        eventTime.minusSeconds(windowSeconds), eventTime.plusSeconds(windowSeconds));
    }

    /**
     * De que LISTA se esta a falar.
     *
     * ⚠️ HOJE SO `ACESSO` ESTA LIGADO, e e preciso dizer isto por extenso em vez
     * de deixar um enum a sugerir mais do que existe.
     *
     * A corrida medida em producao (24/08/2026) duplicou linhas em
     * `access_logs`, nao em `access_tentativas` — as tentativas do mesmo dia
     * tinham instantes e motivos diferentes, e nenhuma estava duplicada. Ligar a
     * reserva tambem no lado das negadas mexia no colapso DELIBERADO da camara
     * da portaria (`processCameraDenied`), que tem semantica propria e oito
     * testes a fixa-la — e partiu-os todos. Trocar um defeito medido por um
     * risco em codigo que funciona nao e negocio.
     *
     * `TENTATIVA` fica declarado porque, no dia em que a cantina duplicar tambem
     * do lado das negadas, a chave TEM de ser separada: com um escopo unico,
     * uma tentativa NEGADA reservaria a passagem e faria descartar o acesso
     * ACEITE da mesma pessoa segundos depois — e nesse par o que se perderia era
     * justamente a linha que conta.
     */
    public enum Escopo { ACESSO, TENTATIVA }

    /**
     * Reservas em voo: chave -> instantes de evento ja reclamados.
     *
     * ⚠️ ConcurrentHashMap com {@code compute}, que e ATOMICO POR CHAVE — e e
     * disso que se trata. Um {@code containsKey} seguido de {@code put} teria a
     * mesma corrida que a consulta ao banco tem, so que mais rapida.
     */
    private final ConcurrentHashMap<String, List<Reserva>> reservas = new ConcurrentHashMap<>();

    /** Instante de evento reclamado, e quando (relogio de parede) foi reclamado. */
    private record Reserva(LocalDateTime eventTime, long emNanos) {}

    /**
     * Ja ha uma passagem igual EM VOO? Reclama-a se nao houver.
     *
     * Devolve {@code true} quando outra igual ja estava reclamada — e ai a
     * chamadora descarta o evento, tal como faz com a repetida do banco.
     *
     * ⚠️ O SENTIDO DA RESPOSTA E O DAS IRMAS ({@link #alreadyRegistered},
     * {@link #alreadyAttempted}): "true" quer dizer REPETIDA. A primeira versao
     * devolvia o contrario — "true" = pode gravar — e isso derrubou 95 testes de
     * uma vez, porque um mock de Mockito devolve `false` por omissao: em todo
     * teste que estubava este servico, "pode gravar" passava a ser NAO, e o
     * sistema deixava de registar tudo. Um contrato cujo valor por omissao e o
     * perigoso e um contrato mal escrito; com este sentido, o mock nao estubado
     * responde "nao e repetida" e o caminho normal continua a valer.
     *
     * ⚠️ A RESERVA GUARDA O INSTANTE DO EVENTO, nao so a chave, e isto e o que
     * protege a FILA OFFLINE. Em 03/08/2026 um aparelho esvaziou 33 eventos de
     * uma vez: mesma pessoa, mesmo ponto, mesma acao, horas de intervalo entre
     * eles, todos chegando no mesmo segundo. Uma reserva por chave e TTL de
     * relogio de parede teria engolido 32 passagens reais. Comparando o instante
     * do EVENTO, elas passam todas — que e o comportamento que a consulta ao
     * banco ja tinha e que nao se pode perder ao fechar a corrida.
     *
     * ⚠️ MEMORIA DE UM PROCESSO SO. Com duas instancias do backend atras de um
     * balanceador, cada uma teria o seu mapa e a corrida voltaria entre elas. O
     * projeto roda uma instancia (deploy/docker-compose.yml, um servico
     * `backend`); no dia em que isso mudar, isto precisa de um lock partilhado
     * ou de uma restricao no banco, e este paragrafo e o aviso.
     */
    public boolean alreadyClaimed(Escopo escopo, String identidade, String pointId, AccessAction action,
                                  LocalDateTime eventTime) {
        if (!keyUsavel(identidade, pointId, action, eventTime)) return false;

        final String chave = escopo + "|" + identidade + "|" + pointId + "|" + action;
        final long agora = System.nanoTime();
        // Guardado o dobro da janela: tempo de sobra para o commit acontecer e a
        // consulta ao banco assumir o servico.
        final long ttlNanos = Duration.ofSeconds(windowSeconds * 2).toNanos();

        final boolean[] repetida = { false };
        final boolean[] reclamadaAgora = { false };
        reservas.compute(chave, (k, atuais) -> {
            List<Reserva> vivas = new ArrayList<>();
            if (atuais != null) {
                for (Reserva r : atuais) {
                    if (agora - r.emNanos() < ttlNanos) vivas.add(r);
                }
            }
            for (Reserva r : vivas) {
                if (Math.abs(Duration.between(r.eventTime(), eventTime).toSeconds()) <= windowSeconds) {
                    repetida[0] = true;
                    return vivas;   // ja reclamada: nada a acrescentar
                }
            }
            vivas.add(new Reserva(eventTime, agora));
            reclamadaAgora[0] = true;
            return vivas;
        });

        // ⚠️⚠️ A RESERVA VIVE O TEMPO DA TRANSACAO, NEM MAIS NEM MENOS.
        //
        // Ela existe para cobrir UM intervalo: o que vai da consulta ao banco
        // ate ao commit. Depois do commit e a consulta que responde, e a reserva
        // deixa de ser precisa; se a transacao NAO commitar, guardar a reserva
        // seria pior do que nao a ter.
        //
        // Este segundo caso e real e nao teorico: quando a gravacao falha, o
        // aparelho reenvia (comportamento observado duas vezes neste projeto).
        // Com a reserva presa 60 s, todas as retentativas dentro desse minuto
        // seriam descartadas em silencio — o defeito que se estava a corrigir,
        // virado do avesso, e a passagem perdia-se de vez.
        //
        // Apanhado pela suite: mais de 50 testes de integracao passaram a
        // falhar em conjunto e a passar isolados. Eles correm em transacao com
        // rollback e reutilizam a mesma pessoa e ponto; a reserva sobrevivia ao
        // rollback e engolia o teste seguinte. Um teste que so falha quando
        // corre acompanhado estava a dizer exatamente isto.
        if (reclamadaAgora[0] && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    libertar(chave, eventTime);
                }
            });
        }

        // O mapa so cresce com chaves ativas; uma chave que ficou sem reservas
        // vivas sai daqui. Sem isto, um dia de aula deixaria ~1000 chaves mortas.
        reservas.computeIfPresent(chave, (k, v) -> v.isEmpty() ? null : v);
        return repetida[0];
    }

    /** Larga uma reserva concreta (a transacao terminou, commitada ou nao). */
    private void libertar(String chave, LocalDateTime eventTime) {
        reservas.computeIfPresent(chave, (k, vivas) -> {
            vivas.removeIf(r -> r.eventTime().equals(eventTime));
            return vivas.isEmpty() ? null : vivas;
        });
    }

    /** Esquece todas as reservas. Existe para os testes, nao para producao. */
    public void limparReservas() {
        reservas.clear();
    }

    /** windowSeconds <= 0 desliga a regra sem recompilar (kill-switch). */
    private boolean keyUsavel(String identidade, String pointId, AccessAction action, LocalDateTime eventTime) {
        return windowSeconds > 0
                && identidade != null && !identidade.isBlank()
                && pointId != null && !pointId.isBlank()
                && action != null
                && eventTime != null;
    }
}
