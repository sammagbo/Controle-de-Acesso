-- =====================================================================
-- V022 — élargit le CHECK de access_attempts.denial_reason
--        avec MEAL_SLOT_NOT_CONFIGURED
-- =====================================================================
-- Même piège que V009 et V015, payé deux fois : Hibernate génère le CHECK à la
-- CRÉATION de la table, et `ddl-auto=update` ne l'altère JAMAIS ensuite. Une
-- valeur nouvelle dans l'enum Java passe les tests (H2 recrée à zéro) et casse
-- UNIQUEMENT sur la VM — à l'intérieur de la transaction de la passage, en
-- emportant l'access_log d'un passage réel.
--
-- ⚠️ APPLIQUER AVANT de monter le backend de la V021. La valeur nouvelle est
-- écrite dès le premier élève dont la turma n'a pas de créneau : ce n'est pas
-- une bombe à retardement de plusieurs semaines comme la V015, ça part le jour
-- même, au premier service.
--
-- ── CE QUE LA VALEUR VEUT DIRE, ET CE QU'ELLE NE VEUT PAS DIRE ───────
-- `MEAL_SLOT_NOT_CONFIGURED` = « le MAGBO ne sait pas à quelle heure cette
-- personne mange ». Ce n'est PAS un refus, et ce n'est PAS un reproche adressé
-- à l'élève : c'est une question adressée à l'adulte qui tient l'affiche.
-- La politique associée est OBSERVATION (`magbo.policy.meal-slot-not-configured`),
-- jamais DENY — la maternelle et l'élémentaire ne figurent pas sur l'affiche et
-- ne doivent pas être punies pour une case vide.
--
-- Rollback : rollback/R022__denial_reason_meal_slot.sql
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
      'MEAL_SLOT_NOT_CONFIGURED',
      'NORMAL'
    ));
END $$;

-- ── Conférence après application ─────────────────────────────────────
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'access_attempts_denial_reason_check';
-- La liste doit contenir MEAL_SLOT_NOT_CONFIGURED. `npm test --
-- tests/migrations.test.js` compare cette liste à DenialReason.java et échoue
-- si l'une des deux prend de l'avance sur l'autre.
