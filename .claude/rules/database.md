# Regras — Banco de dados

- PostgreSQL 16, container `magbo-postgres`, db `magbodb`, user `magbo` (senha dev `magbo_dev_pass_2026`). Porta 5432 exclusiva — conflita com `magbo-db` (legado) e `meetingmanager_db`.
- Schema por `ddl-auto=update`: **só cria/adiciona**; nunca remove coluna nem relaxa constraint. Precedente: `door_mappings.door_no` exigiu `ALTER ... DROP NOT NULL` manual no PC (VM nasce correta).
- Tabelas: `app_users` (id String PK, nome, tipo, turma, foto_url, responsavel_id, responsavel2_id, meal_count, ativo, hikvision_employee_id UNIQUE) · `access_logs` (id BIGSERIAL, user_id, point_id, action, timestamp, created_by_user, flag) · `door_mappings` (id, terminal_ip, door_no NULL, reader_no, point_id, action, label, ativo, created_at, updated_at) · `class_schedules` (classe PK, lun/mar/mer/jeu/ven_midi VARCHAR(8); 'N' = sem refeição) · `responsaveis` · `system_users`.
- `meal_count` está **dormante** (nada incrementa); contagem real deriva de access_logs. Não usar sem decisão.
- `data.sql` (seed QA) usa sintaxe H2 (`MERGE ... KEY`) — em prod falha silenciosa (`continue-on-error=true`). Não confiar nesses dados fora do dev.
- Mudanças de schema: sempre aditivas + coluna nullable; registrar no relatório de arquitetura.
- Dump p/ migração VM: fazer APÓS correções de constraint locais, para o schema viajar certo.

## Tabelas da camada de decisão (Fases A–J)
- **`access_attempts`** (id BIGSERIAL, user_id NULL, employee_no_raw NOT NULL, nome_snapshot, point_id, action, terminal_ip, auth_method, auth_result NOT NULL, authorization_result NOT NULL, denial_reason NOT NULL, hikvision_sub_event_type, timestamp NOT NULL, door_mapping_fallback). Tentativas negadas — **nunca** contamina `access_logs`.
- **`meal_entitlements`** (user_id VARCHAR PK, status NOT NULL, valid_from, valid_until, note, `days_of_week`/`meal_type` **reservados** — a regra atual IGNORA, updated_by, updated_at NOT NULL, created_at NOT NULL). **Sem linha = PENDING** (dado não preenchido ≠ negado). **Nunca** criar linha automaticamente no webhook.
- **`meal_entitlement_events`** (id, user_id NOT NULL, old_status, new_status NOT NULL, old/new_valid_from/until, changed_by NOT NULL, changed_at NOT NULL, note, source NOT NULL). **Histórico obrigatório:** toda alteração de `meal_entitlements` grava um evento **na mesma transação**.
- **`student_exit_permissions`** (id, user_id NOT NULL, permission_type NOT NULL, valid_from/until, start_time/end_time TIME, days_of_week, status NOT NULL, reason NOT NULL, note, created_by NOT NULL, created_at NOT NULL, revoked_by/at, used_at). Revogação é **soft** (nunca DELETE); SINGLE consome só em saída efetiva.
- **`system_users.permissoes`** VARCHAR(255) **nullable** (CSV granular). null não remove acesso de operador existente.
- **CHECK constraints espelham os enums Java** (Hibernate 6 gera automaticamente p/ `@Enumerated(STRING)`). **Ao adicionar valor a um enum, atualizar o CHECK correspondente na mesma entrega.**
- ⚠️ **`meal_entitlement_events.source` (`UI`|`BULK`|`API`) é guarda MANUAL** — no Java é String livre, **o Hibernate NÃO gera** esse CHECK. Existe **só na VM** (via `deploy/migrations/V003`): nem o PC (`ddl-auto`) nem os testes (H2 create-drop) o têm. Novo valor de `source` no código → adicionar ao CHECK, senão o INSERT falha **só na VM**.
- **SQL versionado** em `deploy/migrations/` (V001..V006 + rollback/ + README), idempotente (`IF NOT EXISTS`/`DO $$`). **Flyway NÃO adotado** ainda (baseline de schema Hibernate com ~440k registros = projeto próprio; decisão no README). PC usa `ddl-auto=update` e **não** precisa dos SQLs; a **VM** precisa (aplicar na ordem, antes de subir o backend).
