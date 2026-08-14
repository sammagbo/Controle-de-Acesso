-- MAGBO Access Control — V015: motivos de recusa do régime de sortie
-- Amplia o CHECK de access_attempts.denial_reason com os dois valores novos
-- do enum DenialReason. Idempotente.
--
-- POR QUE ESTE ARQUIVO EXISTE (a mesma razão da V009, e ela já custou caro
-- duas vezes): o Hibernate gera os CHECK de @Enumerated(STRING) ao CRIAR a
-- tabela, mas com ddl-auto=update ele NÃO altera um CHECK que já existe. Na VM
-- a tabela access_attempts já está criada com a lista de 12 valores; sem esta
-- migração, todo INSERT de tentativa com motivo de regime falharia — e falharia
-- SÓ NA VM. No PC o ddl-auto também não mexe, e nos testes o H2 recria a tabela
-- do zero com a lista nova. Ou seja: a suíte fica verde e a produção quebra.
-- Registrado em .claude/rules/database.md.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/DenialReason.java
--
-- Novos valores:
--   REGIME_NOT_ALLOWED — o regime ANUAL não autoriza esta saída (aluno de
--                        regime 1 no meio da jornada, sem permissão pontual).
--                        Distinto de EXIT_NOT_AUTHORIZED, que é a ausência de
--                        permissão PONTUAL: aqui a pontual já foi consultada.
--   REGIME_TO_VERIFY   — o regime não decide sozinho: falta a GRADE horária
--                        (aluno de regime 2, que pode sair havendo ausência de
--                        professor). NÃO é objeção do MAGBO: é o registro de que
--                        ele não sabe. Existe porque um veredicto que ninguém
--                        consegue contar depois não pode ser melhorado.
--   REGIME_UNKNOWN     — não há regime cadastrado. Só aparece quando
--                        magbo.regime.desconhecido=DENY; no padrão
--                        (OBSERVATION) nada é gravado, porque no dia 1 são 923
--                        alunos sem regime e 923 linhas por dia afogariam o feed.
--
-- ADITIVA: os 12 valores anteriores continuam aceitos. Nenhuma linha existente
-- é invalidada.
--
-- ⚠️ APLICAR ANTES de ligar magbo.regime.habilitado na VM.

DO $$ BEGIN
  ALTER TABLE access_attempts DROP CONSTRAINT IF EXISTS access_attempts_denial_reason_check;
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_denial_reason_check
    CHECK (denial_reason IN (
      'MEAL_NOT_ENTITLED','OUTSIDE_MEAL_TIME','DUPLICATE_MEAL',
      'EXIT_NOT_AUTHORIZED','OUTSIDE_EXIT_WINDOW','USER_INACTIVE',
      'UNKNOWN_USER','MISSING_DOOR_MAPPING','DEVICE_DENIED',
      'UNKNOWN_FACE','AMBIGUOUS_NAME',
      'REGIME_NOT_ALLOWED','REGIME_UNKNOWN','REGIME_TO_VERIFY',
      'NORMAL'
    ));
END $$;
