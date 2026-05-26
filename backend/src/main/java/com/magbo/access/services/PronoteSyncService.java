package com.magbo.access.services;

import com.magbo.access.dto.SyncReport;
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
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@Slf4j
@RequiredArgsConstructor
public class PronoteSyncService {

    private final UserRepository userRepository;
    private final ResponsavelRepository responsavelRepository;

    @Value("${pronote.sync.filepath}")
    private String syncFilePath;

    /**
     * Job agendado pelo cron — descarta o relatório porque executa em background.
     */
    @Scheduled(cron = "${pronote.sync.cron}")
    @Transactional
    public void scheduledSync() {
        SyncReport report = syncPronoteData();
        log.info("Cron sync completed: created={}, updated={}, deactivated={}, errors={}",
                report.getCreated(), report.getUpdated(),
                report.getDeactivated(), report.getErrors());
    }

    /**
     * Método principal de sincronização. Pode ser chamado pelo cron ou pela
     * controller (trigger manual).
     */
    @Transactional
    public SyncReport syncPronoteData() {
        SyncReport report = SyncReport.builder()
                .syncedAt(LocalDateTime.now())
                .filePath(syncFilePath)
                .build();

        Path path = Paths.get(syncFilePath);

        if (!Files.exists(path)) {
            String msg = "Nenhum ficheiro para sincronizar: " + syncFilePath;
            log.warn(msg);
            report.addError(msg);
            return report;
        }

        log.info("Iniciando sincronização Pronote: {}", syncFilePath);

        Set<String> idsVistosNoCsv = new HashSet<>();

        try {
            List<String> lines = Files.readAllLines(path);

            boolean isFirstLine = true;
            int lineNumber = 0;

            for (String line : lines) {
                lineNumber++;
                if (isFirstLine) { isFirstLine = false; continue; }
                if (line.trim().isEmpty()) continue;

                try {
                    String userId = processLine(line, report);
                    if (userId != null) idsVistosNoCsv.add(userId);
                } catch (Exception e) {
                    String msg = "Linha " + lineNumber + ": " + e.getMessage();
                    log.error(msg);
                    report.addError(msg);
                }
            }

            // Soft delete: desativa usuários que estavam ATIVOS no banco
            // mas não apareceram neste CSV
            List<User> ativos = userRepository.findByAtivoTrue();
            for (User user : ativos) {
                if (!idsVistosNoCsv.contains(user.getId())) {
                    user.setAtivo(false);
                    userRepository.save(user);
                    report.incrementDeactivated();
                    log.info("Soft delete: usuário {} marcado como inativo", user.getId());
                }
            }

            log.info("Sincronização concluída: created={}, updated={}, deactivated={}, errors={}",
                    report.getCreated(), report.getUpdated(),
                    report.getDeactivated(), report.getErrors());

            // Move o arquivo se 100% sucesso
            if (report.getErrors() == 0) {
                String dateSuffix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
                Path processedPath = Paths.get(syncFilePath.replace(".csv", "_" + dateSuffix + ".csv.processed"));
                Files.move(path, processedPath);
                log.info("Ficheiro movido para: {}", processedPath);
            }

        } catch (IOException e) {
            log.error("Erro de IO lendo CSV", e);
            report.addError("Erro de IO: " + e.getMessage());
            throw new RuntimeException("Falha na sincronização", e);
        }

        return report;
    }

    /**
     * Processa uma linha do CSV. Retorna o userId processado, ou null se nada
     * foi feito. Lança exceção em caso de erro.
     * Formato: userId;nome;tipo;turma;responsavelId;responsavelNome;responsavelParentesco;responsavelTelefone
     *          [;resp2Id;resp2Nome;resp2Parentesco;resp2Telefone]  ← opcional
     */
    private String processLine(String line, SyncReport report) {
        String[] data = line.split(";", -1);
        if (data.length < 8) {
            throw new IllegalArgumentException("Colunas insuficientes (esperadas 8+, recebidas " + data.length + ")");
        }

        String userId = data[0].trim();
        String nome = data[1].trim();
        String tipoStr = data[2].trim();
        String turma = data[3].trim();
        String respId = data[4].trim();
        String respNome = data[5].trim();
        String respParentesco = data[6].trim();
        String respTelefone = data[7].trim();

        // Responsável 2 (opcional — colunas 8-11)
        String resp2Id = data.length > 8 ? data[8].trim() : "";
        String resp2Nome = data.length > 9 ? data[9].trim() : "";
        String resp2Parentesco = data.length > 10 ? data[10].trim() : "";
        String resp2Telefone = data.length > 11 ? data[11].trim() : "";

        if (userId.isEmpty() || nome.isEmpty()) {
            throw new IllegalArgumentException("ID ou nome vazios");
        }

        // 1. Upsert Responsável 1
        if (!respId.isEmpty() && !respNome.isEmpty()) {
            Responsavel r = responsavelRepository.findById(respId).orElse(new Responsavel());
            r.setId(respId);
            r.setNome(respNome);
            if (!respParentesco.isEmpty()) r.setParentesco(respParentesco);
            if (!respTelefone.isEmpty()) r.setTelefone(respTelefone);
            responsavelRepository.save(r);
        }

        // 1b. Upsert Responsável 2
        if (!resp2Id.isEmpty() && !resp2Nome.isEmpty()) {
            Responsavel r2 = responsavelRepository.findById(resp2Id).orElse(new Responsavel());
            r2.setId(resp2Id);
            r2.setNome(resp2Nome);
            if (!resp2Parentesco.isEmpty()) r2.setParentesco(resp2Parentesco);
            if (!resp2Telefone.isEmpty()) r2.setTelefone(resp2Telefone);
            responsavelRepository.save(r2);
        }

        // 2. Upsert User
        boolean isNew = !userRepository.existsById(userId);
        User user = userRepository.findById(userId).orElse(new User());
        user.setId(userId);
        user.setNome(nome);
        user.setAtivo(true);

        try {
            user.setTipo(UserType.valueOf(tipoStr.toUpperCase()));
        } catch (IllegalArgumentException e) {
            user.setTipo(UserType.ALUNO);
        }

        if (!turma.isEmpty()) user.setTurma(turma);

        if (!respId.isEmpty() && "ALUNO".equalsIgnoreCase(tipoStr)) {
            user.setResponsavelId(respId);
        }
        if (!resp2Id.isEmpty() && "ALUNO".equalsIgnoreCase(tipoStr)) {
            user.setResponsavel2Id(resp2Id);
        }

        if (user.getMealCount() == null) user.setMealCount(0);

        userRepository.save(user);

        if (isNew) report.incrementCreated();
        else report.incrementUpdated();

        return userId;
    }
}
