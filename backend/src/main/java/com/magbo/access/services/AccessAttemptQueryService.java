package com.magbo.access.services;

import com.magbo.access.dto.AccessAttemptDto;
import com.magbo.access.dto.AttemptStatsDto;
import com.magbo.access.models.AccessAttempt;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.User;
import com.magbo.access.repositories.AccessAttemptRepository;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AccessAttemptQueryService {

    private final AccessAttemptRepository attemptRepository;
    private final UserRepository userRepository;

    public Page<AccessAttemptDto> getFiltered(LocalDateTime from, LocalDateTime to, String pointId, String userId, DenialReason reason, AuthMethod method, int page, int size) {
        if (size > 200) size = 200;
        Page<AccessAttempt> attempts = attemptRepository.findFiltered(from, to, pointId, userId, reason, method, PageRequest.of(page, size));
        return toDtoPage(attempts);
    }

    public List<AccessAttemptDto> getByPoints(List<String> pointIds) {
        LocalDateTime after = LocalDateTime.now().minusHours(12); // arbitrary bounds for feeds
        List<AccessAttempt> attempts = attemptRepository.findTop200ByPointIdInAndTimestampAfterOrderByTimestampDesc(pointIds, after);
        return toDtoList(attempts);
    }

    public AttemptStatsDto getStatsSince(LocalDateTime start) {
        long total = attemptRepository.countByTimestampGreaterThanEqual(start);
        long divergence = attemptRepository.countDivergenceSince(start);

        Map<String, Long> byReason = attemptRepository.countByReasonSince(start).stream()
                .collect(Collectors.toMap(r -> r[0] != null ? r[0].toString() : "UNKNOWN", r -> ((Number) r[1]).longValue()));

        Map<String, Long> byPoint = attemptRepository.countByPointSince(start).stream()
                .collect(Collectors.toMap(r -> r[0] != null ? r[0].toString() : "UNKNOWN", r -> ((Number) r[1]).longValue()));

        Map<String, Long> byMethod = attemptRepository.countByMethodSince(start).stream()
                .collect(Collectors.toMap(r -> r[0] != null ? r[0].toString() : "UNKNOWN", r -> ((Number) r[1]).longValue()));

        Map<String, Long> byTurma = attemptRepository.countByTurmaSince(start).stream()
                .collect(Collectors.toMap(r -> r[0] != null ? r[0].toString() : "UNKNOWN", r -> ((Number) r[1]).longValue()));

        return AttemptStatsDto.builder()
                .total(total)
                .divergence(divergence)
                .byReason(byReason)
                .byPoint(byPoint)
                .byMethod(byMethod)
                .byTurma(byTurma)
                .build();
    }

    private Page<AccessAttemptDto> toDtoPage(Page<AccessAttempt> attempts) {
        List<String> userIds = attempts.stream()
                .map(AccessAttempt::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        Map<String, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        return attempts.map(a -> mapToDto(a, userMap));
    }

    private List<AccessAttemptDto> toDtoList(List<AccessAttempt> attempts) {
        List<String> userIds = attempts.stream()
                .map(AccessAttempt::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        Map<String, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        return attempts.stream().map(a -> mapToDto(a, userMap)).toList();
    }

    private AccessAttemptDto mapToDto(AccessAttempt a, Map<String, User> userMap) {
        String nome = a.getNomeSnapshot();
        String turma = null;
        if (a.getUserId() != null && userMap.containsKey(a.getUserId())) {
            User u = userMap.get(a.getUserId());
            nome = u.getNome();
            turma = u.getTurma();
        }

        return AccessAttemptDto.builder()
                .id(a.getId())
                .userId(a.getUserId())
                .employeeNoRaw(a.getEmployeeNoRaw())
                .nome(nome)
                .turma(turma)
                .pointId(a.getPointId())
                .action(a.getAction())
                .terminalIp(a.getTerminalIp())
                .authMethod(a.getAuthMethod())
                .authResult(a.getAuthResult())
                .authorizationResult(a.getAuthorizationResult())
                .denialReason(a.getDenialReason())
                .hikvisionSubEventType(a.getHikvisionSubEventType())
                .timestamp(a.getTimestamp())
                .doorMappingFallback(a.getDoorMappingFallback())
                .build();
    }
}
