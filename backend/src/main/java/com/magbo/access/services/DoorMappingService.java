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
     *  3. IP-only mapping (terminalIp set, doorNo NULL) — single-direction devices
     *     like the DeepinView portal cameras, which do not send doorNo
     *  4. fallback: PORT{doorNo} + ENTRADA (legacy behavior)
     */
    public ResolvedMapping resolve(Integer doorNo, Integer readerNo, String terminalIp) {
        if (doorNo != null) {
            List<DoorMapping> matches = repository.findBestMatch(doorNo, readerNo, terminalIp);
            if (!matches.isEmpty()) {
                DoorMapping match = matches.get(0);
                log.info("Resolved doorNo={}, readerNo={}, ip={} -> pointId={}, action={}",
                        doorNo, readerNo, terminalIp, match.getPointId(), match.getAction());
                return new ResolvedMapping(match.getPointId(), match.getAction(), false);
            }
        }

        if (terminalIp != null && !terminalIp.isBlank()) {
            List<DoorMapping> ipMatches = repository.findIpOnlyMatch(terminalIp);
            if (!ipMatches.isEmpty()) {
                DoorMapping match = ipMatches.get(0);
                log.info("Resolved by terminalIp={} (doorNo={}) -> pointId={}, action={}",
                        terminalIp, doorNo, match.getPointId(), match.getAction());
                return new ResolvedMapping(match.getPointId(), match.getAction(), false);
            }
        }

        if (doorNo == null) {
            log.warn("No mapping for terminalIp={} and doorNo is null, using legacy fallback PORT1 + ENTRADA",
                    terminalIp);
            return new ResolvedMapping("PORT1", AccessAction.ENTRADA, true);
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
