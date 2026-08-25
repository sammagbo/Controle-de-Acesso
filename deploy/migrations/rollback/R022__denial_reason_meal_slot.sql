-- =====================================================================
-- R022 — devolve o CHECK de denial_reason a lista da V015
-- =====================================================================
-- ⚠️ SO CORRER DEPOIS de voltar o jar anterior. Com o backend da V021 no ar,
-- a primeira passagem de um aluno sem creneau tenta gravar
-- MEAL_SLOT_NOT_CONFIGURED, o INSERT falha DENTRO da transacao e derruba junto
-- o access_log de uma passagem real. E exatamente o modo de falha que a V015
-- documenta, ao contrario.
--
-- ⚠️ E se ja existirem linhas com o valor novo, este ALTER FALHA (o CHECK e
-- validado contra os dados existentes). Isso e desejado: nao se apaga o
-- registo de uma tentativa para caber numa constraint. Nesse caso, decidir
-- explicitamente o que fazer com essas linhas antes de continuar:
--   SELECT count(*) FROM access_attempts WHERE denial_reason='MEAL_SLOT_NOT_CONFIGURED';
-- =====================================================================

DO $$
BEGIN
  ALTER TABLE access_attempts DROP CONSTRAINT IF EXISTS access_attempts_denial_reason_check;
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_denial_reason_check
    CHECK (denial_reason IN (
      'MEAL_NOT_ENTITLED','OUTSIDE_MEAL_TIME','DUPLICATE_MEAL',
      'EXIT_NOT_AUTHORIZED','OUTSIDE_EXIT_WINDOW','USER_INACTIVE',
      'UNKNOWN_USER','MISSING_DOOR_MAPPING','DEVICE_DENIED',
      'UNKNOWN_FACE','AMBIGUOUS_NAME',
      'REGIME_NOT_ALLOWED','REGIME_UNKNOWN','REGIME_TO_VERIFY',
      'NORMAL'
    ));
END $$;
