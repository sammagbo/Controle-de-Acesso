-- =====================================================================
-- R014 — desfaz V014 (régime de sortie)
-- =====================================================================
-- ⚠️ APAGA A PROVA. student_regimes guarda quem, na família, autorizou cada
-- criança a sair sozinha, e student_regime_events guarda quando isso mudou e
-- por ordem de quem. Não há cópia em lugar nenhum: o carnet de papel está com
-- o aluno, e o que a escola tem de próprio é esta tabela.
--
-- Rodar isto depois de a Vie Scolaire ter cadastrado os regimes significa
-- redigitar 923 autorizações a partir dos papéis assinados — se os papéis
-- ainda existirem. Fazer `pg_dump` ANTES, sempre.
--
-- Só existe para desfazer uma aplicação ERRADA da V014 num banco onde ela
-- ainda não recebeu dado real.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS student_regime_events;
DROP TABLE IF EXISTS student_regimes;

COMMIT;
