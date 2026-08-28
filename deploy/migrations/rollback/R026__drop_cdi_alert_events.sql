-- =====================================================================
-- R026 — rollback de V026 : supprime cdi_alert_events
-- =====================================================================
-- ⚠️⚠️ CE ROLLBACK EFFACE UN REGISTRE DE SIGNALEMENTS CONCERNANT DES
-- ENFANTS. Chaque ligne EXCLUSION date le moment où un enfant nommé a été
-- signalé au comptoir du CDI — c'est la réponse à « pourquoi mon enfant
-- a-t-il été signalé, et combien de fois ». Sans le dump antérieur
-- (deploy/backup.sh), ces lignes ne reviennent pas.
--
-- Avant de l'exécuter : un pg_dump, et la certitude que c'est bien la table
-- qu'on veut voir partir — pas une gêne passagère qu'un TRUNCATE réglerait
-- mieux (et TRUNCATE aussi efface le registre : même avertissement).
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS cdi_alert_events;

COMMIT;
