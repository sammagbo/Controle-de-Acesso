-- =====================================================================
-- R027 — desfaz V027 (licence_clock)
-- =====================================================================
-- ⚠️ CE QUE CECI EFFACE : la date la plus recente jamais observee par le
-- systeme, et la trace du dernier recul d'horloge detecte. Il n'y a pas de
-- copie ailleurs — recuperer exige le pg_dump anterieur.
--
-- ⚠️ CE QUE CECI NE FAIT PAS : desactiver la licence. Le backend recree la
-- ligne au demarrage suivant, avec la date du jour comme nouvelle borne.
-- Autrement dit, ce rollback REINITIALISE l'anti-recul — il ne le retire pas.
--
-- ⚠️ ET C'EST BIEN LA SEULE FACON DE S'EN SERVIR SANS SE TROMPER : si le but
-- est de reparer une borne coincee dans le futur (quelqu'un a avance l'horloge
-- de la VM puis l'a remise a l'heure), NE PAS derouler ce fichier. Un UPDATE
-- suffit, il ne coupe rien et il garde la trace de l'incident :
--
--   docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
--     -c "UPDATE licence_clock SET date_max_vue = CURRENT_DATE, \
--         observe_le = now() WHERE id = 1;"
--
-- ⚠️ ORDRE, si vous deroulez vraiment : le backend NOUVEAU consulte cette
-- table a chaque evaluation. Descendre le backend, remettre le jar anterieur,
-- et seulement ensuite lancer ceci.
-- =====================================================================
BEGIN;
DROP TABLE IF EXISTS licence_clock;
COMMIT;
-- Conferencia:  SELECT to_regclass('licence_clock');  -> NULL
