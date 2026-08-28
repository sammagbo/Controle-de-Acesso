-- =====================================================================
-- V023 — SEED : l'affiche de la Vie Scolaire (Restauration 2026)
-- =====================================================================
-- Transcription de l'affiche murale, plus la reprise de `class_schedules`
-- pour tout ce que l'affiche ne nomme pas. Voir V021 pour le raisonnement.
--
-- ⚠️ IDEMPOTENT. Peut être rejoué : les créneaux sont créés par (jour, heure)
-- avec ON CONFLICT DO NOTHING, et les affectations de même.
--
-- ⚠️ DEUX TURMAS DE L'AFFICHE N'EXISTENT PAS EN BASE — vérifié, pas deviné :
--     5ème 3 (5E3)  mercredi 13H00, jeudi 13H00
--                   → AUCUN élève, ni actif ni inactif ; absente aussi de
--                     class_schedules.
--     3ème 3 (3E3)  jeudi 13H00
--                   → ligne présente dans class_schedules, mais ZÉRO élève.
--
-- Les deux sont SEMÉES QUAND MÊME, et c'est un choix : cette table est la
-- transcription de l'affiche, et l'affiche les nomme. Semer ce que le mur
-- dit et laisser l'écran signaler « turma sans élève » met le désaccord
-- sous les yeux de la Vie Scolaire, qui seule peut trancher. Le taire —
-- en omettant les deux lignes — aurait fait disparaître la question.
-- Aucun élève n'est affecté par ces deux lignes : elles ne changent le
-- verdict de personne.
--
-- Rollback : les données partent avec R021 (DROP des tables).
-- =====================================================================

BEGIN;

-- ── 1. LES CRÉNEAUX ─────────────────────────────────────────────────
-- Tolérances : 15 min avant (on arrive en avance en rang) et 45 min après
-- (le service s'étale). Elles sont configurables PAR créneau, à l'écran.
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (1, '12:30', '12H30 — prioritaire', 1) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (1, '13:00', '13H00 — secondaire', 2) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (2, '12:30', '12H30 — prioritaire', 1) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (2, '13:00', '13H00 — secondaire', 2) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (3, '12:30', '12H30 — prioritaire', 1) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (3, '13:00', '13H00 — secondaire', 2) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (4, '12:30', '12H30 — prioritaire', 1) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (4, '13:00', '13H00 — secondaire', 2) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (5, '12:30', '12H30 — prioritaire', 1) ON CONFLICT (dia_semana, hora) DO NOTHING;
INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem) VALUES (5, '13:00', '13H00 — secondaire', 2) ON CONFLICT (dia_semana, hora) DO NOTHING;

-- ── 2. LES TURMAS DE L'AFFICHE ──────────────────────────────────────

-- PASSAGE 12H30 — prioritaire
--   Lundi : 6eme 2, 6eme 3, 4eme 3, 3eme 1, 3eme 2, 2nde 1, 1ere 1
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E2', false FROM meal_slots WHERE dia_semana=1 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E3', false FROM meal_slots WHERE dia_semana=1 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E3', false FROM meal_slots WHERE dia_semana=1 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E1', false FROM meal_slots WHERE dia_semana=1 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E2', false FROM meal_slots WHERE dia_semana=1 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E1', false FROM meal_slots WHERE dia_semana=1 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E1', false FROM meal_slots WHERE dia_semana=1 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
--   Mardi : 6eme 1, 6eme 2, 5eme 1, 1ere 2, 1ere 3, Term 1, Term 2
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E1', false FROM meal_slots WHERE dia_semana=2 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E2', false FROM meal_slots WHERE dia_semana=2 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E1', false FROM meal_slots WHERE dia_semana=2 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E2', false FROM meal_slots WHERE dia_semana=2 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E3', false FROM meal_slots WHERE dia_semana=2 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T1', false FROM meal_slots WHERE dia_semana=2 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T2', false FROM meal_slots WHERE dia_semana=2 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
--   Mercredi : 5eme 1, 1ere 3, Term 1, Term 2
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E1', false FROM meal_slots WHERE dia_semana=3 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E3', false FROM meal_slots WHERE dia_semana=3 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T1', false FROM meal_slots WHERE dia_semana=3 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T2', false FROM meal_slots WHERE dia_semana=3 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
--   Jeudi : 4eme 1, 5eme 2, Term 1
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E1', false FROM meal_slots WHERE dia_semana=4 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E2', false FROM meal_slots WHERE dia_semana=4 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T1', false FROM meal_slots WHERE dia_semana=4 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
--   Vendredi : 6eme 1, 1ere 1, 1ere 2, 1ere 3
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E1', false FROM meal_slots WHERE dia_semana=5 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E1', false FROM meal_slots WHERE dia_semana=5 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E2', false FROM meal_slots WHERE dia_semana=5 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E3', false FROM meal_slots WHERE dia_semana=5 AND hora='12:30' ON CONFLICT (slot_id, turma) DO NOTHING;

-- PASSAGE 13H00 — secondaire
--   Lundi : 6eme 1, 5eme 1, 5eme 2, 4eme 1, 4eme 2, 2nde 2, 2nde 3, 1ere 2, 1ere 3, Term 1, Term 2
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E1', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E1', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E2', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E1', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E2', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E2', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E3', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E2', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E3', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T1', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T2', false FROM meal_slots WHERE dia_semana=1 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
--   Mardi : 6eme 3, 5eme 2, 4eme 1, 4eme 2, 4eme 3, 3eme 1, 3eme 2, 2nde 1, 2nde 2, 2nde 3, 1ere 1, 1ere 2, 1ere 3
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E3', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E2', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E1', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E2', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E3', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E1', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E2', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E1', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E2', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E3', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E1', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E2', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E3', false FROM meal_slots WHERE dia_semana=2 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
--   Mercredi : 6eme 1, 6eme 2, 6eme 3, 5eme 2, 5eme 3, 4eme 1, 4eme 2, 4eme 3
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E1', false FROM meal_slots WHERE dia_semana=3 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E2', false FROM meal_slots WHERE dia_semana=3 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E3', false FROM meal_slots WHERE dia_semana=3 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E2', false FROM meal_slots WHERE dia_semana=3 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E3', false FROM meal_slots WHERE dia_semana=3 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E1', false FROM meal_slots WHERE dia_semana=3 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E2', false FROM meal_slots WHERE dia_semana=3 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;  -- badge masqué par un aimant le 24/08 ; CONFIRMÉ par la photo du mur du 27/08
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E3', false FROM meal_slots WHERE dia_semana=3 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
--   Jeudi : 6eme 1, 6eme 2, 6eme 3, 5eme 1, 5eme 3, 4eme 1, 4eme 2, 4eme 3, 3eme 1, 3eme 2, 3eme 3, 2nde 1, 2nde 2, 2nde 3, 1ere 1, 1ere 2, 1ere 3, Term 2
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E1', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E2', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E3', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E1', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E3', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E1', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E2', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E3', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E1', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E2', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E3', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E1', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E2', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E3', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E1', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E2', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '1E3', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T2', false FROM meal_slots WHERE dia_semana=4 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
--   Vendredi : 6eme 2, 6eme 3, 5eme 1, 5eme 2, 4eme 1, 4eme 2, 4eme 3, 3eme 1, 3eme 2, 2nde 1, 2nde 2, 2nde 3, Term 1, Term 2
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E2', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '6E3', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E1', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '5E2', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E1', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E2', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '4E3', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E1', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '3E2', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E1', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E2', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, '2E3', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T1', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;
INSERT INTO meal_slot_classes (slot_id, turma, a_confirmar) SELECT id, 'T2', false FROM meal_slots WHERE dia_semana=5 AND hora='13:00' ON CONFLICT (slot_id, turma) DO NOTHING;

-- ── 3. REPRISE DE class_schedules POUR TOUT LE RESTE ────────────────
-- Maternelle, élémentaire — absentes de l'affiche, et pourtant les plus
-- grosses utilisatrices du réfectoire (mesuré : CM2A 5226 passages,
-- TPS/PS A 4923, MSB 4671). Sans cette reprise, elles basculeraient toutes
-- en « créneau non configuré » du jour au lendemain.
--
-- ⚠️ Ne touche QUE les turmas que l'affiche ne nomme pas (NOT EXISTS sur
-- meal_slot_classes) : là où l'affiche parle, c'est elle qui fait autorité,
-- et la vieille grille de class_schedules ne doit RIEN pouvoir contredire.
-- 'N' (pas de repas ce jour-là) est ignoré : pas de créneau du tout.

DO $$
DECLARE d SMALLINT; col TEXT; h TEXT; r RECORD;
BEGIN
  FOR d IN 1..5 LOOP
    col := (ARRAY['lun_midi','mar_midi','mer_midi','jeu_midi','ven_midi'])[d];
    FOR r IN EXECUTE format(
        'SELECT classe, %I AS midi FROM class_schedules WHERE %I IS NOT NULL AND upper(%I) <> ''N'' AND %I <> ''''', col, col, col, col)
    LOOP
      -- l'affiche a le dernier mot pour cette turma, ce jour-là
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM meal_slot_classes mc JOIN meal_slots ms ON ms.id = mc.slot_id
         WHERE mc.turma = r.classe AND ms.dia_semana = d);
      h := replace(upper(r.midi), 'H', ':');
      IF h !~ '^[0-9]{1,2}:[0-9]{2}$' THEN CONTINUE; END IF;
      INSERT INTO meal_slots (dia_semana, hora, rotulo, ordem)
        VALUES (d, h::time, h || ' — repris de class_schedules', 3)
        ON CONFLICT (dia_semana, hora) DO NOTHING;
      INSERT INTO meal_slot_classes (slot_id, turma)
        SELECT id, r.classe FROM meal_slots WHERE dia_semana = d AND hora = h::time
        ON CONFLICT (slot_id, turma) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- ── Conférence après application ────────────────────────────────────
-- 1. Les créneaux du mardi (doit montrer 12:30 et 13:00) :
--      SELECT dia_semana, hora, rotulo FROM meal_slots ORDER BY dia_semana, hora;
--
-- 2. ⚠️ Le fait qui a dicté le modèle — une turma dans DEUX créneaux le même
--    jour (mardi : 1ère 2 et 1ère 3 dans les deux passages) :
--      SELECT mc.turma, count(*) FROM meal_slot_classes mc
--        JOIN meal_slots ms ON ms.id=mc.slot_id WHERE ms.dia_semana=2
--       GROUP BY 1 HAVING count(*) > 1;
--    Attendu : 1E2 et 1E3, chacune 2.
--
-- 3. Les turmas de l'affiche qui n'ont AUCUN élève (5E3, 3E3 attendues) :
--      SELECT DISTINCT mc.turma FROM meal_slot_classes mc
--       WHERE NOT EXISTS (SELECT 1 FROM app_users u
--                          WHERE u.turma = mc.turma AND u.ativo AND u.tipo='ALUNO');
--
-- 4. Les turmas d'élèves SANS aucun créneau (doit être vide après ce seed) :
--      SELECT DISTINCT u.turma FROM app_users u
--       WHERE u.tipo='ALUNO' AND u.ativo AND u.turma <> ''
--         AND NOT EXISTS (SELECT 1 FROM meal_slot_classes mc WHERE mc.turma=u.turma);
