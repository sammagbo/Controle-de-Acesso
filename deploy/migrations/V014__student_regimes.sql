-- =====================================================================
-- V014 — RÉGIME DE SORTIE: o direito ANUAL de sair
-- =====================================================================
-- O que entra aqui é a informação que hoje vive no carnet de correspondance
-- de cada aluno e na memória do adulto que está no portão: sob que regime
-- aquela criança pode sair do estabelecimento.
--
-- Referência: circulaire n° 96-248 du 25 octobre 1996. Dois eixos, ambos
-- fixados por escrito pelos responsáveis legais no início do ano:
--   • régime général : EXTERNE | DEMI_PENSIONNAIRE | INTERNE
--   • régime de sortie : REGIME_1 (surveillé) | REGIME_2 (semi-libre)
--                        | REGIME_3 (libre)
--
-- ⚠️ NÃO SUBSTITUI student_exit_permissions, e as duas tabelas precisam
-- existir. O regime é a regra PERMANENTE do ano ("esta criança pode, em
-- geral, sair sozinha?"); a permissão é a exceção PONTUAL ("hoje às 14h ela
-- vai ao dentista"). A permissão vence o regime — é para isso que ela existe.
--
-- ⚠️ NADA É APAGADO. Regime é PROVA de uma decisão dos responsáveis legais.
-- Quando muda no meio do ano, a linha antiga recebe encerrado_em e uma nova
-- nasce; as duas ficam. E toda alteração escreve em student_regime_events na
-- MESMA transação — mesma disciplina de meal_entitlement_events, e aqui ainda
-- mais forte: sem histórico, a escola não consegue provar que agiu conforme o
-- que a família autorizou.
--
-- ADITIVA: duas tabelas novas, nenhuma coluna alterada, nenhum dado tocado.
-- O PC (ddl-auto=update) as cria sozinho; a VM precisa deste arquivo.
-- Idempotente: pode rodar duas vezes sem erro.
-- Rollback: rollback/R014__drop_student_regimes.sql
-- =====================================================================

BEGIN;

-- ── 1. O regime vigente (e os encerrados) ────────────────────────────
CREATE TABLE IF NOT EXISTS student_regimes (
    id                   BIGSERIAL PRIMARY KEY,
    user_id              VARCHAR(64)  NOT NULL,
    regime_general       VARCHAR(32)  NOT NULL,
    regime_sortie        VARCHAR(32)  NOT NULL,
    valid_from           DATE         NOT NULL,
    valid_until          DATE,
    authorized_by_family VARCHAR(255) NOT NULL,
    documento_ref        VARCHAR(255),
    assinado_em          DATE,
    note                 VARCHAR(500),
    created_by           VARCHAR(64)  NOT NULL,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by           VARCHAR(64),
    updated_at           TIMESTAMP,
    encerrado_em         TIMESTAMP,
    encerrado_por        VARCHAR(64)
);

COMMENT ON TABLE  student_regimes IS
    'Régime de sortie e régime général por aluno, com validade e origem da autorização. Circulaire 96-248.';
COMMENT ON COLUMN student_regimes.authorized_by_family IS
    'Nome do responsável legal que assinou. NOT NULL de propósito: a família decide o regime, não a escola — uma linha sem autor afirmaria que uma criança pode sair sozinha sem ninguém ter dito isso.';
COMMENT ON COLUMN student_regimes.documento_ref IS
    'Referência do papel assinado (nº do carnet, "fiche de rentrée 2026"). É o que permite achar o original no arquivo.';
COMMENT ON COLUMN student_regimes.valid_until IS
    'NULL = até segunda ordem. Nullable de propósito: obrigar uma data de fim faria todo aluno virar INCONNU num dia de junho que ninguém escolheu.';
COMMENT ON COLUMN student_regimes.encerrado_em IS
    'Soft delete. Regime encerrado sai da vigência mas continua na tabela — é prova.';

-- ⚠️ SEM constraint de unicidade para "um regime vigente por aluno".
-- A exclusão correta seria por INTERVALO (EXCLUDE USING gist com daterange), que
-- o Hibernate não gera, que o `ddl-auto=update` do PC nunca criaria e que
-- portanto existiria só onde este arquivo rodou — a mesma armadilha já paga
-- duas vezes (meal_entitlement_events.source, access_attempts.denial_reason).
-- A regra vive no RegimeSortieService, com teste, e a consulta de vigência
-- ordena por (valid_from DESC, id DESC) para que duas linhas sobrepostas nunca
-- produzam resposta que varia entre chamadas.

CREATE INDEX IF NOT EXISTS idx_student_regimes_user
    ON student_regimes (user_id);
-- Índice da consulta QUENTE: o portão pergunta "regime vigente deste aluno
-- hoje?" a cada saída. Sem ele, cada passagem varre a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_student_regimes_vigencia
    ON student_regimes (user_id, valid_from);

-- ── 2. O histórico ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_regime_events (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            VARCHAR(64) NOT NULL,
    regime_id          BIGINT,
    old_regime_sortie  VARCHAR(32),
    new_regime_sortie  VARCHAR(32),
    old_regime_general VARCHAR(32),
    new_regime_general VARCHAR(32),
    old_authorized_by  VARCHAR(255),
    new_authorized_by  VARCHAR(255),
    changed_by         VARCHAR(64) NOT NULL,
    changed_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note               VARCHAR(500),
    source             VARCHAR(16) NOT NULL
);

COMMENT ON COLUMN student_regime_events.old_authorized_by IS
    'Quem, na família, autorizava ANTES. É o único campo que a entidade chama de prova, e trocar quem assinou tem de deixar rastro.';
COMMENT ON TABLE student_regime_events IS
    'Histórico obrigatório de student_regimes. Toda alteração grava aqui na MESMA transação.';

CREATE INDEX IF NOT EXISTS idx_regime_events_user
    ON student_regime_events (user_id);
CREATE INDEX IF NOT EXISTS idx_regime_events_quando
    ON student_regime_events (changed_at);

-- ── 3. O CHECK de `source`, que é MANUAL ─────────────────────────────
-- ⚠️ O Hibernate NÃO gera este CHECK: no Java `source` é String livre, não
-- enum. Logo ele existe SÓ na VM (por este arquivo) — nem o PC (ddl-auto) nem
-- os testes (H2 create-drop) o têm. Valor novo de `source` no código exige
-- atualizar este CHECK na MESMA entrega, senão o INSERT falha SÓ NA VM, em
-- produção, e não no ambiente onde foi testado. É exatamente a armadilha de
-- meal_entitlement_events.source, documentada em .claude/rules/database.md.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_regime_events_source'
    ) THEN
        ALTER TABLE student_regime_events
            ADD CONSTRAINT chk_regime_events_source
            CHECK (source IN ('UI', 'BULK', 'API'));
    END IF;
END $$;

COMMIT;

-- ── Conferência depois de aplicar ────────────────────────────────────
-- \d student_regimes         → 16 colunas, 2 índices além da PK
-- \d student_regime_events   → CHECK chk_regime_events_source presente
-- SELECT count(*) FROM student_regimes;  → 0 (tabela nasce vazia; os regimes
--                                           entram pela tela da Vie Scolaire
--                                           ou pela importação em lote)
--
-- ⚠️ NO DIA 1 A TABELA ESTÁ VAZIA e isso é esperado: todo aluno responde
-- INCONNU (cinza), nunca NON_AUTORISE. A propriedade magbo.regime.desconhecido
-- nasce em OBSERVATION exatamente por isso; trocá-la para DENY antes de
-- carregar os regimes pintaria a escola inteira de vermelho.
