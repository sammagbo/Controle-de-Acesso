package com.magbo.access.models;

/**
 * Modo da política de acesso.
 * OBSERVATION = registra acesso e tentativa.
 * DENY = não registra acesso, apenas tentativa.
 */
public enum PolicyMode {
    OBSERVATION,
    DENY
}
