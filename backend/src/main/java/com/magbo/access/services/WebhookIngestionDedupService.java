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
 * Cache em memoria, limitado: estado perdido (restart, evicao) so custa uma
 * linha de log ou um reprocesso pontual — nunca perde evento.
 */
@Service
public class WebhookIngestionDedupService {

    private static final String SCOPE_EVENT = "evt:";
    private static final String SCOPE_UNKNOWN = "unk:";
    private static final String SCOPE_HEARTBEAT = "hb:";

    private final boolean enabled;
    private final long ttlNanos;
    private final int maxEntries;

    /** chave -> instante (nanoTime) em que a entrada expira. */
    private final ConcurrentHashMap<String, Long> seenUntil = new ConcurrentHashMap<>();

    public WebhookIngestionDedupService(
            @Value("${magbo.ingestion-dedup.enabled:true}") boolean enabled,
            @Value("${magbo.ingestion-dedup.ttl-seconds:600}") long ttlSeconds,
            @Value("${magbo.ingestion-dedup.max-entries:10000}") int maxEntries) {
        this.enabled = enabled;
        this.ttlNanos = ttlSeconds * 1_000_000_000L;
        this.maxEntries = maxEntries;
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
     * true no maximo uma vez por aparelho por TTL — limita o INFO de
     * heartbeat a um por aparelho a cada 10 min (janela FIXA: o proximo INFO
     * sai quando a janela vence, mesmo com heartbeats continuos no meio).
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
        seenUntil.put(key, now + ttlNanos);
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
     * expirados; se ainda estiver cheio (anomalia — 10k eventos vivos em 10
     * min nao acontece com ~5 aparelhos), derruba a metade mais antiga.
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
