# Endpoints reais (main @ 0f655b4)

| Método/rota | Auth | Função |
|---|---|---|
| POST /api/auth/login | público | JWT (8h) |
| GET /api/auth/me | JWT | usuário logado |
| GET /api/health | público | status + database |
| POST /api/hikvision/webhook | token (header X-MAGBO-WEBHOOK-TOKEN ou ?token=) | evento produção (multipart/JSON) |
| POST /api/hikvision/webhook/capture | token idem | descoberta: loga, não persiste |
| POST /api/access | JWT + setor | acesso manual |
| GET /api/access/logs/{pointId} | JWT | últimos 24h do ponto (500) |
| GET /api/access/logs/all | JWT | filtro data/ponto/ação (≤500) |
| GET /api/access/logs/user/{userId} | can('overview') | histórico por pessoa |
| GET /api/access/logs/refectory | can('cantine') | logs cantina |
| GET /api/access/refectory/meals | can('cantine') | refeições pareadas |
| GET /api/access/infirmary/visits | can('infirmerie') | visitas enfermaria |
| GET /api/access/overview | ADMIN | Rapport Général |
| GET /api/stats/global | ADMIN | KPIs (totalToday, blockedToday*, authorized, activeUsers, totalUsers) |
| POST /api/admin/verify | ADMIN | PIN (lockout 5→60s) |
| GET/POST /api/admin/door-mappings · GET/PUT/DELETE /{id} | ADMIN | mapeamentos (DELETE=soft) |
| GET/PUT/DELETE /api/admin/class-schedules/{classe} (+GET lista) | ADMIN | horários por turma |
| GET /api/admin/hikvision-mapping/unmapped · PUT/DELETE /{userId} · POST /import-match | ADMIN | vínculo hikId (CSV hikId;nome) |
| POST /api/pronote/sync | ADMIN | dispara importação CSV |
| GET /api/users · /{id} · /search?q= · /all · PUT/DELETE /{id} · POST /bulk | JWT (gestão ADMIN) | pessoas |
| /api/system-users (CRUD) | ADMIN | operadores |

*blockedToday = COUNT(flag not null) — rename decidido p/ `alertasHoje` (Fase 3 pós-baseline).
