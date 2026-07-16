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
| GET /api/access/attempts | ADMIN ou `ATTEMPTS_READ` | tentativas negadas (filtros from/to/pointId/userId/reason/method/page/size≤200) |
| GET /api/access/attempts/stats | ADMIN ou `ATTEMPTS_READ` | agregados: total, byReason, byPoint, byTurma, byMethod, divergence |
| GET /api/access/attempts/refectory | can('cantine') | feed de negadas REFEI1/REFEI2/CANTINA1 (últimas 200) |
| GET /api/access/attempts/gate | can('portail') | feed de negadas PORT1/2/3 (últimas 200) |
| GET /api/stats/global | ADMIN | KPIs — totalToday, blockedToday* (=alertasHoje), alertasHoje, negadasHoje, divergenciaHoje, authorizedToday, activeUsers, totalUsers |
| POST /api/admin/verify | ADMIN | PIN (lockout 5→60s) |
| GET/POST /api/admin/door-mappings · GET/PUT/DELETE /{id} | ADMIN | mapeamentos (DELETE=soft) |
| GET /api/admin/meal-entitlements (+ /{userId}, /{userId}/history) | can('cantine') | direito à refeição (lista LEFT JOIN inclui sem-linha = PENDING; filtros q/turma/status) |
| GET /api/admin/meal-entitlements/summary | can('cantine') | ⚠️ **responde 500** hoje (bug de tipo `summary()` — dívida congelada) |
| PUT /api/admin/meal-entitlements/{userId} · POST /bulk | ADMIN ou `MEAL_ENTITLEMENT_WRITE` | upsert (grava histórico, source=UI) · lote (source=BULK, overwrite opcional, máx 2000) |
| GET /api/admin/exit-permissions (+ /active, /user/{userId}) | can('portail') | autorizações de saída (filtros userId/status/type/from/to) |
| POST /api/admin/exit-permissions · POST /{id}/revoke | ADMIN ou `EXIT_PERMISSION_WRITE` | criar (createdBy do JWT) · revogar **soft** (sem DELETE) |
| GET/PUT/DELETE /api/admin/class-schedules/{classe} (+GET lista) | ADMIN | horários por turma |
| GET /api/admin/hikvision-mapping/unmapped · PUT/DELETE /{userId} · POST /import-match | ADMIN | vínculo hikId (CSV hikId;nome) |
| POST /api/pronote/sync | ADMIN | dispara importação CSV |
| GET /api/users · /{id} · /search?q= · /all · PUT/DELETE /{id} · POST /bulk | JWT (gestão ADMIN) | pessoas |
| /api/system-users (CRUD) | ADMIN | operadores (agora com `permissoes` CSV: MEAL_ENTITLEMENT_WRITE/EXIT_PERMISSION_WRITE/ATTEMPTS_READ/`*`) |

*blockedToday = COUNT(flag not null); `@Deprecated`, mantido como **alias de `alertasHoje`** para compat do frontend (remoção em fase futura, após migração da UI).
Nota: endpoints `@PreAuthorize` sem token JWT devolvem **403** (não 401) — só o webhook devolve 401. Escrita sem a permissão granular → 403; leitura por área continua liberada.
