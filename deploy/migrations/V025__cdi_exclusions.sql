-- =====================================================================
-- V025 — cdi_exclusions : qui ne doit pas entrer au CDI, et jusqu'à quand
-- =====================================================================
-- Le CDI exclut parfois un élève ou une classe entière — après un incident,
-- pendant une punition, ou le temps qu'une situation se règle. Jusqu'ici ça
-- vivait dans la tête du bibliothécaire et sur un post-it.
--
-- ── ⚠️ CE QUE CETTE TABLE NE FAIT PAS ────────────────────────────────
-- Elle N'EMPÊCHE PERSONNE D'ENTRER. Le terminal ouvre la porte de toute
-- façon (ADR-003 : le MAGBO est observationnel), et il n'est pas question de
-- transformer une exclusion pédagogique en verrou physique. Ce qu'elle fait :
-- PRÉVENIR l'adulte présent, fort et clair, au moment où la personne badge.
-- La décision de ce qui se passe ensuite appartient à cet adulte.
--
-- ── ⚠️ DONNÉE SENSIBLE SUR UN MINEUR ─────────────────────────────────
-- Une exclusion nomme un enfant et raconte une sanction. Elle est lisible
-- UNIQUEMENT avec la permission dédiée (`CDI_EXCLUSION_WRITE`) — pas par
-- secteur, pas par « qui est connecté ». Le motif est facultatif, et il est
-- volontairement en texte libre court : une liste de motifs prédéfinis
-- deviendrait une taxonomie de fautes d'enfants, et ce n'est pas au système
-- de la tenir.
--
-- ── L'HISTORIQUE EST CONSERVÉ ────────────────────────────────────────
-- Lever une exclusion ne l'efface pas : `revogado_em`/`revogado_por` sont
-- remplis et la ligne reste. Même doctrine que `student_exit_permissions` et
-- `student_regimes` — une mesure prise sur un enfant est une preuve, et une
-- preuve ne se supprime pas parce qu'elle a expiré.
--
-- ── LA PORTÉE : UN ÉLÈVE **OU** UNE TURMA ────────────────────────────
-- Exactement l'un des deux est rempli (CHECK). Deux colonnes plutôt qu'une
-- colonne « cible » + un type : sans enum en base (leçon V014/V017), et
-- surtout parce que les deux se lisent différemment — `user_id` se compare à
-- une matricule, `turma` à un code de classe.
--
-- ⚠️ APPLIQUER À LA MAIN AVANT de monter le backend (jamais ddl-auto en
-- premier : celui qui crée la table écrit le schéma — V017).
-- Rollback : rollback/R025__drop_cdi_exclusions.sql
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('cdi_exclusions') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'cdi_exclusions' AND column_name = 'revogado_em')
  THEN
    RAISE EXCEPTION USING
      MESSAGE = 'cdi_exclusions existe deja avec une AUTRE forme (revogado_em absente).',
      HINT    = 'Backend monte avant la migration ? Verifier qu elle est vide, la supprimer '
                'avec rollback/R025, rejouer V025 AVANT de remonter le backend.';
  END IF;
END $$;

-- ⚠️ `turma` NAO E UMA FOTOGRAFIA. A avaliacao compara com a turma ATUAL do
-- aluno: quem entra na turma depois herda a exclusao, quem sai dela deixa de
-- a ter. E consciente nesta versao (congelar a composicao exigiria linhas por
-- aluno) e esta escrito no ecra de criacao. Se um dia isso mudar, muda aqui
-- tambem.
--
-- ⚠️ NAO HA COLUNA DE INICIO: `criado_em` E a data de inicio. `ativaEm` recusa
-- os dias anteriores a ela — sem essa borda, uma medida posta hoje marcaria as
-- passagens da semana passada, porque o veredicto e julgado pelo relogio do
-- EVENTO.
CREATE TABLE IF NOT EXISTS cdi_exclusions (
    id            BIGSERIAL PRIMARY KEY,
    -- Exactement l'un des deux (voir le CHECK plus bas).
    user_id       VARCHAR(64),
    turma         VARCHAR(32),
    motivo        VARCHAR(255),
    -- NULL = sans fin, jusqu'à ce que quelqu'un la lève. C'est le cas le plus
    -- fréquent : obliger une date ferait inventer une échéance arbitraire.
    ate           DATE,
    criado_por    VARCHAR(50)  NOT NULL,
    criado_em     TIMESTAMP    NOT NULL DEFAULT now(),
    -- Levée = SOFT. L'historique reste.
    revogado_por  VARCHAR(50),
    revogado_em   TIMESTAMP,
    CONSTRAINT ck_cdi_exclusions_alvo CHECK (
        (user_id IS NOT NULL AND turma IS NULL)
     OR (user_id IS NULL AND turma IS NOT NULL))
);

-- La consultation est « les exclusions ACTIVES », à chaque badge.
CREATE INDEX IF NOT EXISTS idx_cdi_exclusions_ativas
    ON cdi_exclusions (revogado_em, ate);
CREATE INDEX IF NOT EXISTS idx_cdi_exclusions_user  ON cdi_exclusions (user_id);
CREATE INDEX IF NOT EXISTS idx_cdi_exclusions_turma ON cdi_exclusions (turma);

COMMENT ON TABLE cdi_exclusions IS
    'Qui ne doit pas entrer au CDI. N EMPECHE PERSONNE d entrer (ADR-003) : previent l adulte present. Donnee sensible sur mineur — lecture par permission CDI_EXCLUSION_WRITE uniquement. Voir V025.';
COMMENT ON COLUMN cdi_exclusions.ate IS
    'NULL = sans fin, jusqu a levee explicite. Le cas le plus frequent.';
COMMENT ON COLUMN cdi_exclusions.revogado_em IS
    'Levee SOFT : la ligne reste, l historique est conserve.';

COMMIT;

-- ── Conférence après application ─────────────────────────────────────
-- 1. \d cdi_exclusions → 9 colonnes, PK, le CHECK ck_cdi_exclusions_alvo,
--    et TROIS index. AUCUN autre CHECK (pas d'enum dans cette table).
-- 2. Le CHECK mord bien — les deux doivent ÉCHOUER :
--      INSERT INTO cdi_exclusions (criado_por) VALUES ('t');                        -- ni l'un ni l'autre
--      INSERT INTO cdi_exclusions (user_id,turma,criado_por) VALUES ('1','6E1','t'); -- les deux
-- 3. La table naît vide :
--      SELECT count(*) FROM cdi_exclusions;   → 0
