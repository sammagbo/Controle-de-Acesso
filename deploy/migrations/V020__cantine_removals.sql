-- =====================================================================
-- V020 — cantine_removals: a retirada manual de uma linha do Moniteur Cantine
-- =====================================================================
-- O operador ao balcão vê uma linha em «Dans la cantine» ou «Doit sortir» que
-- ele SABE estar errada: a pessoa saiu e o leitor da saída não a viu. Até aqui
-- só havia o botão «Vider l'écran», que escondia TUDO, em memória, sem
-- registar nada e sem sobreviver a um F5.
--
-- ⚠️ ISTO É UM GESTO DE ECRÃ, E CONTINUA A SÊ-LO. Nada aqui toca em
-- `access_logs`: nenhuma SAIDA sintética é gravada, a presença do PPMS **não**
-- é fechada e os relatórios de visita não mudam.
--
-- Foi a alternativa RECUSADA, e vale registar porquê: reaproveitar o mecanismo
-- do `FECHAMENTO_AUTO` (uma SAIDA sintética com um `flag` novo) custava **zero
-- migrações** — a coluna `flag` não tem CHECK, verificado em PostgreSQL real
-- em 10/08/2026. Mas uma SAIDA sintética fecha também a presença do PPMS e
-- entra nos relatórios de visita: o ecrã de evacuação passaria a afirmar que
-- uma criança saiu da escola porque alguém limpou uma coluna. Esse ecrã é
-- aberto num pátio, e a lista dele responde a uma pergunta só — quem pode
-- ainda estar lá dentro. Uma tabela custa mais hoje e não mente lá.
--
-- ── ⚠️ SEM NENHUMA COLUNA DE ENUM, DE PROPÓSITO ──────────────────────
-- `tests/migrations.test.js` exige CHECK para toda coluna @Enumerated(STRING)
-- de tabela criada por migração, e a lição da V014/V017 é que a migração passa
-- a ser a AUTORA do schema naquele ambiente: o `ddl-auto=update` acrescenta
-- coluna e tabela, mas **nunca** altera nem cria CHECK em tabela que já existe.
-- Uma VM atualizada por este ficheiro e uma VM nova criada pelo Hibernate
-- ficariam com schemas diferentes, e a falha aparece semanas depois.
-- Sem enum não há CHECK a divergir. O único campo livre é `motivo`, texto.
--
-- ── A CHAVE: (user_id, point_id, dia) ────────────────────────────────
-- `point_id` porque o monitor mostra REFEI1, REFEI2 e CANTINA1 na MESMA tela e
-- a mesma pessoa pode ter linha em mais do que um: retirar «a pessoa» em vez
-- de «a linha» esconderia a passagem que ninguém pediu para esconder. É também
-- a coluna que o `@PreAuthorize` usa (`@areaSecurity.can(#pointId)`) para que
-- um operador de um sítio não apague a linha de outro.
--
-- `dia` porque o monitor reinicia à meia-noite. Sem ele, uma retirada de
-- setembro continuaria a esconder alguém em junho.
--
-- ── ⚠️ `removido_em` NÃO É AUDITORIA, É A REGRA ──────────────────────
-- A tela só esconde as passagens ANTERIORES a este instante. Se a pessoa
-- voltar a entrar às 13h depois de ter sido retirada às 12h30, a entrada nova
-- reaparece. Uma retirada que calasse também o que ainda não aconteceu
-- transformaria um gesto de limpeza numa ordem para o ecrã mentir pelo resto
-- do dia — e quem carregou no × às 12h30 não sabia nada sobre as 13h.
--
-- ── DESFAZER É SOFT ──────────────────────────────────────────────────
-- Como toda revogação neste projeto. Um clique errado esconderia uma pessoa
-- até à meia-noite num ecrã cuja única função é dizer quem está no refeitório.
-- A linha não é apagada; uma retirada nova sobre a mesma pessoa/ponto/dia
-- REUTILIZA a linha (a UNIQUE garante uma só) e limpa `desfeito_*`.
--
-- ── APLICAÇÃO ────────────────────────────────────────────────────────
-- ⚠️ ADITIVA, mas NECESSÁRIA NA VM ANTES de subir o backend novo. O
-- `ddl-auto=update` criaria a tabela sozinho — e é justamente isso que não se
-- quer: quem cria escreve o schema, e duas instalações com autores diferentes
-- é a divergência que a V017 existiu para fechar.
-- Rollback: rollback/R020__drop_cantine_removals.sql
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cantine_removals (
    id            BIGSERIAL PRIMARY KEY,
    user_id       VARCHAR(64)  NOT NULL,
    point_id      VARCHAR(32)  NOT NULL,
    dia           DATE         NOT NULL,
    removido_em   TIMESTAMP    NOT NULL,
    removido_por  VARCHAR(50)  NOT NULL,
    motivo        VARCHAR(255),
    desfeito_em   TIMESTAMP,
    desfeito_por  VARCHAR(50),
    CONSTRAINT uq_cantine_removals_pessoa_ponto_dia UNIQUE (user_id, point_id, dia)
);

-- A consulta do monitor é sempre "as ativas de HOJE", a cada 3 s.
CREATE INDEX IF NOT EXISTS idx_cantine_removals_dia
    ON cantine_removals (dia);

COMMENT ON TABLE cantine_removals IS
    'Retirada manual de uma linha do Moniteur Cantine. Gesto de ecra: NAO toca em access_logs, NAO fecha presenca do PPMS, NAO entra em relatorio de visita. Ver V020.';
COMMENT ON COLUMN cantine_removals.removido_em IS
    'Instante da retirada. E REGRA, nao auditoria: so as passagens ANTERIORES a ele sao escondidas, para que uma entrada nova reapareca.';
COMMENT ON COLUMN cantine_removals.desfeito_em IS
    'Desfazer e soft. NULL = retirada ativa.';

COMMIT;

-- ── Conferência depois de aplicar ────────────────────────────────────
-- 1. A tabela e a UNIQUE existem:
--      \d cantine_removals
--    Devem aparecer as 9 colunas e
--    "uq_cantine_removals_pessoa_ponto_dia" UNIQUE CONSTRAINT (user_id, point_id, dia).
--
-- 2. ⚠️ O Hibernate NÃO acrescentou nada por cima (se acrescentou, o backend
--    subiu antes desta migração e as duas instalações já divergem):
--      SELECT column_name, data_type, character_maximum_length
--        FROM information_schema.columns
--       WHERE table_name = 'cantine_removals' ORDER BY ordinal_position;
--
-- 3. Nenhum CHECK — a tabela não tem coluna de enum, e é isso que se confere:
--      SELECT conname, contype FROM pg_constraint
--       WHERE conrelid = 'cantine_removals'::regclass;
--    Esperado: só a PRIMARY KEY e a UNIQUE. Um CHECK aqui significa que alguém
--    acrescentou um enum ao modelo sem acrescentar a migração correspondente.
