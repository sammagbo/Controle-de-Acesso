package com.magbo.access.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Dedup de INGESTAO do webhook — camada anterior e independente do
 * {@link DeduplicationService} (aquele e regra de negocio: pessoa/ponto na
 * cantina; este e protecao de infraestrutura: reentrega do mesmo pacote).
 *
 * Motivo: os MinMoe enfileiram e reenviam eventos quando o destino falha
 * (observado 2x em bancada) e a DeepinView entra em loop de ~1 req/s
 * (tcpdump 28/07/2026). Reentregas repetem o serialNo do aparelho; a chave
 * (IP de origem, serialNo) identifica o pacote reentregue sem nenhum risco
 * para eventos legitimos, que recebem serial novo.
 *
 * Janela DESLIZANTE por design: cada hit renova o TTL, entao um aparelho
 * preso em loop continuo fica suprimido enquanto o loop durar — se a janela
 * fosse fixa, a cada expiracao uma reentrega antiga voltaria a virar linha de
 * log e escrita no banco.
 *
 * TAMANHO DA JANELA (magbo.ingestion-dedup.ttl-seconds, default 60s): dimensionada
 * pelos dois lados do risco. Piso: o loop observado reenvia a ~1 req/s, entao 60s
 * cobre a reentrega com folga de duas ordens de grandeza. Teto: 60s e curto o
 * bastante para que a janela nunca alcance duas passagens REAIS da mesma pessoa
 * — ninguem entra duas vezes em menos de um minuto. Janelas longas (a primeira
 * versao usava 10 min) trocam esse teto por nada: o serialNo ja distingue evento
 * novo de reentrega, e o unico efeito de esticar e ampliar o estrago se o
 * numerador do aparelho reiniciar (reset/troca de firmware) e repetir um serial
 * antigo — nesse caso a janela curta perde no maximo 60s de eventos, nao 10 min.
 *
 * O limitador de INFO de heartbeat tem janela PROPRIA
 * (magbo.ingestion-dedup.heartbeat-log-seconds, default 600s): e higiene de log,
 * nao dedup de evento, e nao deve encurtar junto — com heartbeat a cada ~30s,
 * amarra-lo ao TTL de 60s devolveria ~1400 linhas/dia por aparelho.
 *
 * Cache em memoria, limitado: estado perdido (restart, evicao) so custa uma
 * linha de log ou um reprocesso pontual — nunca perde evento.
 */
@Service
public class WebhookIngestionDedupService {

    private static final String SCOPE_EVENT = "evt:";
    private static final String SCOPE_UNKNOWN = "unk:";
    private static final String SCOPE_HEARTBEAT = "hb:";
    private static final String SCOPE_CAMERA = "cam:";

    private final boolean enabled;
    private final long ttlSeconds;
    private final long ttlNanos;
    private final long heartbeatLogNanos;
    private final int maxEntries;

    /** chave -> instante (nanoTime) em que a entrada expira. */
    private final ConcurrentHashMap<String, Long> seenUntil = new ConcurrentHashMap<>();

    public WebhookIngestionDedupService(
            @Value("${magbo.ingestion-dedup.enabled:true}") boolean enabled,
            @Value("${magbo.ingestion-dedup.ttl-seconds:60}") long ttlSeconds,
            @Value("${magbo.ingestion-dedup.heartbeat-log-seconds:600}") long heartbeatLogSeconds,
            @Value("${magbo.ingestion-dedup.max-entries:10000}") int maxEntries) {
        this.enabled = enabled;
        this.ttlSeconds = ttlSeconds;
        this.ttlNanos = ttlSeconds * 1_000_000_000L;
        this.heartbeatLogNanos = heartbeatLogSeconds * 1_000_000_000L;
        this.maxEntries = maxEntries;
    }

    /** Janela de dedup em segundos — entra na linha de log do descarte. */
    public long ttlSeconds() {
        return ttlSeconds;
    }

    /**
     * true se este (IP de origem, serialNo) ja foi ingerido dentro do TTL.
     * Sem serialNo nao ha chave confiavel — nunca deduplica (nunca arriscar
     * descartar evento legitimo).
     */
    public boolean isDuplicateEvent(String sourceIp, Long serialNo) {
        if (!enabled || serialNo == null) return false;
        return seenSliding(SCOPE_EVENT + sourceIp + "|" + serialNo);
    }

    /**
     * Mesma regra para as CAMERAS da portaria, cuja chave e TEXTO (faceId/pId)
     * e nao um numerador — elas nao mandam serialNo.
     *
     * NAMESPACE proprio pela mesma razao do isDuplicateUnknown: um faceId de
     * camera e um serialNo de terminal podem coincidir como string, e um evento
     * de acesso jamais pode sumir por causa da colisao.
     */
    public boolean isDuplicateCameraEvent(String sourceIp, String eventKey) {
        if (!enabled || eventKey == null || eventKey.isBlank()) return false;
        return seenSliding(SCOPE_CAMERA + sourceIp + "|" + eventKey);
    }

    /**
     * Mesma regra, em NAMESPACE separado, para eventos de tipo desconhecido
     * (ex.: part LocalUserChange). Separado de proposito: o serialNo desses
     * eventos pode colidir com o numerador dos eventos de acesso do mesmo
     * aparelho, e um evento de acesso real jamais pode ser descartado por
     * causa de um LocalUserChange anterior.
     */
    public boolean isDuplicateUnknown(String sourceIp, Long serialNo) {
        if (!enabled || serialNo == null) return false;
        return seenSliding(SCOPE_UNKNOWN + sourceIp + "|" + serialNo);
    }

    /**
     * true no maximo uma vez por aparelho por janela de heartbeat — limita o
     * INFO de heartbeat a um por aparelho a cada 10 min (janela FIXA: o proximo
     * INFO sai quando a janela vence, mesmo com heartbeats continuos no meio).
     *
     * Usa heartbeatLogNanos, NAO o TTL do dedup: encurtar a janela de dedup
     * para 60s e uma decisao sobre descarte de evento; o volume de log de
     * heartbeat (um a cada ~30s por aparelho) nao pode vir de carona.
     *
     * NAO consulta o kill-switch `enabled` de proposito: ele governa descarte
     * de EVENTOS (dado); isto e higiene de LOG. Desligar o dedup nao pode
     * devolver o spam de heartbeat.
     */
    public boolean heartbeatInfoDue(String sourceIp) {
        long now = System.nanoTime();
        boundIfNeeded(now);
        String key = SCOPE_HEARTBEAT + sourceIp;
        Long prev = seenUntil.get(key);
        if (prev != null && prev > now) {
            return false;
        }
        seenUntil.put(key, now + heartbeatLogNanos);
        return true;
    }

    /** Esvazia o cache — isolamento entre testes (AbstractIT). */
    public void clear() {
        seenUntil.clear();
    }

    /** Tamanho atual do cache — asserção do teste de bounding. */
    public int cacheSize() {
        return seenUntil.size();
    }

    /** Registra o hit e renova o TTL (janela deslizante); true se ja era conhecido e valido. */
    private boolean seenSliding(String key) {
        long now = System.nanoTime();
        boundIfNeeded(now);
        Long prev = seenUntil.put(key, now + ttlNanos);
        return prev != null && prev > now;
    }

    /**
     * Mantem o cache limitado: ao atingir maxEntries, primeiro descarta os
     * expirados; se ainda estiver cheio (anomalia — 10k eventos vivos dentro da
     * janela nao acontece com ~5 aparelhos), derruba a metade mais antiga.
     */
    private void boundIfNeeded(long now) {
        if (seenUntil.size() < maxEntries) return;
        seenUntil.values().removeIf(expiry -> expiry <= now);
        if (seenUntil.size() < maxEntries) return;
        List<Map.Entry<String, Long>> entries = new ArrayList<>(seenUntil.entrySet());
        entries.sort(Map.Entry.comparingByValue());
        for (int i = 0; i < entries.size() / 2; i++) {
            seenUntil.remove(entries.get(i).getKey());
        }
    }
}
