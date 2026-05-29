package com.magbo.access.services.pronote;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;

@Component("csvPronoteDataSource")
@Slf4j
public class CsvPronoteDataSource implements PronoteDataSource {

    @Value("${pronote.sync.filepath}")
    private String syncFilePath;

    @Override
    public boolean isAvailable() {
        return Files.exists(Paths.get(syncFilePath));
    }

    @Override
    public List<String> fetchLines() throws Exception {
        Path path = Paths.get(syncFilePath);
        if (!Files.exists(path)) {
            log.warn("Nenhum ficheiro para sincronizar: {}", syncFilePath);
            return Collections.emptyList();
        }
        return Files.readAllLines(path);
    }

    @Override
    public void onSyncComplete() throws Exception {
        Path path = Paths.get(syncFilePath);
        if (!Files.exists(path)) return;
        String dateSuffix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Path processedPath = Paths.get(syncFilePath.replace(".csv", "_" + dateSuffix + ".csv.processed"));
        Files.move(path, processedPath);
        log.info("Ficheiro movido para: {}", processedPath);
    }

    @Override
    public String describe() {
        return "CSV[" + syncFilePath + "]";
    }
}
