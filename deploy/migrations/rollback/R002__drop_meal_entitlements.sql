-- !! EMERGENCIA APENAS. Apaga a tabela meal_entitlements e TODOS os dados nela.
-- So use se a Fase C foi revertida no codigo E a tabela precisa sumir.
-- Na maioria dos casos NAO e' necessario: a tabela fica inerte e inofensiva.
-- ATENCAO: apaga os direitos a refeicao cadastrados. O historico (meal_entitlement_events)
-- e' tabela separada (ver R003).
DROP TABLE IF EXISTS meal_entitlements;
