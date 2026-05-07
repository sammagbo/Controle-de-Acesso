package com.magbo.access.controllers;

import com.magbo.access.dto.hikvision.HikvisionEventDto;
import com.magbo.access.models.AccessLog;
import com.magbo.access.repositories.AccessLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/hikvision")
@RequiredArgsConstructor
@Slf4j
public class HikvisionWebhookController {

    private final AccessLogRepository accessLogRepository;

    @PostMapping("/webhook")
    public ResponseEntity<String> receiveWebhook(@RequestBody HikvisionEventDto payload) {
        log.info("Received Hikvision Webhook: {}", payload);

        try {
            HikvisionEventDto.AccessControllerEvent event = null;

            if (payload.getAccessControllerEvent() != null) {
                event = payload.getAccessControllerEvent();
            } else if (payload.getEventNotificationAlert() != null) {
                event = payload.getEventNotificationAlert().getAccessControllerEvent();
            }

            if (event != null && event.getEmployeeNoString() != null && !event.getEmployeeNoString().isEmpty()) {
                String userId = event.getEmployeeNoString();
                
                // Mapeamento simples: podemos inferir portaria pelo readerNo ou doorNo.
                // Aqui assumiremos PORT1 caso doorNo/readerNo seja nulo.
                String pointId = "PORT1";
                if (event.getDoorNo() != null) {
                    pointId = "PORT" + event.getDoorNo();
                }

                // Por padrão assumiremos ENTRADA a menos que consigamos identificar SAIDA
                com.magbo.access.models.AccessAction action = com.magbo.access.models.AccessAction.ENTRADA;
                // Exemplo: se readerNo for 2, é saída (configuração comum)
                if (event.getReaderNo() != null && event.getReaderNo() == 2) {
                    action = com.magbo.access.models.AccessAction.SAIDA;
                }

                AccessLog accessLog = AccessLog.builder()
                        .userId(userId)
                        .pointId(pointId)
                        .action(action)
                        .timestamp(LocalDateTime.now())
                        .build();

                accessLogRepository.save(accessLog);
                log.info("Access Log registered from Hikvision Webhook for user: {}", userId);
            } else {
                log.warn("Payload ignorado: Não contém employeeNoString ou evento válido.");
            }

            // O Hikvision exige resposta rápida com 200 OK
            return ResponseEntity.ok("Success");
        } catch (Exception e) {
            log.error("Erro ao processar Webhook Hikvision", e);
            return ResponseEntity.status(500).body("Error processing webhook");
        }
    }
}
