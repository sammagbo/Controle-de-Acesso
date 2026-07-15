package com.magbo.access.dto;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class AttemptStatsDto {
    private long total;
    private Map<String, Long> byReason;
    private Map<String, Long> byPoint;
    private Map<String, Long> byMethod;
    private Map<String, Long> byTurma;
    private long divergence;
}
