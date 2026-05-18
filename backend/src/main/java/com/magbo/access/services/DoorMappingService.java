package com.magbo.access.services;

import com.magbo.access.models.AccessAction;
import com.magbo.access.models.DoorMapping;
import com.magbo.access.repositories.DoorMappingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class DoorMappingService {

    private final DoorMappingRepository repository;

    /**
     * Resolves a Hikvision event to a (pointId, action) pair.
     * Resolution order:
     *  1. exact match (terminalIp + doorNo + readerNo)
     *  2. doorNo + readerNo with NULL terminalIp (generic)
     *  3. fallback: PORT{doorNo} + ENTRADA (legacy behavior)
     */
    public ResolvedMapping resolve(Integer doorNo, Integer readerNo, String terminalIp) {
        if (doorNo == null) {
            log.warn("doorNo is null, using legacy fallback PORT1 + ENTRADA");
            return new ResolvedMapping("PORT1", AccessAction.ENTRADA, true);
        }

        List<DoorMapping> matches = repository.findBestMatch(doorNo, readerNo, terminalIp);

        if (!matches.isEmpty()) {
            DoorMapping match = matches.get(0);
            log.info("Resolved doorNo={}, readerNo={}, ip={} -> pointId={}, action={}",
                    doorNo, readerNo, terminalIp, match.getPointId(), match.getAction());
            return new ResolvedMapping(match.getPointId(), match.getAction(), false);
        }

        // Fallback: legacy behavior
        String fallbackPointId = "PORT" + doorNo;
        AccessAction fallbackAction = (readerNo != null && readerNo == 2)
                ? AccessAction.SAIDA : AccessAction.ENTRADA;

        log.warn("No DoorMapping found for doorNo={}, readerNo={}, ip={}. Using fallback: pointId={}, action={}",
                doorNo, readerNo, terminalIp, fallbackPointId, fallbackAction);
        return new ResolvedMapping(fallbackPointId, fallbackAction, true);
    }

    public record ResolvedMapping(String pointId, AccessAction action, boolean isFallback) {}
}
