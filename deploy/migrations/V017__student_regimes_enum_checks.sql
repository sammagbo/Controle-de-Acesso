-- =====================================================================
-- V017 — os CHECK de enum que a V014 não criou
-- =====================================================================
-- ⚠️ ESTA MIGRAÇÃO EXISTE PARA QUE HAJA **UMA** VERDADE DE SCHEMA.
--
-- A V014 criou `student_regimes` e `student_regime_events` À MÃO, com as seis
-- colunas de enum declaradas apenas como VARCHAR(32). O Hibernate, quando é ELE
-- quem cria a tabela (@Enumerated(STRING)), escreve um CHECK inline em cada uma.
-- Resultado: duas instalações do mesmo sistema, com schemas diferentes.
--
--   • VM ATUALIZADA pelo procedimento — o backend antigo criou o schema quando
--     as entidades de regime ainda não existiam; a V014 criou as tabelas à mão,
--     sem CHECK; o backend novo subiu com `ddl-auto=update`, que **não** altera
--     tabela existente. → SEM os CHECK.
--   • VM NOVA (ou o PC, ou o H2 dos testes) — o backend cria o schema já com as
--     entidades; o Hibernate escreve os CHECK; a V014 encontra as tabelas e não
--     faz nada (`CREATE TABLE IF NOT EXISTS`). → COM os CHECK.
--
-- ⚠️ E A FALHA É INVERTIDA em relação à da V009 — chamá-las de "a mesma
-- armadilha" leva a procurar o sintoma errado. Na V009 o CHECK EXISTIA e estava
-- ESTREITO: quem quebrava era a VM, e o PC ficava verde. Aqui o CHECK NÃO EXISTE
-- na VM: hoje nada quebra em lugar nenhum, e no dia em que alguém acrescentar um
-- valor a `RegimeSortie` ou `RegimeGeneral` quem quebra é o **PC e a suíte** —
-- a VM aceita em silêncio. "Falha na minha máquina, funciona em produção" é o
-- sintoma que ninguém procura, e o valor novo entra na base de produção sem
-- nunca ter passado por uma verificação.
--
-- O dono deixa a escola em duas semanas. Quem reconstruir isto em setembro não
-- pode herdar duas verdades.
--
-- ── FORMA: EXATAMENTE a que o Hibernate escreve, e por quê ───────────
-- Sem `IS NULL OR`, mesmo nas quatro colunas nullable — ao contrário da V001 e
-- da V003, que o escrevem à mão. Não é descuido: é o que torna esta migração
-- **verificável**. O objetivo é que o `pg_get_constraintdef` dos dois caminhos
-- fique IDÊNTICO, para que qualquer pessoa possa comparar os dois schemas e ler
-- "sem diferença" em vez de julgar se duas expressões diferentes são
-- equivalentes. (Elas seriam: um CHECK que avalia NULL devolve UNKNOWN e passa.
-- Mas "equivalente" é um argumento; "idêntico" é um diff vazio.)
--
-- Os nomes seguem `<tabela>_<coluna>_check`, que é como o PostgreSQL batiza um
-- CHECK de coluna sem nome — e o Hibernate 6 emite exatamente sem nome.
--
-- ── IDEMPOTENTE PELO NOME (molde da V009) ────────────────────────────
-- `DROP CONSTRAINT IF EXISTS` seguido de `ADD CONSTRAINT` funciona nos DOIS
-- casos: cria onde não havia (VM atualizada) e substitui pelo idêntico onde o
-- Hibernate já havia criado (VM nova, PC). Rodar duas vezes não muda nada.
--
-- ADITIVA: nenhuma coluna, nenhuma linha, nenhum dado. Um CHECK que os valores
-- existentes já satisfazem — todo valor gravado veio de `Enum.name()`.
-- ⚠️ Se esta migração FALHAR com "violates check constraint", há na tabela um
-- valor que não é do enum. NÃO afrouxe o CHECK: descubra a linha
--   SELECT id, user_id, regime_general, regime_sortie FROM student_regimes
--    WHERE regime_general NOT IN ('EXTERNE','DEMI_PENSIONNAIRE','INTERNE')
--       OR regime_sortie  NOT IN ('REGIME_1','REGIME_2','REGIME_3');
-- e trate o dado, porque ele já está errado hoje.
--
-- ⚠️ AO ACRESCENTAR UM VALOR a RegimeSortie ou RegimeGeneral: atualize este
-- arquivo E crie uma migração nova que refaça os CHECK. Sem isso o INSERT falha
-- — e agora falha nos DOIS ambientes, que é exatamente o ponto.
-- Rollback: rollback/R017__drop_student_regimes_enum_checks.sql
-- =====================================================================

BEGIN;

-- ── student_regimes (as duas NOT NULL) ───────────────────────────────
-- RegimeGeneral: EXTERNE, DEMI_PENSIONNAIRE, INTERNE
DO $$ BEGIN
    ALTER TABLE student_regimes DROP CONSTRAINT IF EXISTS student_regimes_regime_general_check;
    ALTER TABLE student_regimes ADD CONSTRAINT student_regimes_regime_general_check
        CHECK (regime_general IN ('EXTERNE','DEMI_PENSIONNAIRE','INTERNE'));
END $$;

-- RegimeSortie: REGIME_1 (surveillé), REGIME_2 (semi-libre), REGIME_3 (libre)
DO $$ BEGIN
    ALTER TABLE student_regimes DROP CONSTRAINT IF EXISTS student_regimes_regime_sortie_check;
    ALTER TABLE student_regimes ADD CONSTRAINT student_regimes_regime_sortie_check
        CHECK (regime_sortie IN ('REGIME_1','REGIME_2','REGIME_3'));
END $$;

-- ── student_regime_events (as quatro nullable) ───────────────────────
-- Nullable porque o histórico grava a transição: o "de" é nulo na criação.
DO $$ BEGIN
    ALTER TABLE student_regime_events DROP CONSTRAINT IF EXISTS student_regime_events_old_regime_general_check;
    ALTER TABLE student_regime_events ADD CONSTRAINT student_regime_events_old_regime_general_check
        CHECK (old_regime_general IN ('EXTERNE','DEMI_PENSIONNAIRE','INTERNE'));
END $$;

DO $$ BEGIN
    ALTER TABLE student_regime_events DROP CONSTRAINT IF EXISTS student_regime_events_new_regime_general_check;
    ALTER TABLE student_regime_events ADD CONSTRAINT student_regime_events_new_regime_general_check
        CHECK (new_regime_general IN ('EXTERNE','DEMI_PENSIONNAIRE','INTERNE'));
END $$;

DO $$ BEGIN
    ALTER TABLE student_regime_events DROP CONSTRAINT IF EXISTS student_regime_events_old_regime_sortie_check;
    ALTER TABLE student_regime_events ADD CONSTRAINT student_regime_events_old_regime_sortie_check
        CHECK (old_regime_sortie IN ('REGIME_1','REGIME_2','REGIME_3'));
END $$;

DO $$ BEGIN
    ALTER TABLE student_regime_events DROP CONSTRAINT IF EXISTS student_regime_events_new_regime_sortie_check;
    ALTER TABLE student_regime_events ADD CONSTRAINT student_regime_events_new_regime_sortie_check
        CHECK (new_regime_sortie IN ('REGIME_1','REGIME_2','REGIME_3'));
END $$;

COMMIT;

-- ── Conferência depois de aplicar ────────────────────────────────────
-- Devem sair SEIS linhas, e as expressões têm de ser as mesmas numa VM nova:
--   SELECT conrelid::regclass AS tabela, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid IN ('student_regimes'::regclass, 'student_regime_events'::regclass)
--      AND contype = 'c'
--    ORDER BY 1, 2;
