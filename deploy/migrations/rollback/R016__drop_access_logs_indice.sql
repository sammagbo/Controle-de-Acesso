-- =====================================================================
-- R016 — desfaz V016 (índice (point_id, timestamp) em access_logs)
-- =====================================================================
-- Só derruba um índice: nenhum dado se perde, e a tabela volta ao estado da
-- V006 (só a PK). A consulta do portão volta a varrer a tabela inteira — ~14 ms
-- e ~29 MB de páginas por execução, vinte vezes por minuto e por tela aberta.
--
-- ⚠️ CONCURRENTLY também aqui, e portanto SEM BEGIN/COMMIT: um DROP INDEX comum
-- pega lock exclusivo na tabela e trava o webhook enquanto durar.
--
-- Uso legítimo: o índice ficou INVÁLIDO porque o CREATE CONCURRENTLY foi
-- interrompido. Nesse caso, derrubar e recriar é o procedimento — um índice
-- inválido não é usado pelo planejador e continua ocupando espaço.
--
--   SELECT indisvalid FROM pg_index
--    WHERE indexrelid = 'idx_access_logs_ponto_hora'::regclass;   → f = inválido
-- =====================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_access_logs_ponto_hora;
