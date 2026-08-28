package com.magbo.access.services;

import com.magbo.access.models.CdiAlertEvent;
import com.magbo.access.repositories.CdiAlertEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

/**
 * O REGISTRO das alertas mostradas no ecra do CDI.
 *
 * ⚠️ OBSERVACIONAL ATE AO FIM: este service escreve em REQUIRES_NEW e quem o
 * chama APANHA a excecao — o motivo de sempre dos registros de apoio (o
 * fechamento automatico, as attempts): um registro que cai nunca pode
 * derrubar o que estava a acontecer a volta dele. Hoje o unico chamador e um
 * endpoint dedicado, fora de qualquer transacao de passagem; o REQUIRES_NEW
 * fica porque o PROXIMO chamador pode ser o webhook, e a anotacao e a
 * diferenca entre «ja esta certo» e «alguem vai descobrir na VM».
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CdiAlertService {

    /** ⚠️ Espelha o CHECK manual da V026 — valor novo = migracao nova, na MESMA entrega. */
    public static final Set<String> TIPOS = Set.of("EXCLUSION", "CAPACITE", "FERME");

    /**
     * O historico nao e um relatorio paginado: e «o que aconteceu ultimamente».
     * 500 linhas cobrem meses ao volume esperado (poucas por dia).
     */
    static final int TETO_HISTORICO = 500;

    /**
     * A mesma folga do EventTimeResolver: um eventTime no futuro e relogio
     * errado do cliente, e um registro com hora do futuro envenena a ordenacao
     * do historico para sempre.
     */
    static final Duration FOLGA_FUTURO = Duration.ofMinutes(5);

    private final CdiAlertEventRepository repository;

    /** Trocavel em teste (ReflectionTestUtils), como no CantineRemovalService. */
    private Clock clock = Clock.system(EventTimeResolver.ZONA_ESCOLA);

    /**
     * Grava UMA alerta mostrada. Lanca IllegalArgumentException para dado
     * invalido — e o chamador decide o que fazer com isso (o endpoint devolve
     * 400; um futuro chamador interno apanha e segue).
     *
     * @param eventTime ⚠️ a hora do BADGE que disparou a alerta. Nula ou no
     *                  futuro alem da folga → substituida pela hora atual, com
     *                  linha INFO — melhor um registro com hora aproximada e
     *                  marcada do que nenhum registro ou um registro do futuro.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public CdiAlertEvent registrar(String tipo, String userId, String nomeSnapshot,
                                   String pointId, LocalDateTime eventTime, String detalhe,
                                   String quem) {
        if (tipo == null || !TIPOS.contains(tipo)) {
            throw new IllegalArgumentException("tipo de alerta desconhecido: " + tipo);
        }
        if (pointId == null || pointId.isBlank()) {
            throw new IllegalArgumentException("pointId obrigatorio");
        }
        // ⚠️ O autor vem do CHAMADOR (principal autenticado), nunca do corpo:
        // uma linha sem autor num registro probatorio nao e prova de nada.
        if (quem == null || quem.isBlank()) {
            throw new IllegalArgumentException("quem obrigatorio");
        }
        LocalDateTime agora = LocalDateTime.now(clock);
        LocalDateTime quando = eventTime;
        if (quando == null || quando.isAfter(agora.plus(FOLGA_FUTURO))) {
            log.info("CDI alerta: eventTime {} substituido pela hora atual (tipo={}, ponto={})",
                    quando == null ? "ausente" : quando, tipo, pointId);
            quando = agora;
        }
        return repository.save(CdiAlertEvent.builder()
                .tipo(tipo)
                .userId(corta(userId, 64))
                .nomeSnapshot(corta(nomeSnapshot, 255))
                .pointId(pointId.trim())
                .eventTime(quando)
                .detalhe(corta(detalhe, 255))
                .criadoPor(quem.trim())
                .criadoEm(agora)
                .build());
    }

    /** O historico, mais recente primeiro, com teto. */
    @Transactional(readOnly = true)
    public List<CdiAlertEvent> historico() {
        return repository.findAllByOrderByEventTimeDesc(PageRequest.of(0, TETO_HISTORICO));
    }

    private static String corta(String v, int max) {
        if (v == null || v.isBlank()) return null;
        String t = v.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
