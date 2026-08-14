-- =====================================================================
-- R015 — desfaz V015 (motivos de recusa do régime de sortie)
-- =====================================================================
-- Devolve o CHECK de access_attempts.denial_reason à lista da V009, ou seja,
-- sem REGIME_NOT_ALLOWED, REGIME_UNKNOWN e REGIME_TO_VERIFY.
--
-- ⚠️ SÓ RODA COM O REGIME DESLIGADO. Se `magbo.regime.habilitado=true` e já
-- houver linhas gravadas com um desses três motivos, o ALTER TABLE falha na
-- validação do CHECK — e é bom que falhe: o rollback estaria prestes a deixar
-- no banco linhas que a constraint nova declara impossíveis.
--
-- Ordem correta para desfazer:
--   1. magbo.regime.habilitado=false  (e reiniciar o backend)
--   2. conferir:  SELECT count(*) FROM access_attempts
--                  WHERE denial_reason LIKE 'REGIME%';   → deve ser 0
--      Se não for 0, decidir o que fazer com essas linhas ANTES de continuar:
--      elas são o registro de que o sistema avisou sobre a saída de uma
--      criança, e apagá-las em silêncio destrói prova.
--   3. este arquivo
--   4. rollback/R014, se for para desfazer as tabelas também
-- =====================================================================

DO $$ BEGIN
  ALTER TABLE access_attempts DROP CONSTRAINT IF EXISTS access_attempts_denial_reason_check;
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_denial_reason_check
    CHECK (denial_reason IN (
      'MEAL_NOT_ENTITLED','OUTSIDE_MEAL_TIME','DUPLICATE_MEAL',
      'EXIT_NOT_AUTHORIZED','OUTSIDE_EXIT_WINDOW','USER_INACTIVE',
      'UNKNOWN_USER','MISSING_DOOR_MAPPING','DEVICE_DENIED',
      'UNKNOWN_FACE','AMBIGUOUS_NAME','NORMAL'
    ));
END $$;
