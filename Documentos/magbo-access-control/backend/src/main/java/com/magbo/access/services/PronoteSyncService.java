package com.magbo.access.services;

import com.magbo.access.models.Responsavel;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.ResponsavelRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class PronoteSyncService {

    private final UserRepository userRepository;
    private final ResponsavelRepository responsavelRepository;

    @Value("${pronote.sync.filepath}")
    private String syncFilePath;

    @Scheduled(cron = "${pronote.sync.cron}")
    @Transactional
    public void syncPronoteData() {
        Path path = Paths.get(syncFilePath);

        if (!Files.exists(path)) {
            log.warn("Integração Pronote: Nenhum ficheiro para sincronizar hoje ({})", syncFilePath);
            return;
        }

        log.info("Iniciando sincronização com Pronote: lendo o ficheiro {}", syncFilePath);

        try {
            List<String> lines = Files.readAllLines(path);
            
            // Ignorar primeira linha (cabeçalho)
            boolean isFirstLine = true;
            int successCount = 0;
            int errorCount = 0;

            for (String line : lines) {
                if (isFirstLine) {
                    isFirstLine = false;
                    continue;
                }
                
                if (line.trim().isEmpty()) {
                    continue;
                }

                try {
                    processLine(line);
                    successCount++;
                } catch (Exception e) {
                    log.error("Falha ao processar linha do CSV [{}]: {}", line, e.getMessage());
                    errorCount++;
                }
            }

            log.info("Sincronização Pronote concluída. Sucessos: {}, Erros: {}", successCount, errorCount);

            // Renomear ficheiro processado apenas se 100% lido com sucesso
            if (errorCount == 0) {
                String dateSuffix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
                Path processedPath = Paths.get(syncFilePath.replace(".csv", "_" + dateSuffix + ".csv.processed"));
                Files.move(path, processedPath);
                log.info("Processamento 100% validado. Ficheiro movido para {}", processedPath);
            } else {
                log.warn("O ficheiro contém {} erros e não será renomeado. Corrija o CSV e deixe processar na próxima janela.", errorCount);
            }

        } catch (IOException e) {
            log.error("Erro crítico de IO ao ler ficheiro CSV do Pronote", e);
            throw new RuntimeException("Falha na sincronização", e); // Dispara Rollback caso falhe a leitura no meio
        }
    }

    private void processLine(String line) {
        // userId;nome;tipo;turma;responsavelId;responsavelNome;responsavelParentesco;responsavelTelefone
        String[] data = line.split(";", -1);
        if (data.length < 8) {
            throw new IllegalArgumentException("Colunas insuficientes na linha");
        }

        String userId = data[0].trim();
        String nome = data[1].trim();
        String tipoStr = data[2].trim();
        String turma = data[3].trim();
        String respId = data[4].trim();
        String respNome = data[5].trim();
        String respParentesco = data[6].trim();
        String respTelefone = data[7].trim();

        // 1. Processar Responsável (Upsert)
        if (!respId.isEmpty() && !respNome.isEmpty()) {
            Responsavel responsavel = responsavelRepository.findById(respId).orElse(new Responsavel());
            responsavel.setId(respId);
            responsavel.setNome(respNome);
            if (!respParentesco.isEmpty()) responsavel.setParentesco(respParentesco);
            if (!respTelefone.isEmpty()) responsavel.setTelefone(respTelefone);
            responsavelRepository.save(responsavel);
        }

        // 2. Processar User (Upsert)
        if (!userId.isEmpty() && !nome.isEmpty()) {
            User user = userRepository.findById(userId).orElse(new User());
            user.setId(userId);
            user.setNome(nome);
            
            try {
                user.setTipo(UserType.valueOf(tipoStr.toUpperCase()));
            } catch (IllegalArgumentException e) {
                // Fallback de segurança se falhar casting
                user.setTipo(UserType.ALUNO);
            }

            if (!turma.isEmpty()) user.setTurma(turma);
            
            // Associação de Entidade (User -> ResponsavelId)
            if (!respId.isEmpty() && "ALUNO".equalsIgnoreCase(tipoStr)) {
                user.setResponsavelId(respId);
            }

            if (user.getMealCount() == null) user.setMealCount(0);
            
            userRepository.save(user);
        } else {
            throw new IllegalArgumentException("ID de Usuário ou Nome estão vazios.");
        }
    }
}
