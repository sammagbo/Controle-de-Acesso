-- !! EMERGENCIA APENAS. Apaga a tabela access_attempts e TODOS os dados nela.
-- So use se a Fase B foi revertida no codigo E a tabela precisa sumir.
-- Na maioria dos casos NAO e' necessario: a tabela fica inerte e inofensiva
-- (o backend antigo simplesmente nao a usa). Preferir reverter comportamento/codigo.
DROP TABLE IF EXISTS access_attempts;
