-- MAGBO Access Control — V005: permissoes granulares em system_users
-- Fase F. Adiciona a coluna 'permissoes' (CSV de permissoes granulares) a uma tabela EXISTENTE.
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/SystemUser.java
--   @Column(name = "permissoes", length = 255)  -> VARCHAR(255), nullable.
--
-- ATENCAO: NULLABLE, obrigatoriamente. Operadores ja existentes tem 'permissoes' = null;
-- um NOT NULL aqui os invalidaria. null = nenhuma permissao granular (nao remove nada do
-- que 'setores_permitidos' ja concede). Valores reconhecidos pelo codigo:
-- MEAL_ENTITLEMENT_WRITE, EXIT_PERMISSION_WRITE, ATTEMPTS_READ; "*" = todas.
-- Sem CHECK: no Java e' String livre (CSV), sem enum — Hibernate nao gera CHECK aqui.

ALTER TABLE system_users ADD COLUMN IF NOT EXISTS permissoes VARCHAR(255);
