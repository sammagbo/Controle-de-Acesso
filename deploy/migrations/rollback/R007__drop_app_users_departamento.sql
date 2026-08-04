-- !! EMERGENCIA APENAS. Remove a coluna 'departamento' de app_users e os valores nela.
-- So use se o cadastro de servidores foi revertido no codigo E a coluna precisa sumir.
-- Na maioria dos casos NAO e necessario: a coluna fica inerte e inofensiva
-- (o codigo antigo simplesmente nao a le).
-- ATENCAO: apaga o departamento de TODOS os servidores. NAO apaga as pessoas
-- (as linhas de app_users permanecem, com tipo e matricula intactos), apenas
-- perde a classificacao por setor — que so existe aqui e teria de ser
-- recadastrada a mao.
ALTER TABLE app_users DROP COLUMN IF EXISTS departamento;
