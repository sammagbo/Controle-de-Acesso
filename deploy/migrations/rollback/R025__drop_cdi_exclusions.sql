-- =====================================================================
-- R025 — desfaz V025 (cdi_exclusions)
-- =====================================================================
-- ⚠️ APAGA AS EXCLUSOES E O SEU HISTORICO — quem excluiu, quando, porque, e
-- quem levantou. Nao ha copia noutro sitio. Recuperar exige o pg_dump
-- anterior.
--
-- ⚠️ Sao dados sobre MENORES e sobre sancoes tomadas por adultos. Apagar isto
-- nao e limpar uma tabela tecnica: e apagar o registo de decisoes
-- pedagogicas. Confirmar com a direcao antes.
--
-- ⚠️ NENHUMA PASSAGEM se perde: `access_logs` nao e tocado. A exclusao nunca
-- impediu ninguem de entrar (ADR-003) — o que volta e o CDI sem aviso, como
-- antes da V025.
--
-- ⚠️ E O BACKEND NOVO NAO SOBREVIVE: CdiExclusionService consulta a tabela a
-- cada badge. Ordem: derrubar o backend, voltar o jar anterior, so entao
-- correr isto.
-- =====================================================================
BEGIN;
DROP TABLE IF EXISTS cdi_exclusions;
COMMIT;
-- Conferencia:  SELECT to_regclass('cdi_exclusions');  -> NULL
