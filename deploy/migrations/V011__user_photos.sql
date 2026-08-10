-- MAGBO Access Control — V011: tabela user_photos
-- Fotos de identificacao das pessoas, guardadas NO BANCO.
-- Idempotente: pode ser executado mais de uma vez.
--
-- Fonte da verdade: backend/src/main/java/com/magbo/access/models/UserPhoto.java
--
-- ── POR QUE NO BANCO ────────────────────────────────────────────────────────
-- O container do backend (deploy/docker-compose.yml) monta UM volume:
--   ../backend/target  ->  /app
-- Esse diretorio e a saida do Maven: `mvn clean` o apaga e todo build o
-- reescreve. Foto escrita ali nao sobrevive ao proprio procedimento de deploy;
-- escrita em qualquer outro caminho do container, nao sobrevive a um recreate.
-- Guardar em disco exigiria um volume novo — mudanca de deploy, decisao a parte.
--
-- No Postgres elas entram de graca no backup que JA existe (pg_dump -F c do
-- magbodb, secao 4 deste README e a skill backup-restauracao). ~1200 fotos de
-- ~20KB sao ~25MB.
--
-- ── POR QUE TABELA PROPRIA E NAO COLUNA EM app_users ────────────────────────
-- userRepository.findAll() roda em caminho quente (listStaff, filtro de tipo do
-- Journal, GET /api/users que alimenta o userCache). Uma coluna bytea na
-- entidade User arrastaria ~25MB para a memoria em cada uma dessas chamadas.
-- Com tabela separada, nenhuma consulta existente muda.
--
-- ⚠️ BYTEA e nao OID/LARGE OBJECT. O bytea viaja no pg_dump como qualquer
-- coluna; o large object exige --blobs e um caminho de restauracao proprio, e
-- e exatamente esse tipo de detalhe que se descobre no dia em que o backup
-- precisa ser usado. No Java isto corresponde a `byte[]` SEM @Lob.
--
-- ── FOTOS DE MENORES ────────────────────────────────────────────────────────
-- Sem FK para app_users, seguindo a convencao do projeto (nenhuma tabela tem):
-- a integridade e mantida no codigo. A contrapartida esta implementada:
-- StaffAdminService.deleteStaff apaga a foto junto, e ha um DELETE explicito no
-- controller de admin — a exclusao e DEFINITIVA, sem soft delete, porque o
-- direito de apagar a imagem de uma crianca nao se atende escondendo a linha.
--
-- ADITIVA: cria uma tabela NOVA. Nao toca em app_users nem em nenhuma existente.

CREATE TABLE IF NOT EXISTS user_photos (
    user_id           VARCHAR(64)  PRIMARY KEY,
    content_type      VARCHAR(32)  NOT NULL,
    bytes             BYTEA        NOT NULL,
    byte_size         INTEGER      NOT NULL,
    sha256            VARCHAR(64)  NOT NULL,
    original_filename VARCHAR(255),
    updated_by        VARCHAR(50)  NOT NULL,
    updated_at        TIMESTAMP    NOT NULL
);

-- Sem indice alem da PK, e de proposito: a tabela e lida por user_id (a chave)
-- e contada inteira no resumo do import. Nao ha consulta por sha256 nem por
-- data — um indice ali so custaria escrita.
