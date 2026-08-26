-- =====================================================================
-- V024 — system_settings : les réglages modifiables À L'ÉCRAN
-- =====================================================================
-- Jusqu'ici, changer un seuil (durée max de repas, capacité du CDI...) voulait
-- dire éditer une property et redémarrer le backend. L'inventaire de
-- configurabilité (docs/operacional/inventaire-configurabilite.md) a montré le
-- prix : la grille de cantine est restée UN AN sur 2025 parce qu'aucun écran
-- ne permettait de la changer.
--
-- ── LE CONTRAT : SURCOUCHE, PAS REMPLACEMENT ─────────────────────────
-- Les properties (`magbo.*`) restent la VALEUR PAR DÉFAUT, donc « défaut =
-- comportement actuel » est garanti structurellement : une base sans aucune
-- ligne ici se comporte exactement comme avant cette migration. Une ligne
-- n'existe que quand quelqu'un a MODIFIÉ un réglage à l'écran — et elle porte
-- QUI et QUAND, ce que l'écran de configuration affiche.
--
-- ⚠️ VALEUR EN TEXTE, PAS DE COLONNE TYPÉE NI D'ENUM (leçon V014/V017 : pas
-- de CHECK qui diverge entre installations). Le typage vit dans le
-- SettingsService, à côté du défaut — un seul endroit sait qu'une clé est un
-- entier, et c'est celui qui connaît aussi sa valeur de repli.
--
-- ⚠️ CE MAGASIN NE REÇOIT JAMAIS DE SECRET. Les tokens, mots de passe et PIN
-- restent dans l'environnement (.env) : une table lisible par l'écran de
-- configuration est exactement l'endroit où un secret ne doit pas vivre.
--
-- ⚠️ APPLIQUER À LA MAIN AVANT de monter le backend (jamais ddl-auto en
-- premier : celui qui crée la table écrit le schéma — V017).
-- Rollback : rollback/R024__drop_system_settings.sql
-- =====================================================================

BEGIN;

-- Garde V021-style : si la table existe déjà sous une autre forme (backend
-- monté trop tôt), échouer BRUYAMMENT au lieu d'annoncer un succès.
DO $$
BEGIN
  IF to_regclass('system_settings') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'system_settings' AND column_name = 'updated_by')
  THEN
    RAISE EXCEPTION USING
      MESSAGE = 'system_settings existe deja avec une AUTRE forme (updated_by absente).',
      HINT    = 'Backend monte avant la migration ? Verifier qu elle est vide, la supprimer '
                'avec rollback/R024, rejouer V024 AVANT de remonter le backend.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS system_settings (
    chave       VARCHAR(128) PRIMARY KEY,
    valor       VARCHAR(512) NOT NULL,
    updated_by  VARCHAR(50)  NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT now()
);

COMMENT ON TABLE system_settings IS
    'Surcouche des properties magbo.* modifiable a l ecran. Ligne absente = le defaut du code s applique. JAMAIS de secret ici. Voir V024.';
COMMENT ON COLUMN system_settings.updated_by IS
    'Username de qui a modifie en dernier — affiche dans l ecran de configuration.';

COMMIT;

-- ── Conférence après application ─────────────────────────────────────
-- 1. \d system_settings  → 4 colonnes, PK sur chave, aucun CHECK.
-- 2. La table doit être VIDE à la naissance :
--      SELECT count(*) FROM system_settings;   → 0
--    (des lignes n'apparaissent que quand quelqu'un modifie un réglage)
