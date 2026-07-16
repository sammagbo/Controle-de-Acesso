-- MAGBO Access Control — V004: autorizacoes de saida de alunos (student_exit_permissions)
-- Fase D. Regra do portao consulta esta tabela.
-- Aplicar ANTES de subir o backend com a Fase D.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/StudentExitPermission.java
-- CHECKs conferidos contra os enums ExitPermissionType e ExitPermissionStatus.
-- Atencao: reason e created_by sao NOT NULL (conforme a entidade).

CREATE TABLE IF NOT EXISTS student_exit_permissions (
    id               BIGSERIAL PRIMARY KEY,
    user_id          VARCHAR(255) NOT NULL,
    permission_type  VARCHAR(16)  NOT NULL,
    valid_from       DATE,
    valid_until      DATE,
    start_time       TIME,
    end_time         TIME,
    days_of_week     VARCHAR(16),
    status           VARCHAR(16)  NOT NULL,
    reason           VARCHAR(255) NOT NULL,
    note             VARCHAR(255),
    created_by       VARCHAR(50)  NOT NULL,
    created_at       TIMESTAMP    NOT NULL,
    revoked_by       VARCHAR(50),
    revoked_at       TIMESTAMP,
    used_at          TIMESTAMP
);

-- CHECK: permission_type  <->  enum ExitPermissionType
--        { PERMANENT, RECURRING, DATE_RANGE, SINGLE }  (NOT NULL)
DO $$ BEGIN
  ALTER TABLE student_exit_permissions ADD CONSTRAINT student_exit_permissions_permission_type_check
    CHECK (permission_type IN ('PERMANENT','RECURRING','DATE_RANGE','SINGLE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CHECK: status  <->  enum ExitPermissionStatus
--        { ACTIVE, REVOKED, USED, EXPIRED }  (NOT NULL)
DO $$ BEGIN
  ALTER TABLE student_exit_permissions ADD CONSTRAINT student_exit_permissions_status_check
    CHECK (status IN ('ACTIVE','REVOKED','USED','EXPIRED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
