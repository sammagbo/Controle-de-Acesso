package com.magbo.access.services;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import com.magbo.access.models.AuthorizationResult;
import com.magbo.access.models.DenialReason;
import com.magbo.access.repositories.AccessAttemptRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccessAttemptService {

    private final AccessAttemptRepository accessAttemptRepository;
    private final SamePassageService samePassageService;

    /**
     * @param timestamp hora do EVENTO (dateTime do payload, ja resolvido pelo
     *                  EventTimeResolver), nao a hora em que o pacote chegou.
     *                  Uma fila offline esvaziada entrega tentativas de horas
     *                  atras, e uma tentativa negada carimbada com a hora da
     *                  recepcao mente na auditoria do mesmo jeito que um
     *                  access_log mentiria.
     * @return a tentativa gravada, ou <b>null</b> quando ela foi suprimida por
     *         ser repeticao da mesma passagem dentro da janela. Os chamadores
     *         atuais descartam o retorno; quem passar a usa-lo precisa tratar
     *         o null.
     */
    /**
     * Grava uma OBSERVACAO em transacao PROPRIA — e engole a falha.
     *
     * ⚠️ EXISTE PARA QUE UM REGISTRO DE APOIO NUNCA POSSA APAGAR A PROVA.
     *
     * O bloco do regime de sortie corre dentro do @Transactional que grava a
     * PASSAGEM. Uma observacao e informacao de apoio: ela nao decide nada, nao
     * nega ninguem e nao muda o que a porta faz. Mas, na mesma transacao, um
     * INSERT que falhe — o caso concreto e o CHECK de denial_reason ainda nao
     * conhecer o motivo novo, porque a V015 nao foi aplicada na VM — envenena a
     * transacao inteira e leva junto o `access_log` da crianca cruzando o
     * portao. A prova de que ela passou desapareceria por causa do aviso sobre
     * ela ter passado.
     *
     * Nao adianta try/catch no chamador: em Spring, a excecao ja marcou a
     * transacao como rollback-only, e capturar nao a despoluí. Por isso
     * REQUIRES_NEW — a observacao vive e morre sozinha.
     *
     * Documentar a ordem de deploy (aplicar a V015 antes de ligar a regra)
     * continua certo e continua no README; o que nao pode e a prova depender
     * de alguem ter lido o README. Painel de revisao, chef d'etablissement e
     * CPE, 14/08/2026.
     */
    @org.springframework.transaction.annotation.Transactional(
            propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void recordObservacaoIsolada(
        String userId, String employeeNoRaw, String nomeSnapshot, String pointId,
        AccessAction action, String terminalIp, AuthMethod authMethod, AuthResult authResult,
        AuthorizationResult authorizationResult, DenialReason denialReason,
        Integer hikvisionSubEventType, boolean doorMappingFallback, java.time.LocalDateTime eventTime) {
        try {
            record(userId, employeeNoRaw, nomeSnapshot, pointId, action, terminalIp,
                    authMethod, authResult, authorizationResult, denialReason,
                    hikvisionSubEventType, doorMappingFallback, eventTime);
        } catch (RuntimeException e) {
            // O aviso se perde; a passagem fica. E a troca certa: sem a linha de
            // observacao a Vie Scolaire nao ve um alerta; sem o access_log
            // ninguem sabe que a crianca saiu.
            log.error("Observação de regime NÃO gravada (a passagem foi preservada): user={}, motivo={}, erro={}",
                    userId, denialReason, e.toString());
        }
    }

    public AccessAttempt record(
        String userId,
        String employeeNoRaw,
        String nomeSnapshot,
        String pointId,
        AccessAction action,
        String terminalIp,
        AuthMethod authMethod,
        AuthResult authResult,
        AuthorizationResult authorizationResult,
        DenialReason denialReason,
        Integer hikvisionSubEventType,
        Boolean doorMappingFallback,
        LocalDateTime timestamp
    ) {
        if (employeeNoRaw == null || employeeNoRaw.isBlank()) {
            throw new IllegalArgumentException("employeeNoRaw must not be null or blank");
        }
        if (denialReason == null) {
            throw new IllegalArgumentException("denialReason must not be null");
        }

        // MESMA PASSAGEM (lado das negadas): leitura repetida da mesma face
        // repete a mesma negativa, e a segunda linha nao acrescenta nada a
        // auditoria — so infla `negadasHoje` e o feed do operador.
        // Aqui, e nao em cada um dos ~16 pontos de chamada do orquestrador:
        // este e o unico caminho por onde tentativa vira linha no banco.
        LocalDateTime quando = timestamp != null ? timestamp : LocalDateTime.now();
        if (samePassageService.alreadyAttempted(employeeNoRaw, pointId, action,
                authorizationResult, denialReason, quando)) {
            log.debug("Mesma passagem negada ignorada (raw={}, point={}, action={}, reason={}, janela={}s)",
                    employeeNoRaw, pointId, action, denialReason, samePassageService.windowSeconds());
            return null;
        }

        AccessAttempt attempt = AccessAttempt.builder()
                .userId(userId)
                .employeeNoRaw(employeeNoRaw)
                .nomeSnapshot(nomeSnapshot)
                .pointId(pointId)
                .action(action)
                .terminalIp(terminalIp)
                .authMethod(authMethod)
                .authResult(authResult)
                .authorizationResult(authorizationResult)
                .denialReason(denialReason)
                .hikvisionSubEventType(hikvisionSubEventType)
                .doorMappingFallback(doorMappingFallback)
                .timestamp(quando)
                .build();

        accessAttemptRepository.save(attempt);

        log.info("Access Attempt: user={}, raw={}, point={}, action={}, method={}, authResult={}, decision={}, reason={}, subType={}",
                 userId, employeeNoRaw, pointId, action, authMethod, authResult, authorizationResult, denialReason, hikvisionSubEventType);

        return attempt;
    }
}
