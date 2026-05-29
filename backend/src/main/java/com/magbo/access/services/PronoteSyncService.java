package com.magbo.access.services;

import com.magbo.access.dto.SyncReport;
import com.magbo.access.models.Responsavel;
import com.magbo.access.models.User;
import com.magbo.access.models.UserType;
import com.magbo.access.repositories.ResponsavelRepository;
import com.magbo.access.repositories.UserRepository;
import com.magbo.access.services.pronote.PronoteDataSource;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@Slf4j
@RequiredArgsConstructor
public class PronoteSyncService {

    private final UserRepository userRepository;
    private final ResponsavelRepository responsavelRepository;
    private final ApplicationContext applicationContext;

    @Value("${pronote.source:csv}")
    private String pronoteSource;

    private PronoteDataSource dataSource() {
        String beanName = "api".equalsIgnoreCase(pronoteSource)
                ? "apiPronoteDataSource" : "csvPronoteDataSource";
        return applicationContext.getBean(beanName, PronoteDataSource.class);
    }

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
        PronoteDataSource source = dataSource();
        SyncReport report = SyncReport.builder()
                .syncedAt(LocalDateTime.now())
                .filePath(source.describe())
                .build();

        if (!source.isAvailable()) {
            String msg = "Fonte de dados indispon\u00edvel: " + source.describe();
            log.warn(msg);
            report.addError(msg);
            return report;
        }

        log.info("Iniciando sincroniza\u00e7\u00e3o Pronote a partir de: {}", source.describe());
        Set<String> idsVistosNoCsv = new HashSet<>();

        try {
            List<String> lines = source.fetchLines();

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

            // Soft delete: desativa usu\u00e1rios que estavam ATIVOS no banco
            // mas n\u00e3o apareceram neste CSV
            List<User> ativos = userRepository.findByAtivoTrue();
            for (User user : ativos) {
                if (!idsVistosNoCsv.contains(user.getId())) {
                    user.setAtivo(false);
                    userRepository.save(user);
                    report.incrementDeactivated();
                    log.info("Soft delete: usu\u00e1rio {} marcado como inativo", user.getId());
                }
            }

            log.info("Sincroniza\u00e7\u00e3o conclu\u00edda: created={}, updated={}, deactivated={}, errors={}",
                    report.getCreated(), report.getUpdated(),
                    report.getDeactivated(), report.getErrors());

            if (report.getErrors() == 0) {
                source.onSyncComplete();
            }
        } catch (Exception e) {
            log.error("Erro durante sincroniza\u00e7\u00e3o", e);
            report.addError("Erro: " + e.getMessage());
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
