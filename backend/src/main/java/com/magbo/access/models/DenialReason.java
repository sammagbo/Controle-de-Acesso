package com.magbo.access.models;

/**
 * Motivo da decisão de acesso (seja negação ou observação).
 * NORMAL não deve ser gravado em access_attempts, apenas para completude.
 */
public enum DenialReason {
    MEAL_NOT_ENTITLED,
    OUTSIDE_MEAL_TIME,
    DUPLICATE_MEAL,
    EXIT_NOT_AUTHORIZED,
    OUTSIDE_EXIT_WINDOW,
    USER_INACTIVE,
    UNKNOWN_USER,
    MISSING_DOOR_MAPPING,
    DEVICE_DENIED,
    NORMAL
}
