package com.magbo.access.controllers;

import com.magbo.access.dto.hikvision.HikvisionEventDto;
import com.magbo.access.models.AccessLog;
import com.magbo.access.repositories.AccessLogRepository;
import com.magbo.access.services.DoorMappingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/hikvision")
@RequiredArgsConstructor
@Slf4j
public class HikvisionWebhookController {

    private final AccessLogRepository accessLogRepository;
    private final DoorMappingService doorMappingService;
    private final com.magbo.access.repositories.UserRepository userRepository;

    @Value("${magbo.webhook.token:}")
    private String webhookToken;

    @PostMapping("/webhook")
    public ResponseEntity<String> receiveWebhook(
            @RequestHeader(value = "X-MAGBO-WEBHOOK-TOKEN", required = false) String incomingToken,
            @RequestBody HikvisionEventDto payload) {

        if (webhookToken != null && !webhookToken.isBlank()) {
            if (incomingToken == null || !webhookToken.equals(incomingToken)) {
                log.warn("Webhook rejected: invalid or missing X-MAGBO-WEBHOOK-TOKEN");
                return ResponseEntity.status(401).body("Unauthorized");
            }
        }

        log.info("Received Hikvision Webhook: {}", payload);

        try {
            HikvisionEventDto.AccessControllerEvent event = null;
            String terminalIp = null;

            if (payload.getAccessControllerEvent() != null) {
                event = payload.getAccessControllerEvent();
            } else if (payload.getEventNotificationAlert() != null) {
                event = payload.getEventNotificationAlert().getAccessControllerEvent();
                terminalIp = payload.getEventNotificationAlert().getIpAddress();
            }

            if (event != null && event.getEmployeeNoString() != null && !event.getEmployeeNoString().isEmpty()) {
                String hikvisionId = event.getEmployeeNoString();
                String userId = userRepository.findByHikvisionEmployeeId(hikvisionId)
                        .map(u -> u.getId())
                        .orElse(hikvisionId);
                boolean isMapped = !userId.equals(hikvisionId);
                log.info("Hikvision event: hikvisionId={}, resolvedUserId={}, isMapped={}", hikvisionId, userId, isMapped);

                DoorMappingService.ResolvedMapping resolved = doorMappingService.resolve(
                        event.getDoorNo(),
                        event.getReaderNo(),
                        terminalIp
                );

                AccessLog accessLog = AccessLog.builder()
                        .userId(userId)
                        .pointId(resolved.pointId())
                        .action(resolved.action())
                        .timestamp(LocalDateTime.now())
                        .build();

                accessLogRepository.save(accessLog);
                log.info("Access Log registered: user={}, pointId={}, action={}, fallback={}",
                        userId, resolved.pointId(), resolved.action(), resolved.isFallback());
            } else {
                log.warn("Payload ignored: no employeeNoString or valid event");
            }

            return ResponseEntity.ok("Success");
        } catch (Exception e) {
            log.error("Error processing Hikvision webhook", e);
            return ResponseEntity.status(500).body("Error processing webhook");
        }
    }
}
