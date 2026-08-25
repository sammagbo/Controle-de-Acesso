-- =====================================================================
-- R020 — desfaz V020 (tabela cantine_removals)
-- =====================================================================
-- ⚠️ ISTO APAGA DADOS. As retiradas registadas — quem retirou cada linha, e
-- quando — desaparecem. Não há cópia noutro sítio: `cantine_removals` é a
-- única testemunha desses gestos, tal como `user_photos` é a única das fotos.
-- Recuperar exige o `pg_dump` anterior.
--
-- ⚠️ Mas NENHUMA PASSAGEM se perde, e é a diferença que importa. A retirada é
-- um gesto de ECRÃ: nunca tocou em `access_logs`, nunca fechou presença do
-- PPMS, nunca entrou num relatório de visita. Derrubar esta tabela devolve o
-- Moniteur Cantine ao que ele mostrava antes — todas as linhas visíveis, nada
-- escondido — e mais nada no sistema muda.
--
-- ⚠️ E O BACKEND NOVO NÃO SOBREVIVE A ISTO. `CantineRemovalService` consulta a
-- tabela a cada ciclo do monitor: sem ela, a tela da cantina passa a dar erro.
-- Este rollback pressupõe que o jar ANTERIOR volta também — a ordem é derrubar
-- o backend, voltar o jar, e só então correr este ficheiro. Ao contrário dos
-- rollbacks de índice (R016/R018/R019), este NÃO é seguro com o jar novo no ar.
--
-- Uso legítimo: a V020 foi aplicada por engano no ambiente errado, ou a
-- funcionalidade é revertida por inteiro.
--
-- ⚠️ COM transação, ao contrário de R016/R018/R019: aqui não há CONCURRENTLY.
-- Um DROP TABLE é rápido e deve ser atómico com o DROP INDEX que o acompanha.
-- =====================================================================

BEGIN;

-- O índice cai junto com a tabela; o DROP explícito é para o caso de alguém
-- ter aplicado só a segunda metade da V020.
DROP INDEX IF EXISTS idx_cantine_removals_dia;
DROP TABLE IF EXISTS cantine_removals;

COMMIT;

-- ── Conferência depois de aplicar ────────────────────────────────────
--   SELECT to_regclass('cantine_removals');   → NULL = a tabela já não existe
--
-- ⚠️ Se o backend NOVO ainda estiver no ar, o `ddl-auto=update` recria a tabela
-- no próximo boot — vazia, e com o schema escrito pelo Hibernate em vez de pelo
-- procedimento. É exactamente a divergência que a V017 existiu para fechar.
-- Confirmar que o jar antigo está a correr ANTES de dar isto por concluído.
