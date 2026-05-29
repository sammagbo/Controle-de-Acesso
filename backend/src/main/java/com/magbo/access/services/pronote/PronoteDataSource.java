package com.magbo.access.services.pronote;

import java.util.List;

/**
 * Source of Pronote data lines (12-column ';'-separated format).
 * Implementations: CSV file (current) or REST API (future).
 */
public interface PronoteDataSource {

    /** Returns true if this source has data available to sync. */
    boolean isAvailable();

    /**
     * Returns the data lines INCLUDING the header line as first element.
     * Format per line: userId;nome;tipo;turma;respId;respNome;respParentesco;respTelefone;resp2Id;resp2Nome;resp2Parentesco;resp2Telefone
     */
    List<String> fetchLines() throws Exception;

    /** Called after a successful sync (errors==0). CSV renames to .processed; API may no-op. */
    void onSyncComplete() throws Exception;

    /** Human-readable identifier of the source (for logs/report). */
    String describe();
}
