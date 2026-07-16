-- MAGBO Access Control — V003: historico imutavel de mudancas de direito a refeicao
--                              (meal_entitlement_events)
-- Fase C. Cada alteracao em meal_entitlements gera um evento aqui (append-only).
-- Aplicar ANTES de subir o backend com a Fase C.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/MealEntitlementEvent.java
-- old_status/new_status conferidos contra o enum EntitlementStatus.

CREATE TABLE IF NOT EXISTS meal_entitlement_events (
    id               BIGSERIAL PRIMARY KEY,
    user_id          VARCHAR(255) NOT NULL,
    old_status       VARCHAR(16),
    new_status       VARCHAR(16)  NOT NULL,
    old_valid_from   DATE,
    old_valid_until  DATE,
    new_valid_from   DATE,
    new_valid_until  DATE,
    changed_by       VARCHAR(50)  NOT NULL,
    changed_at       TIMESTAMP    NOT NULL,
    note             VARCHAR(255),
    source           VARCHAR(16)  NOT NULL
);

-- CHECK: old_status  <->  enum EntitlementStatus { AUTHORIZED, NOT_AUTHORIZED, PENDING }  (nullable)
DO $$ BEGIN
  ALTER TABLE meal_entitlement_events ADD CONSTRAINT meal_entitlement_events_old_status_check
    CHECK (old_status IS NULL OR old_status IN ('AUTHORIZED','NOT_AUTHORIZED','PENDING'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CHECK: new_status  <->  enum EntitlementStatus { AUTHORIZED, NOT_AUTHORIZED, PENDING }  (NOT NULL)
DO $$ BEGIN
  ALTER TABLE meal_entitlement_events ADD CONSTRAINT meal_entitlement_events_new_status_check
    CHECK (new_status IN ('AUTHORIZED','NOT_AUTHORIZED','PENDING'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CHECK: source  --  guarda MANUAL (nao gerado pelo Hibernate: no Java 'source' e' String livre).
--   Valores atualmente escritos pelo codigo: 'UI' (MealEntitlementController) e 'BULK'
--   (MealEntitlementService.importBulk). 'API' incluido como reservado.
--   MANUTENCAO: ao introduzir um novo valor de 'source' no codigo Java, ADICIONAR aqui
--   na mesma entrega, senao o INSERT falha somente na VM (bug fantasma).
DO $$ BEGIN
  ALTER TABLE meal_entitlement_events ADD CONSTRAINT meal_entitlement_events_source_check
    CHECK (source IN ('UI','BULK','API'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
