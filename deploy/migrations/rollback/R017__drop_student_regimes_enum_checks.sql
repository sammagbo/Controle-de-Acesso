-- =====================================================================
-- R017 — desfaz V017 (os seis CHECK de enum das tabelas de regime)
-- =====================================================================
-- Só derruba constraints: nenhuma linha se perde. A base volta ao estado da
-- V014 — que é o estado ASSIMÉTRICO: sem CHECK numa VM atualizada, COM CHECK
-- numa VM nova (o Hibernate os cria ao nascer a tabela).
--
-- ⚠️ Uso legítimo: exatamente um. A V017 falhou com "violates check
-- constraint" porque existe na tabela um valor que não é do enum, e você
-- precisa da base utilizável enquanto trata o dado. Descubra a linha:
--
--   SELECT id, user_id, regime_general, regime_sortie FROM student_regimes
--    WHERE regime_general NOT IN ('EXTERNE','DEMI_PENSIONNAIRE','INTERNE')
--       OR regime_sortie  NOT IN ('REGIME_1','REGIME_2','REGIME_3');
--
-- ⚠️ NÃO é o caminho para "acrescentei um valor ao enum". Nesse caso o certo é
-- uma migração NOVA que refaça os CHECK com o valor a mais — derrubá-los devolve
-- a assimetria que a V017 existe para fechar, e devolve em silêncio.
--
-- Depois de rodar isto, uma VM atualizada e uma VM nova voltam a ter schemas
-- diferentes. Se for para ficar assim, escreva por quê em algum lugar: a próxima
-- pessoa vai encontrar a diferença e não vai saber se é decisão ou defeito.
-- =====================================================================

BEGIN;

ALTER TABLE student_regimes       DROP CONSTRAINT IF EXISTS student_regimes_regime_general_check;
ALTER TABLE student_regimes       DROP CONSTRAINT IF EXISTS student_regimes_regime_sortie_check;
ALTER TABLE student_regime_events DROP CONSTRAINT IF EXISTS student_regime_events_old_regime_general_check;
ALTER TABLE student_regime_events DROP CONSTRAINT IF EXISTS student_regime_events_new_regime_general_check;
ALTER TABLE student_regime_events DROP CONSTRAINT IF EXISTS student_regime_events_old_regime_sortie_check;
ALTER TABLE student_regime_events DROP CONSTRAINT IF EXISTS student_regime_events_new_regime_sortie_check;

COMMIT;
