-- ROLLBACK da V010 — remove posto_fixo_point_id de app_users.
--
-- ⚠️ NAO desfaz as flags ja gravadas. As linhas de access_logs com
-- flag='POSTO_FIXO' continuam onde estao, com a flag, porque elas sao
-- passagens REAIS: a flag diz "esta e uma repeticao de quem estava de servico
-- aqui", nunca "isto nao aconteceu". Apagar a flag reescreveria o registro de
-- passagens que de fato ocorreram.
--
-- Efeito pratico do rollback: sem a coluna, nenhuma passagem NOVA recebe a
-- flag, e tudo volta a contar como antes da V010. As linhas antigas ja
-- marcadas continuam fora dos contadores padrao ate que o codigo tambem seja
-- revertido — o Journal, que e a visao de auditoria, sempre mostrou e continua
-- mostrando todas.
--
-- Para tambem devolver as linhas antigas aos contadores (decisao a parte, do
-- Sam), rodar DEPOIS:
--   UPDATE access_logs SET flag = NULL WHERE flag = 'POSTO_FIXO';

ALTER TABLE app_users DROP COLUMN IF EXISTS posto_fixo_point_id;
