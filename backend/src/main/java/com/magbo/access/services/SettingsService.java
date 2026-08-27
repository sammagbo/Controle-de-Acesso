package com.magbo.access.services;

import com.magbo.access.models.SystemSetting;
import com.magbo.access.repositories.SystemSettingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A SURCOUCHE DOS REGLAGES: valor do ecra quando existe, default do codigo
 * quando nao.
 *
 * ⚠️ O CONTRATO QUE TUDO AQUI SERVE: «default = comportamento atual». Uma base
 * sem nenhuma linha em `system_settings` comporta-se EXATAMENTE como antes da
 * V024 — os defaults continuam a ser as properties `magbo.*`, e este servico
 * so os cobre quando alguem mudou um valor pelo ecra.
 *
 * ⚠️ O CACHE EXISTE POR CAUSA DO WEBHOOK. `efetivo*` e consultado no caminho
 * mais critico do sistema (a decisao de cada passagem) e nao pode custar uma
 * ida ao banco por evento. Invalidacao na ESCRITA (ha uma instancia so) +
 * TTL de 15 s como rede de seguranca — se um dia houver duas instancias, o
 * pior caso e um reglage demorar 15 s a propagar, nunca um valor errado
 * para sempre.
 *
 * ⚠️ VALOR ILEGIVEL = DEFAULT + WARN, nunca excecao. Um «abc» gravado numa
 * chave numerica nao pode derrubar a decisao de uma passagem; ele volta ao
 * default e deixa uma linha no log a dizer qual chave esta podre.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SettingsService {

    private final SystemSettingRepository repository;

    /** Trocavel em teste (ReflectionTestUtils), como no CantineRemovalService. */
    private Clock clock = Clock.system(EventTimeResolver.ZONA_ESCOLA);

    private static final long TTL_MS = 15_000;
    private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();
    private volatile long cacheCarregadoEm = 0;

    private Map<String, String> mapa() {
        long agora = System.currentTimeMillis();
        if (agora - cacheCarregadoEm > TTL_MS) {
            synchronized (this) {
                if (agora - cacheCarregadoEm > TTL_MS) {
                    Map<String, String> fresco = new HashMap<>();
                    for (SystemSetting s : repository.findAll()) {
                        fresco.put(s.getChave(), s.getValor());
                    }
                    cache.clear();
                    cache.putAll(fresco);
                    cacheCarregadoEm = agora;
                }
            }
        }
        return cache;
    }

    /** O valor efetivo de uma chave texto. */
    public String efetivo(String chave, String padrao) {
        String v = mapa().get(chave);
        return (v == null || v.isBlank()) ? padrao : v;
    }

    /** O valor efetivo de uma chave inteira. Ilegivel -> default + WARN. */
    public int efetivoInt(String chave, int padrao) {
        String v = mapa().get(chave);
        if (v == null || v.isBlank()) return padrao;
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            log.warn("system_settings: chave {} tem valor nao numerico '{}' — a usar o default {}",
                    chave, v, padrao);
            return padrao;
        }
    }

    /** O valor efetivo de uma chave booleana ('true'/'false'). */
    public boolean efetivoBool(String chave, boolean padrao) {
        String v = mapa().get(chave);
        if (v == null || v.isBlank()) return padrao;
        return "true".equalsIgnoreCase(v.trim());
    }

    /**
     * Uma chave-CSV como conjunto NORMALIZADO (trim + maiusculas).
     *
     * E o formato das «turmas dispensadas de badge»: legivel no ecra, sem
     * tabela nova para uma lista que na pratica tera meia duzia de entradas.
     */
    public Set<String> efetivoCsv(String chave) {
        String v = mapa().get(chave);
        if (v == null || v.isBlank()) return Set.of();
        Set<String> out = new LinkedHashSet<>();
        for (String parte : v.split(",")) {
            String t = parte.trim().toUpperCase();
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }

    /**
     * Grava um reglage — e invalida o cache NA MESMA chamada.
     *
     * ⚠️ `valor` vazio ou null APAGA a linha: «voltar ao default» e uma acao
     * de primeira classe do ecra, nao um caso especial. Uma linha vazia que
     * ficasse na tabela cobriria o default com um branco.
     */
    @Transactional
    public void gravar(String chave, String valor, String quem) {
        if (chave == null || chave.isBlank()) throw new IllegalArgumentException("chave obrigatoria");
        if (quem == null || quem.isBlank()) throw new IllegalArgumentException("quem obrigatorio");
        String c = chave.trim();
        // ⚠️ 128 = a largura da coluna (V024). Sem esta guarda, uma chave mais
        // longa dava DataIntegrityViolationException — ou seja, HTTP 500 — em
        // vez do 400 que o resto do metodo produz.
        if (c.length() > 128) throw new IllegalArgumentException("chave demasiado longa (max 128)");
        if (valor == null || valor.isBlank()) {
            repository.deleteById(c);
            log.info("system_settings: {} volta ao default (por {})", c, quem);
        } else {
            String v = valor.trim();
            if (v.length() > 512) throw new IllegalArgumentException("valor demasiado longo (max 512)");
            repository.save(SystemSetting.builder()
                    .chave(c).valor(v).updatedBy(quem.trim())
                    .updatedAt(LocalDateTime.now(clock)).build());
            log.info("system_settings: {} = '{}' (por {})", c, v, quem);
        }
        cacheCarregadoEm = 0;   // proxima leitura recarrega
    }

    /** Todas as linhas gravadas (para o ecra de configuracao). */
    @Transactional(readOnly = true)
    public List<SystemSetting> gravados() {
        return repository.findAll(org.springframework.data.domain.Sort.by("chave"));
    }
}
