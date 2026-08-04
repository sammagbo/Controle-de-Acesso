package com.magbo.access.services;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.repositories.AccessAttemptRepository;
import com.magbo.access.repositories.AccessLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

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

    /** windowSeconds <= 0 desliga a regra sem recompilar (kill-switch). */
    private boolean keyUsavel(String identidade, String pointId, AccessAction action, LocalDateTime eventTime) {
        return windowSeconds > 0
                && identidade != null && !identidade.isBlank()
                && pointId != null && !pointId.isBlank()
                && action != null
                && eventTime != null;
    }
}
