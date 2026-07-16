-- !! EMERGENCIA APENAS. Apaga a tabela meal_entitlement_events e TODOS os dados nela.
-- So use se a Fase C foi revertida no codigo E a tabela precisa sumir.
-- Na maioria dos casos NAO e' necessario: a tabela fica inerte e inofensiva.
-- ATENCAO: este e' o historico imutavel de mudancas de direito a refeicao. Apagar =
-- perder a auditoria. Pensar duas vezes.
DROP TABLE IF EXISTS meal_entitlement_events;
