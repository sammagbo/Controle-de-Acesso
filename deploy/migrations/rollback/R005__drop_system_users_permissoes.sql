-- !! EMERGENCIA APENAS. Remove a coluna 'permissoes' de system_users e os valores nela.
-- So use se a Fase F foi revertida no codigo E a coluna precisa sumir.
-- Na maioria dos casos NAO e' necessario: a coluna fica inerte e inofensiva
-- (o codigo antigo simplesmente nao a le).
-- ATENCAO: remove as permissoes granulares de TODOS os operadores. NAO os apaga
-- (as linhas de system_users permanecem), apenas zera a granularidade.
ALTER TABLE system_users DROP COLUMN IF EXISTS permissoes;
