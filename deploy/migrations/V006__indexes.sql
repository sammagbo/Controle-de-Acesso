-- MAGBO Access Control — V006: indices das tabelas novas
-- Aplicar por ultimo, DEPOIS de V001..V005.
-- Idempotente: CREATE INDEX IF NOT EXISTS pode rodar mais de uma vez sem erro.
--
-- ATENCAO: nao criar indices em access_logs nesta fase (tabela de ~440k registros em uso;
-- criacao de indice e' operacao pesada e fora do escopo).

-- access_attempts: listagens por tempo, por usuario, por motivo e por ponto.
CREATE INDEX IF NOT EXISTS idx_attempts_timestamp   ON access_attempts (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_user_ts     ON access_attempts (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_reason_ts   ON access_attempts (denial_reason, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_point_ts    ON access_attempts (point_id, timestamp DESC);

-- meal_entitlement_events: historico por usuario, mais recente primeiro.
CREATE INDEX IF NOT EXISTS idx_ment_events_user_ts  ON meal_entitlement_events (user_id, changed_at DESC);

-- student_exit_permissions: consulta da regra do portao (por usuario/status e por validade).
CREATE INDEX IF NOT EXISTS idx_exitperm_user_status ON student_exit_permissions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_exitperm_validity    ON student_exit_permissions (valid_from, valid_until);
