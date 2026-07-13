# Regras — Banco de dados

- PostgreSQL 16, container `magbo-postgres`, db `magbodb`, user `magbo` (senha dev `magbo_dev_pass_2026`). Porta 5432 exclusiva — conflita com `magbo-db` (legado) e `meetingmanager_db`.
- Schema por `ddl-auto=update`: **só cria/adiciona**; nunca remove coluna nem relaxa constraint. Precedente: `door_mappings.door_no` exigiu `ALTER ... DROP NOT NULL` manual no PC (VM nasce correta).
- Tabelas: `app_users` (id String PK, nome, tipo, turma, foto_url, responsavel_id, responsavel2_id, meal_count, ativo, hikvision_employee_id UNIQUE) · `access_logs` (id BIGSERIAL, user_id, point_id, action, timestamp, created_by_user, flag) · `door_mappings` (id, terminal_ip, door_no NULL, reader_no, point_id, action, label, ativo, created_at, updated_at) · `class_schedules` (classe PK, lun/mar/mer/jeu/ven_midi VARCHAR(8); 'N' = sem refeição) · `responsaveis` · `system_users`.
- `meal_count` está **dormante** (nada incrementa); contagem real deriva de access_logs. Não usar sem decisão.
- `data.sql` (seed QA) usa sintaxe H2 (`MERGE ... KEY`) — em prod falha silenciosa (`continue-on-error=true`). Não confiar nesses dados fora do dev.
- Mudanças de schema: sempre aditivas + coluna nullable; registrar no relatório de arquitetura.
- Dump p/ migração VM: fazer APÓS correções de constraint locais, para o schema viajar certo.
