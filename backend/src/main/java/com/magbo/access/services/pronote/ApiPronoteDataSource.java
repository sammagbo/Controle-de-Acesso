package com.magbo.access.services.pronote;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

/**
 * STUB — Pronote REST API data source.
 * Not yet implemented: waiting on Index Education API credentials from IT.
 * When credentials arrive, implement fetchLines() to call the Pronote API
 * and map the response into the same 12-column line format used by the CSV.
 */
@Component("apiPronoteDataSource")
@Slf4j
public class ApiPronoteDataSource implements PronoteDataSource {

    @Value("${pronote.api.url:}")
    private String apiUrl;

    @Value("${pronote.api.token:}")
    private String apiToken;

    @Override
    public boolean isAvailable() {
        return apiUrl != null && !apiUrl.isBlank()
            && apiToken != null && !apiToken.isBlank();
    }

    @Override
    public List<String> fetchLines() throws Exception {
        // TODO: implement when Pronote API credentials are available.
        // 1. Authenticate against apiUrl using apiToken
        // 2. GET students + guardians
        // 3. Map each student to a line:
        //    userId;nome;tipo;turma;respId;respNome;respParentesco;respTelefone;resp2Id;resp2Nome;resp2Parentesco;resp2Telefone
        // 4. Prepend a header line
        log.warn("ApiPronoteDataSource not implemented yet — no API credentials configured.");
        return Collections.emptyList();
    }

    @Override
    public void onSyncComplete() {
        // No-op for API (nothing to rename).
    }

    @Override
    public String describe() {
        return "API[" + (apiUrl == null || apiUrl.isBlank() ? "not configured" : apiUrl) + "]";
    }
}
