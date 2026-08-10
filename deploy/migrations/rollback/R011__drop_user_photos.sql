-- ROLLBACK da V011 — remove a tabela user_photos.
--
-- ⚠️ APAGA AS FOTOS. Ao contrario dos outros rollbacks deste diretorio, este
-- destroi dado que nao esta em mais lugar nenhum: as imagens vivem SO aqui (nao
-- ha copia em disco, e por isso que elas estao no banco). Restaurar exige o
-- dump anterior ou reimportar os arquivos de origem.
--
-- Antes de rodar, o backup:
--   docker exec magbo-postgres pg_dump -U magbo -d magbodb -F c -f /tmp/pre-r011.dump
--   docker cp magbo-postgres:/tmp/pre-r011.dump ./
--
-- Nao ha nada a limpar em app_users: a V011 nao tocou nela.

DROP TABLE IF EXISTS user_photos;
