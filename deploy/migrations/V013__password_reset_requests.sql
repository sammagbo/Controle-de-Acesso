-- =====================================================================
-- V013 — PEDIDOS DE REDEFINIÇÃO DE SENHA ("esqueci a senha" offline)
-- =====================================================================
-- O sistema roda na rede interna, sem e-mail: o "esqueci a senha" é um pedido
-- REGISTRADO que o admin vê na área administrativa, trata pela gestão de
-- operadores e marca como tratado. Esta tabela é o bilhete entre os dois.
--
-- O username é O QUE FOI DIGITADO, sem FK para system_users, de propósito:
-- o pedido nasce de quem não conseguiu entrar — inclusive com o nome errado,
-- e o erro é informação para o admin. Ver PasswordResetRequestController
-- (resposta genérica sempre, dedupe de pendente, teto de 200).
--
-- Aditiva pura: o PC (ddl-auto) cria sozinho; a VM aplica este arquivo ANTES
-- de subir o backend novo. Idempotente.
-- Rollback: rollback/R013__drop_password_reset_requests.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id           BIGSERIAL PRIMARY KEY,
    username     VARCHAR(50)  NOT NULL,
    requested_at TIMESTAMP    NOT NULL,
    -- ⚠️ CHECK espelhando o enum Java (Hibernate 6 o gera ao criar a tabela;
    -- valor novo no enum Status → atualizar AQUI na mesma entrega, senão o
    -- INSERT falha só na VM — a armadilha de sempre dos CHECKs de enum).
    status       VARCHAR(16)  NOT NULL CHECK (status IN ('PENDING', 'HANDLED')),
    handled_by   VARCHAR(50),
    handled_at   TIMESTAMP
);

-- A consulta do admin ordena por (status, requested_at DESC); a do dedupe
-- busca pendente por username sem caixa.
CREATE INDEX IF NOT EXISTS idx_prr_status_requested
    ON password_reset_requests (status, requested_at DESC);
