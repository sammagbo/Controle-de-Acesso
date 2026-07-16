-- MAGBO Access Control — V001: tentativas de acesso negadas/observadas (access_attempts)
-- Fase B (classificacao do webhook) grava aqui as autenticacoes que NAO viram AccessLog.
-- Aplicar ANTES de subir o backend com a Fase B.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/AccessAttempt.java
-- CHECKs conferidos, um a um, contra os enums Java (AccessAction, AuthMethod,
-- AuthResult, AuthorizationResult, DenialReason).

CREATE TABLE IF NOT EXISTS access_attempts (
    id                       BIGSERIAL PRIMARY KEY,
    user_id                  VARCHAR(255),
    employee_no_raw          VARCHAR(64)  NOT NULL,
    nome_snapshot            VARCHAR(255),
    point_id                 VARCHAR(255),
    action                   VARCHAR(16),
    terminal_ip              VARCHAR(45),
    auth_method              VARCHAR(8),
    auth_result              VARCHAR(8)   NOT NULL,
    authorization_result     VARCHAR(16)  NOT NULL,
    denial_reason            VARCHAR(32)  NOT NULL,
    hikvision_sub_event_type INTEGER,
    timestamp                TIMESTAMP    NOT NULL,
    door_mapping_fallback    BOOLEAN
);

-- CHECK: action  <->  enum AccessAction { ENTRADA, SAIDA }  (coluna nullable)
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_action_check
    CHECK (action IS NULL OR action IN ('ENTRADA','SAIDA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CHECK: auth_method  <->  enum AuthMethod { FACE, CARD, UNKNOWN }  (coluna nullable)
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_auth_method_check
    CHECK (auth_method IS NULL OR auth_method IN ('FACE','CARD','UNKNOWN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CHECK: auth_result  <->  enum AuthResult { SUCCESS, DENIED, UNKNOWN }  (NOT NULL)
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_auth_result_check
    CHECK (auth_result IN ('SUCCESS','DENIED','UNKNOWN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CHECK: authorization_result  <->  enum AuthorizationResult
--        { AUTHORIZED, DENIED, OBSERVATION, NOT_APPLICABLE }  (NOT NULL)
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_authorization_result_check
    CHECK (authorization_result IN ('AUTHORIZED','DENIED','OBSERVATION','NOT_APPLICABLE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CHECK: denial_reason  <->  enum DenialReason (10 valores)  (NOT NULL)
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_denial_reason_check
    CHECK (denial_reason IN (
      'MEAL_NOT_ENTITLED','OUTSIDE_MEAL_TIME','DUPLICATE_MEAL',
      'EXIT_NOT_AUTHORIZED','OUTSIDE_EXIT_WINDOW','USER_INACTIVE',
      'UNKNOWN_USER','MISSING_DOOR_MAPPING','DEVICE_DENIED','NORMAL'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
