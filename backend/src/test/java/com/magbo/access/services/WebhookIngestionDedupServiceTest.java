package com.magbo.access.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unitario puro do cache de dedup de ingestao (sem Spring).
 */
class WebhookIngestionDedupServiceTest {

    private static final String IP = "172.20.40.10";

    private WebhookIngestionDedupService service(boolean enabled, long ttlSeconds, int maxEntries) {
        return new WebhookIngestionDedupService(enabled, ttlSeconds, maxEntries);
    }

    @Test
    @DisplayName("mesmo (ip, serial) dentro do TTL e duplicata")
    void duplicataDentroDoTtl() {
        WebhookIngestionDedupService s = service(true, 600, 100);
        assertThat(s.isDuplicateEvent(IP, 123L)).isFalse();
        assertThat(s.isDuplicateEvent(IP, 123L)).isTrue();
    }

    @Test
    @DisplayName("TTL vencido deixa de ser duplicata (ttl=0 expira imediatamente)")
    void ttlVencidoNaoEDuplicata() {
        WebhookIngestionDedupService s = service(true, 0, 100);
        assertThat(s.isDuplicateEvent(IP, 123L)).isFalse();
        assertThat(s.isDuplicateEvent(IP, 123L))
                .as("entrada com TTL 0 ja nasce vencida")
                .isFalse();
    }

    @Test
    @DisplayName("serialNo null nunca e duplicata")
    void serialNullNuncaDeduplica() {
        WebhookIngestionDedupService s = service(true, 600, 100);
        assertThat(s.isDuplicateEvent(IP, null)).isFalse();
        assertThat(s.isDuplicateEvent(IP, null)).isFalse();
    }

    @Test
    @DisplayName("chave inclui o IP: mesmo serial de outro IP nao e duplicata")
    void chaveIncluiIp() {
        WebhookIngestionDedupService s = service(true, 600, 100);
        assertThat(s.isDuplicateEvent(IP, 123L)).isFalse();
        assertThat(s.isDuplicateEvent("172.20.40.99", 123L)).isFalse();
    }

    @Test
    @DisplayName("namespaces separados: unknown nao envenena evento de acesso com o mesmo serial")
    void namespacesSeparados() {
        WebhookIngestionDedupService s = service(true, 600, 100);
        assertThat(s.isDuplicateUnknown(IP, 42L)).isFalse();
        assertThat(s.isDuplicateEvent(IP, 42L))
                .as("um LocalUserChange anterior nao pode calar um evento de acesso real")
                .isFalse();
        assertThat(s.isDuplicateUnknown(IP, 42L)).isTrue();
    }

    @Test
    @DisplayName("desligado por property: nada e duplicata, mas o limitador de heartbeat continua")
    void desligadoNaoDeduplica() {
        WebhookIngestionDedupService s = service(false, 600, 100);
        assertThat(s.isDuplicateEvent(IP, 123L)).isFalse();
        assertThat(s.isDuplicateEvent(IP, 123L)).isFalse();
        assertThat(s.heartbeatInfoDue(IP)).isTrue();
        assertThat(s.heartbeatInfoDue(IP))
                .as("higiene de log nao desliga junto com o dedup de eventos")
                .isFalse();
    }

    @Test
    @DisplayName("heartbeat: INFO devido so uma vez por janela")
    void heartbeatInfoUmaVezPorJanela() {
        WebhookIngestionDedupService s = service(true, 600, 100);
        assertThat(s.heartbeatInfoDue(IP)).isTrue();
        assertThat(s.heartbeatInfoDue(IP)).isFalse();
        assertThat(s.heartbeatInfoDue("172.20.40.99"))
                .as("janela e por aparelho")
                .isTrue();
    }

    @Test
    @DisplayName("cache e limitado: nunca cresce alem de maxEntries")
    void cacheLimitado() {
        WebhookIngestionDedupService s = service(true, 600, 10);
        for (long serial = 0; serial < 50; serial++) {
            s.isDuplicateEvent(IP, serial);
        }
        assertThat(s.cacheSize()).isLessThanOrEqualTo(10);
    }

    @Test
    @DisplayName("clear() zera o estado (isolamento entre testes)")
    void clearZeraEstado() {
        WebhookIngestionDedupService s = service(true, 600, 100);
        s.isDuplicateEvent(IP, 123L);
        s.clear();
        assertThat(s.isDuplicateEvent(IP, 123L)).isFalse();
    }
}
