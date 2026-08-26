-- =====================================================================
-- V021 — CRÉNEAUX DE CANTINE : le planning de la Vie Scolaire devient une
--        configuration, et cesse d'être une grille figée en base
-- =====================================================================
-- Le 25/08/2026, la cantine tournait (164 entrées) avec 63 OUTSIDE_MEAL_TIME
-- répartis sur 22 turmas : les fenêtres de `class_schedules` ne correspondaient
-- plus à l'affiche que la Vie Scolaire tient à jour au mur. L'affiche change
-- chaque année ; la base, elle, gardait 2025.
--
-- ── ⚠️ LE CHOIX : PAR-DESSUS `class_schedules`, PAS À CÔTÉ ───────────
-- Décidé et assumé (ADR-005). `class_schedules` N'EST PLUS LU PAR LA CANTINE
-- à partir de cette livraison. `validateEntryWindow` lit UNIQUEMENT les trois
-- tables ci-dessous. Il n'y a donc jamais deux vérités pour la même fenêtre.
--
-- `class_schedules` SURVIT, mais pour une AUTRE question, posée par
-- `RegimeSortieService` : « à quelle heure finit la matinée de cette turma,
-- et mange-t-elle ici aujourd'hui ? » — ce qui décide la fenêtre de sortie du
-- midi, pas l'accès au réfectoire. Deux questions différentes, deux tables.
--
-- ⚠️ Prix accepté, et il est écrit ici pour être trouvé : les deux peuvent
-- diverger. Si la Vie Scolaire déplace une turma de 12h30 à 13h00 dans les
-- créneaux, le régime continuera de lire l'ancienne heure de fin de matinée
-- dans `class_schedules`. Ça n'ouvre ni ne ferme aucune porte (le régime
-- n'interdit rien, il observe), mais ça peut afficher « fin de journée » au
-- mauvais moment. Porté à l'inventaire de configurabilité comme dette ouverte.
--
-- ── ⚠️ LE SEED VIENT DE DEUX SOURCES, ET C'EST DÉLIBÉRÉ ──────────────
-- L'affiche ne couvre que le collège et le lycée. Mais la maternelle et
-- l'élémentaire PASSENT au réfectoire, et beaucoup : mesuré sur la base
-- locale — CM2A 5226 passages, TPS/PS A 4923, MSB 4671, CPB 4372. Semer
-- uniquement l'affiche les aurait toutes fait basculer en « créneau non
-- configuré » du jour au lendemain : une régression franche depuis un état qui
-- marche (elles mangent à 11h, et `class_schedules` le dit correctement).
--
-- Donc : l'affiche fait autorité pour les turmas qu'elle nomme (elle REMPLACE
-- ce que la base disait), et les autres sont REPRISES telles quelles depuis
-- `class_schedules`. La table naît complète, et « non configuré » redevient ce
-- qu'il doit être : rare, et le signe d'une vraie question à poser.
--
-- ── AUCUNE COLONNE D'ENUM ────────────────────────────────────────────
-- Leçon V014/V017 : la migration qui crée la table écrit le schéma dans cet
-- environnement, et `ddl-auto=update` ne corrige jamais un CHECK ensuite. Le
-- jour du semaine est un SMALLINT ISO (1=lundi … 7=dimanche), pas un enum.
--
-- ⚠️ APPLIQUER À LA MAIN AVANT de monter le backend. Pas parce que ddl-auto
-- échouerait, mais parce qu'il RÉUSSIRAIT — et alors c'est lui l'auteur du
-- schéma, et les deux installations divergent (V017).
-- Rollback : rollback/R021__drop_meal_slots.sql
-- =====================================================================

BEGIN;

-- ── ⚠️ GARDE : QUELQU'UN EST-IL PASSÉ AVANT NOUS ? ───────────────────
-- `CREATE TABLE IF NOT EXISTS` ne vérifie PAS la forme de la table : si elle
-- existe déjà — créée par le `ddl-auto=update` d'un backend monté trop tôt —
-- la migration ne fait RIEN et sort avec 0. Elle annonce un succès sur un
-- schéma qui n'est pas le sien.
--
-- MESURÉ le 26/08/2026 sur une base d'essai : table pré-créée avec 3 colonnes,
-- V021 appliquée, `exit=0`, et la table gardait ses 3 colonnes sans la
-- contrainte UNIQUE. Les deux installations divergeaient, et rien ne le disait.
-- C'est exactement la classe de panne que la V017 a existé pour fermer.
--
-- Cette garde transforme un succès silencieux en échec bruyant. Elle ne
-- répare rien : elle refuse d'avancer et dit quoi faire.
DO $$
BEGIN
  IF to_regclass('meal_slots') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'meal_slots' AND column_name = 'tolerancia_antes_minutos')
  THEN
    RAISE EXCEPTION USING
      MESSAGE = 'meal_slots existe deja avec une AUTRE forme (colonne tolerancia_antes_minutos absente).',
      HINT    = 'Le backend a probablement ete monte avant cette migration et Hibernate a cree la table. '
                'Verifier qu elle est VIDE (SELECT count(*) FROM meal_slots), puis la supprimer avec '
                'rollback/R021 et rejouer V021 AVANT de remonter le backend.';
  END IF;
END $$;

-- ── 1. LES CRÉNEAUX : jour × heure de passage ────────────────────────
CREATE TABLE IF NOT EXISTS meal_slots (
    id                  BIGSERIAL PRIMARY KEY,
    dia_semana          SMALLINT     NOT NULL,   -- ISO : 1=lundi … 7=dimanche
    hora                TIME         NOT NULL,   -- 12:30, 13:00, 11:00…
    -- Tolérance PAR CRÉNEAU, et non globale : le service de 11h de la
    -- maternelle et celui de 13h du lycée ne s'étalent pas pareil.
    tolerancia_antes_minutos   SMALLINT NOT NULL DEFAULT 15,
    tolerancia_depois_minutos  SMALLINT NOT NULL DEFAULT 45,
    -- « 12H30 — prioritaire », « 13H00 — secondaire ». Texte libre : c'est un
    -- libellé d'affiche, pas une catégorie sur laquelle une règle s'appuie.
    rotulo              VARCHAR(64),
    -- Ordre d'affichage sur l'affiche imprimée (1 = premier passage).
    ordem               SMALLINT     NOT NULL DEFAULT 1,
    ativo               BOOLEAN      NOT NULL DEFAULT true,
    created_at          TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT now(),
    updated_by          VARCHAR(50),
    CONSTRAINT uq_meal_slots_dia_hora UNIQUE (dia_semana, hora),
    CONSTRAINT ck_meal_slots_dia CHECK (dia_semana BETWEEN 1 AND 7),
    CONSTRAINT ck_meal_slots_tolerancia CHECK (
        tolerancia_antes_minutos >= 0 AND tolerancia_depois_minutos >= 0)
);

-- ── 2. AFFECTATION PAR TURMA ─────────────────────────────────────────
-- ⚠️ PAS d'unique sur (turma, jour) : une turma PEUT être dans DEUX créneaux
-- le même jour. Fait réel de l'affiche 2026 — le mardi, 1ère 2 et 1ère 3
-- figurent dans les DEUX passages, une partie du groupe mangeant à 12h30 et
-- l'autre à 13h00. Une contrainte « une turma, un créneau » aurait rendu
-- l'affiche inreprésentable et forcé quelqu'un à choisir un mensonge.
CREATE TABLE IF NOT EXISTS meal_slot_classes (
    id          BIGSERIAL PRIMARY KEY,
    slot_id     BIGINT       NOT NULL REFERENCES meal_slots(id) ON DELETE CASCADE,
    turma       VARCHAR(32)  NOT NULL,
    -- « à confirmer » : un badge de l'affiche était masqué par un aimant le
    -- jour de la transcription. Le doute est PORTÉ DANS LA DONNÉE au lieu
    -- d'être arbitré en silence — l'écran d'administration le montre, et la
    -- règle le traite comme n'importe quel créneau (il n'accuse personne).
    a_confirmar BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uq_meal_slot_classes UNIQUE (slot_id, turma)
);

-- ── 3. EXCEPTIONS PAR ÉLÈVE ──────────────────────────────────────────
-- Les groupes de Terminale / Première / 2nde : un élève rattaché à un créneau
-- différent de celui de sa turma. Sans FK vers app_users, comme access_logs :
-- un cadastre supprimé ne doit pas faire échouer un INSERT opérationnel.
CREATE TABLE IF NOT EXISTS meal_slot_students (
    id          BIGSERIAL PRIMARY KEY,
    user_id     VARCHAR(64)  NOT NULL,
    slot_id     BIGINT       NOT NULL REFERENCES meal_slots(id) ON DELETE CASCADE,
    motivo      VARCHAR(255),
    created_by  VARCHAR(50)  NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uq_meal_slot_students UNIQUE (user_id, slot_id)
);

-- Les consultations : « les créneaux de ce jour » (écran + règle, à chaque
-- passage) et « les exceptions de cet élève ».
CREATE INDEX IF NOT EXISTS idx_meal_slots_dia ON meal_slots (dia_semana);
CREATE INDEX IF NOT EXISTS idx_meal_slot_classes_turma ON meal_slot_classes (turma);
CREATE INDEX IF NOT EXISTS idx_meal_slot_students_user ON meal_slot_students (user_id);

COMMENT ON TABLE meal_slots IS
    'Creneaux de cantine (jour x heure). SEULE source de verite de la fenetre d acces au refectoire depuis V021 — class_schedules n est plus lu par la cantine. Voir ADR-005.';
COMMENT ON COLUMN meal_slot_classes.a_confirmar IS
    'Transcrit depuis l affiche avec un doute (badge masque). Le doute vit dans la donnee, pas dans la tete de celui qui a transcrit.';

COMMIT;

-- ── Conférence après application ─────────────────────────────────────
-- 1. Les trois tables et leurs contraintes :
--      \d meal_slots
--      \d meal_slot_classes
--      \d meal_slot_students
--
-- 2. ⚠️ AUCUN CHECK d'enum (il ne doit y avoir que ceux écrits ici, sur
--    dia_semana et les tolérances). Un CHECK sur une colonne texte signifie
--    que quelqu'un a ajouté un @Enumerated au modèle sans la migration :
--      SELECT conname FROM pg_constraint
--       WHERE conrelid IN ('meal_slots'::regclass,'meal_slot_classes'::regclass,
--                          'meal_slot_students'::regclass)
--         AND contype = 'c';
--    Attendu : ck_meal_slots_dia, ck_meal_slots_tolerancia — rien d'autre.
--
-- 3. Le seed (V023) n'est PAS dans ce fichier : la structure et les données
--    de l'affiche se déploient séparément, pour qu'un seed raté n'oblige pas
--    à défaire la structure.
