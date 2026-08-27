-- =====================================================================
-- R024 — desfaz V024 (system_settings)
-- =====================================================================
-- ⚠️ APAGA os ajustes feitos a ecra (e quem os fez, e quando). Nao ha copia
-- noutro sitio; recuperar exige o pg_dump anterior.
--
-- ⚠️ O comportamento NAO volta a "antes de V024": ele volta aos DEFAULTS das
-- properties. Se alguem tinha mudado a capacidade do CDI ou o teto de
-- refeicao pelo ecra, esses valores voltam ao valor do codigo — em silencio.
-- Avisar quem opera ANTES de correr isto.
--
-- ⚠️ E O BACKEND NOVO NAO SOBREVIVE: o SettingsService consulta esta tabela.
-- Ordem: derrubar o backend, voltar o jar anterior, so entao correr isto.
-- =====================================================================
BEGIN;
DROP TABLE IF EXISTS system_settings;
COMMIT;
-- Conferencia:  SELECT to_regclass('system_settings');  -> NULL
