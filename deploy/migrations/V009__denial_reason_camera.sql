-- MAGBO Access Control — V009: motivos de recusa das cameras da portaria
-- Amplia o CHECK de access_attempts.denial_reason com os dois valores novos
-- do enum DenialReason. Idempotente.
--
-- POR QUE ESTE ARQUIVO EXISTE: o Hibernate gera os CHECK de @Enumerated(STRING)
-- ao criar a tabela, mas com ddl-auto=update ele NAO altera um CHECK que ja
-- existe. Na VM a tabela ja esta criada com a lista antiga de 10 valores, entao
-- sem esta migracao todo INSERT de tentativa vinda de camera falharia — e
-- falharia SO NA VM: no PC o ddl-auto tambem nao mexe, e nos testes o H2
-- recria a tabela do zero a cada execucao, com a lista nova. Ou seja: a suite
-- ficaria verde e a producao quebraria. E a mesma armadilha registrada em
-- .claude/rules/database.md para meal_entitlement_events.source.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/DenialReason.java
--
-- Novos valores:
--   UNKNOWN_FACE   — rosto visto, mas sem a quem atribuir: a camera nao casou
--                    (contrastFailed), casou abaixo do limiar, ou casou com um
--                    nome que nao existe em app_users.
--   AMBIGUOUS_NAME — o nome da camera casa com MAIS DE UM cadastro ativo
--                    (homonimos). Escolher um seria atribuir a passagem — e
--                    possivelmente liberar a saida — a pessoa errada.
--
-- ADITIVA: os 10 valores anteriores continuam aceitos, na mesma ordem. Nenhuma
-- linha existente e invalidada.

DO $$ BEGIN
  ALTER TABLE access_attempts DROP CONSTRAINT IF EXISTS access_attempts_denial_reason_check;
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_denial_reason_check
    CHECK (denial_reason IN (
      'MEAL_NOT_ENTITLED','OUTSIDE_MEAL_TIME','DUPLICATE_MEAL',
      'EXIT_NOT_AUTHORIZED','OUTSIDE_EXIT_WINDOW','USER_INACTIVE',
      'UNKNOWN_USER','MISSING_DOOR_MAPPING','DEVICE_DENIED',
      'UNKNOWN_FACE','AMBIGUOUS_NAME','NORMAL'
    ));
END $$;
