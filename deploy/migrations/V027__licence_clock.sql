-- =====================================================================
-- V027 — licence_clock : le témoin d'horloge de la licence (ADR-006)
-- =====================================================================
-- Une licence qui n'existe que par comparaison de dates est défaite par une
-- horloge qu'on recule. Sur une VM, `date -s` ou un BIOS suffisent. Cette
-- table garde la DATE LA PLUS RÉCENTE JAMAIS OBSERVÉE ; si l'horloge revient
-- nettement en deçà, la licence est traitée comme EXPIRÉE et l'anomalie est
-- journalisée.
--
-- ⚠️ CINQUIÈME PIÈGE D'HORLOGE DU PROJET. Les quatre précédents :
--   1. l'heure de RÉCEPTION au lieu de l'heure de l'ÉVÉNEMENT (03/08/2026 —
--      33 passages d'une file hors-ligne inscrits à 14:51, durées négatives) ;
--   2. le conteneur en UTC (25/08/2026 — 17:27 local enregistré 20:27) ;
--   3. le régime de sortie jugé à `now` — une sortie de 10h évaluée à 18h
--      devenait « fin de journée », et l'alerte n'avait jamais existé ;
--   4. `cantine_removals.removido_em` écrit avec un `now()` décalé — « retirer
--      cette ligne » devenait « taire cette personne trois heures ».
-- Celui-ci est le seul traité AVANT d'avoir mordu.
--
-- ── UNE SEULE LIGNE, id = 1 ──────────────────────────────────────────
-- Ce n'est pas un journal, c'est une BORNE. Le CHECK (id = 1) la rend unique
-- en base et pas seulement dans le code : une deuxième ligne signifierait deux
-- vérités sur le temps, et la requête déciderait laquelle gagne par hasard.
--
-- ── ⚠️ UNE DATE, PAS UN TIMESTAMP ────────────────────────────────────
-- La licence expire un JOUR. Une borne à la seconde rendrait le mécanisme
-- sensible au bruit (corrections NTP, dérive, ordre des requêtes) sans rien
-- protéger de plus. À la journée, il y a au plus UNE écriture par jour.
--
-- ── ⚠️ CE QUE CETTE TABLE PEUT CASSER, ET COMMENT S'EN SORTIR ────────
-- La borne ne recule JAMAIS (c'est toute la mécanique). Si quelqu'un AVANCE
-- l'horloge de la VM puis la remet à l'heure, la borne reste dans le futur et
-- le recul est détecté en permanence : les écrans de gestion se ferment et ne
-- se rouvrent pas seuls. La sortie est manuelle, et volontairement :
--
--   docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
--     -c "UPDATE licence_clock SET date_max_vue = CURRENT_DATE, \
--         observe_le = now() WHERE id = 1;"
--
-- Elle demande le même accès que remplacer le JAR. En faire un bouton dans
-- l'écran d'administration aurait fait de l'anti-recul une décoration.
--
-- ⚠️ ET CE QU'ELLE NE CASSE PAS : l'enregistrement des passages, les écrans
-- de poste, le PPMS nominatif et la connexion continuent dans TOUS les cas —
-- y compris pile RTC morte et retour en 1970. C'est exactement pour cela que
-- la dégradation est par couches (ADR-006).
--
-- ── ⚠️ APPLIQUER À LA MAIN AVANT de monter le backend ────────────────
-- La table est ADDITIVE et `ddl-auto=update` saurait la créer — c'est
-- précisément le problème. Celui qui crée la table écrit le schéma, et
-- `ddl-auto` ne corrige jamais une contrainte ensuite (leçon V017/V020) : si
-- le backend monte d'abord, la VM se retrouve avec une table SANS le
-- CHECK (id = 1). Le bloc idempotent plus bas RATTRAPE ce cas — mais il ne
-- rattrape que celui-là, et l'ordre reste : migration d'abord, backend ensuite.
--
--   docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
--     < deploy/migrations/V027__licence_clock.sql
--   echo "exit=$?"   # 0 = appliquée · autre = NON appliquée, ne pas monter le backend
--
-- Rollback : rollback/R027__drop_licence_clock.sql
-- =====================================================================

BEGIN;

-- Garde V021/V024-style : si la table existe déjà sous une AUTRE forme
-- (backend monté trop tôt), échouer BRUYAMMENT au lieu d'annoncer un succès.
DO $$
BEGIN
  IF to_regclass('licence_clock') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'licence_clock' AND column_name = 'date_max_vue')
  THEN
    RAISE EXCEPTION USING
      MESSAGE = 'licence_clock existe deja avec une AUTRE forme (date_max_vue absente).',
      HINT    = 'Backend monte avant la migration ? Verifier qu elle est vide, la supprimer '
                'avec rollback/R027, rejouer V027 AVANT de remonter le backend.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS licence_clock (
    id                SMALLINT     PRIMARY KEY,
    date_max_vue      DATE         NOT NULL,
    observe_le        TIMESTAMP    NOT NULL,
    recul_detecte_le  TIMESTAMP,
    recul_jours       BIGINT,
    CONSTRAINT ck_licence_clock_ligne_unique CHECK (id = 1)
);

-- ─────────────────────────────────────────────────────────────────────
-- ⚠️ LE CHECK, AJOUTÉ SÉPARÉMENT ET DE FAÇON IDEMPOTENTE
-- ─────────────────────────────────────────────────────────────────────
-- Sans ce bloc, le fichier ne tenait PAS la promesse de son propre en-tête.
-- Si `ddl-auto` a créé la table avant (Hibernate génère exactement ces noms de
-- colonnes, `date_max_vue` compris), alors :
--   · le garde ci-dessus passe — la colonne qu'il cherche existe ;
--   · `CREATE TABLE IF NOT EXISTS` ne fait rien ;
--   · le CHECK n'est JAMAIS ajouté ;
--   · et `psql` sort avec le code 0, donc le `echo "exit=$?"` du README
--     annonce « appliquée ».
-- La seule chose qui rattrapait ce cas était la vérification n° 3 ci-dessous —
-- celle que le README lui-même désigne comme « celle que personne ne pense à
-- faire ». Une migration ne doit pas sortir en 0 quand la seule chose qu'elle
-- apporte n'a pas été appliquée.
-- (Panel de revue — qualité, 31/08/2026.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname  = 'ck_licence_clock_ligne_unique'
                    AND conrelid = 'licence_clock'::regclass)
  THEN
    -- ⚠️ La table peut déjà contenir une ligne (backend monté avant) : si elle
    -- en contient une avec id <> 1, l'ALTER échoue BRUYAMMENT, ce qui est le
    -- comportement voulu — mieux vaut arrêter le déploiement que poser une
    -- contrainte sur des données qui la violent.
    ALTER TABLE licence_clock
      ADD CONSTRAINT ck_licence_clock_ligne_unique CHECK (id = 1);
    RAISE NOTICE 'V027 : CHECK ck_licence_clock_ligne_unique ajoute sur une table preexistante.';
  END IF;
END $$;

COMMENT ON TABLE licence_clock IS
    'Temoin d horloge de la licence : la date la plus recente jamais observee. Une seule ligne (id=1). Voir V027 et ADR-006.';
COMMENT ON COLUMN licence_clock.date_max_vue IS
    'N est mise a jour que VERS L AVANT. La realigner sur une date reculee effacerait la trace.';
COMMENT ON COLUMN licence_clock.recul_detecte_le IS
    'Dernier recul detecte. Conserve apres retour a la normale : un incident d horloge qu on ne peut plus constater est un incident qu on n expliquera jamais.';

COMMIT;

-- ── Conférence après application ─────────────────────────────────────
-- 1. \d licence_clock
--      → 5 colonnes, PK sur id, et le CHECK ck_licence_clock_ligne_unique.
--
-- 2. La table doit être VIDE à la naissance :
--      SELECT count(*) FROM licence_clock;   → 0
--    La ligne apparaît au premier démarrage du backend (LicenceHorloge).
--
-- 3. ⚠️ LE CHECK EXISTE-T-IL VRAIMENT ? C'est celui qu'on oublie de vérifier,
--    et c'est précisément lui qui distingue cette table de celle que
--    `ddl-auto` aurait créée :
--      SELECT conname FROM pg_constraint
--       WHERE conrelid = 'licence_clock'::regclass AND contype = 'c';
--      → ck_licence_clock_ligne_unique
--
-- 4. Après le premier démarrage du backend, la borne doit être à AUJOURD'HUI :
--      SELECT id, date_max_vue, observe_le FROM licence_clock;
--      → 1 | <date du jour> | <heure du demarrage>
--    Une date différente d'aujourd'hui au premier démarrage veut dire que le
--    conteneur n'est pas à l'heure — voir le bloc TZ de docker-compose.yml.
