-- MAGBO Access Control — V002: direito a refeicao (meal_entitlements)
-- Fase C. Um registro por aluno (PK = user_id).
-- Aplicar ANTES de subir o backend com a Fase C.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/MealEntitlement.java
-- CHECK conferido contra o enum EntitlementStatus { AUTHORIZED, NOT_AUTHORIZED, PENDING }.

CREATE TABLE IF NOT EXISTS meal_entitlements (
    user_id       VARCHAR(255) PRIMARY KEY,
    status        VARCHAR(16)  NOT NULL,
    valid_from    DATE,
    valid_until   DATE,
    note          VARCHAR(255),
    -- days_of_week e meal_type: reservados para evolucao futura; a regra atual os ignora.
    days_of_week  VARCHAR(16),
    meal_type     VARCHAR(16),
    updated_by    VARCHAR(50),
    updated_at    TIMESTAMP    NOT NULL,
    created_at    TIMESTAMP    NOT NULL
);

-- CHECK: status  <->  enum EntitlementStatus { AUTHORIZED, NOT_AUTHORIZED, PENDING }  (NOT NULL)
DO $$ BEGIN
  ALTER TABLE meal_entitlements ADD CONSTRAINT meal_entitlements_status_check
    CHECK (status IN ('AUTHORIZED','NOT_AUTHORIZED','PENDING'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
