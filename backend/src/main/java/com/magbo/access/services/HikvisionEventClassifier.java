package com.magbo.access.services;

import com.magbo.access.dto.EventClassification;
import com.magbo.access.models.AuthMethod;
import com.magbo.access.models.AuthResult;
import org.springframework.stereotype.Service;

/**
 * Tabela confirmada com hardware DS-K1T344MX-E1 fw V4.13.0 em 13-14/07/2026.
 * Cartão e face compartilham a semântica de aprovação mas têm subtipos distintos (1 e 75).
 * O subtipo 8 é NEGAÇÃO do terminal e traz identidade — nunca pode virar access_log.
 */
@Service
public class HikvisionEventClassifier {

    public EventClassification classify(Integer subEventType) {
        if (subEventType == null) {
            return new EventClassification(AuthMethod.UNKNOWN, AuthResult.UNKNOWN, false);
        }
        return switch (subEventType) {
            case 75 -> new EventClassification(AuthMethod.FACE, AuthResult.SUCCESS, true);
            case 1  -> new EventClassification(AuthMethod.CARD, AuthResult.SUCCESS, true);
            case 8  -> new EventClassification(AuthMethod.UNKNOWN, AuthResult.DENIED, false);
            default -> new EventClassification(AuthMethod.UNKNOWN, AuthResult.UNKNOWN, false);
        };
    }
}
