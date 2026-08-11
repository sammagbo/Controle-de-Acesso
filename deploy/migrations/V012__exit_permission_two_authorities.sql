-- =====================================================================
-- V012 — AUTORIZAÇÃO DE SAÍDA: DUAS AUTORIDADES
-- =====================================================================
-- A saída de um aluno tem duas autoridades distintas, e o registro precisa
-- dizer QUAL delas agiu:
--   • a FAMÍLIA — o responsável (pai, mãe, guardião) que autorizou;
--   • a ESCOLA  — o membro da Vie Scolaire que autorizou ou referendou.
-- Qualquer uma pode aparecer sozinha, ou as duas juntas.
--
-- ⚠️⚠️ ESTA MIGRAÇÃO É OBRIGATÓRIA NO PC TAMBÉM, e é a PRIMEIRA que é.
--
-- O padrão do projeto é "o PC usa ddl-auto=update e não precisa dos SQLs; a
-- VM precisa". Aqui não vale, e a razão é mecânica: `ddl-auto=update`
-- ACRESCENTA, mas NUNCA remove. Ao tirar o campo `reason` da entidade Java, o
-- Hibernate para de incluí-lo no INSERT — e a coluna continua NOT NULL no
-- banco que não recebeu este arquivo. Resultado: **todo INSERT em
-- student_exit_permissions falha**, no PC e na VM, com erro de driver e não
-- com mensagem de validação. Aplicar ANTES de subir o backend novo.
--
-- POR QUE REMOVER `reason` EM VEZ DE RENOMEAR:
-- A coluna nunca significou "motivo". O formulário tinha um campo rotulado
-- "Autorizado por (Responsável)" e o front o gravava em `reason`
-- (js/utils/exitPermission.js: `reason: form.autorizadoPor`). Renomeá-la para
-- authorized_by_family gravaria o acidente na história do schema — a migração
-- passaria a afirmar que aquela coluna sempre guardou o autorizador da
-- família, o que não é verdade: ela guardava o que fosse digitado num campo
-- que ficava no lugar errado.
--
-- POR QUE DÁ PARA REMOVER SEM MEDO:
-- Produção conferida pelo Sam antes desta entrega: UMA linha, com
-- reason = 'teste'. A funcionalidade nunca foi usada. Não há dado real a
-- preservar, e por isso não há backfill neste arquivo — copiar 'teste' para
-- authorized_by_family deixaria, numa tabela sobre quem autorizou uma criança
-- a sair da escola, a afirmação de que alguém chamado "teste" autorizou uma
-- saída.
--
-- ⚠️ Exceção consciente à regra "mudanças de banco são só aditivas"
-- (CLAUDE.md). A regra existe porque ddl-auto não entrega mudança destrutiva e
-- os ambientes divergiriam em silêncio. Aqui a divergência é evitada do único
-- jeito possível: aplicando este arquivo à mão nos DOIS ambientes.
--
-- Idempotente: pode rodar duas vezes sem erro.
-- Rollback: rollback/R012__exit_permission_two_authorities.sql
-- =====================================================================

BEGIN;

-- ── 1. As duas colunas novas, ambas NULÁVEIS ─────────────────────────
-- Nuláveis porque a regra é "pelo menos uma das duas", e isso um NOT NULL
-- não expressa. A exigência vive no ExitPermissionService, onde falha com
-- mensagem que o operador entende — ver a nota sobre CHECK abaixo.
ALTER TABLE student_exit_permissions
    ADD COLUMN IF NOT EXISTS authorized_by_family VARCHAR(255);

ALTER TABLE student_exit_permissions
    ADD COLUMN IF NOT EXISTS authorized_by_school VARCHAR(255);

COMMENT ON COLUMN student_exit_permissions.authorized_by_family IS
    'Nome do responsável da família que autorizou (pai, mãe, guardião).';
COMMENT ON COLUMN student_exit_permissions.authorized_by_school IS
    'Nome do membro da Vie Scolaire que autorizou ou referendou. NÃO é created_by: created_by é quem DIGITOU o registro, e nem sempre é quem autorizou.';

-- ── 2. A linha de teste ──────────────────────────────────────────────
-- Única linha da tabela em produção (conferida em 12/08/2026). Sem ela, o
-- passo 3 deixaria uma autorização de saída sem autoridade nenhuma — um
-- registro que a validação nova nunca teria aceitado.
DELETE FROM student_exit_permissions
 WHERE reason = 'teste'
   AND authorized_by_family IS NULL
   AND authorized_by_school IS NULL;

-- ── 3. Fora a coluna que nunca teve o significado do seu nome ────────
ALTER TABLE student_exit_permissions
    DROP COLUMN IF EXISTS reason;

COMMIT;

-- ── Sem CHECK para "pelo menos uma das duas", de propósito ───────────
-- Um CHECK aqui seria barato de escrever e caro de manter: o Hibernate não o
-- gera (não é enum), então ele existiria só onde este arquivo rodou, e
-- `ddl-auto=update` NUNCA altera um CHECK já existente — a mesma armadilha de
-- meal_entitlement_events.source e access_attempts.denial_reason, que já
-- mordeu duas vezes. Além disso, a regra pode afrouxar (uma saída autorizada
-- só pela direção, por exemplo) e um CHECK a congelaria no banco, onde muda
-- por migração manual em vez de por deploy.
-- A exigência vive no ExitPermissionService, com teste.

-- ── Conferência depois de aplicar ────────────────────────────────────
-- \d student_edit_permissions  →  deve mostrar as duas colunas novas e
--                                 NÃO deve mostrar `reason`.
-- SELECT count(*) FROM student_exit_permissions;  →  0 (era 1, a de teste)
