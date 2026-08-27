-- =====================================================================
-- V026 — cdi_alert_events : chaque alerte du CDI laisse une trace
-- =====================================================================
-- La réserve n°1 de la nuit du 26→27/08, actée par Sam le 27 : une alerte
-- d'exclusion qui sonne à l'écran du CDI ne laissait AUCUNE trace. Si une
-- famille demande dans six semaines pourquoi son enfant a été signalé au
-- comptoir, il n'y a pas de réponse — ni combien de fois, ni quand, ni ce
-- que l'écran affichait à ce moment-là. Un signal que personne ne peut
-- compter après coup ne peut pas être amélioré (la doctrine posée pour
-- REGIME_TO_VERIFY, appliquée ici).
--
-- ── CE QUE CETTE TABLE EST, ET N'EST PAS ─────────────────────────────
-- C'est un REGISTRE D'OBSERVATION : « l'écran du CDI a montré telle alerte,
-- pour telle personne, à telle heure ». Elle ne décide rien, ne bloque rien
-- (ADR-003), et son écriture ne peut JAMAIS faire échouer autre chose :
-- le service écrit en REQUIRES_NEW et l'appelant attrape — le motif des
-- registres de soutien, un registre qui tombe ne doit emporter personne.
--
-- ── ⚠️ DONNÉE SENSIBLE SUR UN MINEUR ─────────────────────────────────
-- Une ligne EXCLUSION nomme un enfant et date un signalement. La lecture est
-- derrière la MÊME permission que la gestion des exclusions
-- (CDI_EXCLUSION_WRITE) — pas la version réduite que l'écran du CDI reçoit.
-- `nome_snapshot` suit le précédent d'`access_attempts` : le nom au moment du
-- fait, pour que le registre reste lisible même si le cadastre change.
--
-- ── ⚠️ L'HEURE EST CELLE DE L'ÉVÉNEMENT ──────────────────────────────
-- `event_time` = l'heure du BADGE qui a déclenché l'alerte, jamais celle du
-- traitement (trois défauts d'horloge déjà payés : 03/08, le régime, les
-- exclusions rétroactives). `criado_em` n'est que la métadonnée d'insertion.
--
-- ── PAS D'ENUM EN BASE (leçon V014/V017) ─────────────────────────────
-- `tipo` est un VARCHAR + CHECK manuel. Valeurs : EXCLUSION (personne ou
-- classe exclue a badgé), CAPACITE (le badge a franchi la capacité), FERME
-- (badge pendant un état déclaré fermé/réservé). Côté Java c'est une String
-- validée par le service — pas de @Enumerated, donc pas de CHECK Hibernate
-- qui divergerait de celui-ci.
--
-- ⚠️ APPLIQUER À LA MAIN AVANT de monter le backend (jamais ddl-auto en
-- premier : celui qui crée la table écrit le schéma — V017).
-- Rollback : rollback/R026__drop_cdi_alert_events.sql — ⚠️ il EFFACE un
-- registre de signalements concernant des enfants ; sans le dump précédent,
-- ces lignes ne reviennent pas.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('cdi_alert_events') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'cdi_alert_events' AND column_name = 'event_time')
  THEN
    RAISE EXCEPTION USING
      MESSAGE = 'cdi_alert_events existe deja avec une AUTRE forme (event_time absente).',
      HINT    = 'Backend monte avant la migration ? Verifier qu elle est vide, la supprimer '
                'avec rollback/R026, rejouer V026 AVANT de remonter le backend.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cdi_alert_events (
    id            BIGSERIAL PRIMARY KEY,
    -- EXCLUSION | CAPACITE | FERME — CHECK manuel, pas d'enum (V014/V017).
    tipo          VARCHAR(16)  NOT NULL,
    -- NULL pour une alerte de salle (CAPACITE/FERME sans personne précise).
    user_id       VARCHAR(64),
    -- Le nom au moment du fait (précédent : access_attempts.nome_snapshot).
    nome_snapshot VARCHAR(255),
    point_id      VARCHAR(32)  NOT NULL,
    -- ⚠️ L'heure du BADGE, jamais celle du traitement.
    event_time    TIMESTAMP    NOT NULL,
    -- Ce que l'écran affichait : « 12/10 capacité », « exclusion de classe
    -- 6E1 », « état FERME 13:00→14:00 ». Texte court, jamais le MOTIF de
    -- l'exclusion — le motif reste dans cdi_exclusions, derrière sa porte.
    detalhe       VARCHAR(255),
    -- ⚠️ QUI A ÉCRIT LA LIGNE — le principal authentifié, estampillé par le
    -- SERVEUR, jamais par le corps du POST. Doctrine maison (« o campo é
    -- prova ») : access_logs.created_by_user, meal_entitlement_events
    -- .changed_by, cdi_exclusions.criado_por — un registre à vocation
    -- probatoire dont les lignes seraient inattribuables n'est pas un
    -- registre. Relevé par le panel du 28/08, ajouté AVANT tout déploiement :
    -- après la première ligne écrite, ce serait irréparable.
    criado_por    VARCHAR(64)  NOT NULL,
    criado_em     TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT ck_cdi_alert_events_tipo CHECK (tipo IN ('EXCLUSION', 'CAPACITE', 'FERME'))
);

-- ⚠️ LE CHECK, POSÉ MÊME SI LA TABLE EXISTAIT DÉJÀ. Si le backend monte
-- avant la migration, Hibernate crée la table avec les mêmes colonnes mais
-- SANS le CHECK : la garde du haut ne lève pas (event_time existe), le
-- CREATE IF NOT EXISTS ne fait rien, et la contrainte n'existerait nulle
-- part — l'asymétrie V014, par la porte de derrière. Relevé par le panel du
-- 28/08.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_cdi_alert_events_tipo') THEN
    ALTER TABLE cdi_alert_events
      ADD CONSTRAINT ck_cdi_alert_events_tipo CHECK (tipo IN ('EXCLUSION', 'CAPACITE', 'FERME'));
  END IF;
END $$;

-- L'historique se lit « les plus récentes d'abord », et par personne quand
-- une famille demande.
CREATE INDEX IF NOT EXISTS idx_cdi_alert_events_tempo ON cdi_alert_events (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_cdi_alert_events_user  ON cdi_alert_events (user_id);

COMMENT ON TABLE cdi_alert_events IS
    'Registre d observation des alertes affichees a l ecran du CDI. Ne decide rien, ne bloque rien (ADR-003). Donnee sensible sur mineur — lecture par CDI_EXCLUSION_WRITE uniquement. Heure = celle du BADGE. Voir V026.';
COMMENT ON COLUMN cdi_alert_events.tipo IS
    'EXCLUSION | CAPACITE | FERME — CHECK manuel : nouveau type => modifier ck_cdi_alert_events_tipo dans la meme livraison.';
COMMENT ON COLUMN cdi_alert_events.event_time IS
    'Heure du badge qui a declenche l alerte, jamais celle du traitement.';
COMMENT ON COLUMN cdi_alert_events.detalhe IS
    'Ce que l ecran affichait. JAMAIS le motif de l exclusion — il reste dans cdi_exclusions.';
COMMENT ON COLUMN cdi_alert_events.criado_por IS
    'Le principal authentifie qui a poste la ligne — estampille par le SERVEUR, jamais par le corps du POST.';

COMMIT;
