-- =====================================================================
-- R012 — desfaz V012 (duas autoridades na autorização de saída)
-- =====================================================================
-- ⚠️ NÃO DEVOLVE O QUE FOI APAGADO. A V012 removeu a coluna `reason` e a
-- única linha que existia (a de teste). Este arquivo recria a ESTRUTURA
-- anterior; o conteúdo daquela linha não volta — e nem havia conteúdo real a
-- voltar, que foi a razão de a V012 poder removê-la.
--
-- ⚠️ Rodar isto SEM voltar o backend para a versão anterior deixa o sistema
-- quebrado nos dois sentidos: o código novo escreveria em colunas que este
-- arquivo apaga, e o `reason` recriado é NOT NULL sem valor padrão. A ordem é:
-- parar o backend → aplicar R012 → subir o backend ANTIGO.
-- =====================================================================

BEGIN;

-- ── 1. `reason` de volta ─────────────────────────────────────────────
-- Acrescentada como NULÁVEL primeiro: a tabela pode ter linhas criadas pela
-- versão nova, e um ADD COLUMN ... NOT NULL sem DEFAULT falharia sobre elas.
ALTER TABLE student_exit_permissions
    ADD COLUMN IF NOT EXISTS reason VARCHAR(255);

-- Onde havia autorização da família, ela era o que ficava em `reason` na
-- versão antiga — é a melhor reconstrução possível. Sem ela, a da escola.
UPDATE student_exit_permissions
   SET reason = COALESCE(authorized_by_family, authorized_by_school, 'MIGRACAO_R012')
 WHERE reason IS NULL;

ALTER TABLE student_exit_permissions
    ALTER COLUMN reason SET NOT NULL;

-- ── 2. Fora as colunas da V012 ───────────────────────────────────────
ALTER TABLE student_exit_permissions
    DROP COLUMN IF EXISTS authorized_by_school;

ALTER TABLE student_exit_permissions
    DROP COLUMN IF EXISTS authorized_by_family;

COMMIT;
