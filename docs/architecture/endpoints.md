# Endpoints reais (main @ 2902e74 · 2026-08-05)

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
| GET /api/access/report-config | JWT (**não** ADMIN) | `{minVisitSeconds}` — fonte única do piso de visita curta; quem opera o CDI precisa e não é admin |

## Servidores e HikCentral (04–05/08) — todos `hasRole('ADMIN')`

| Método/rota | Função |
|---|---|
| GET /api/users/staff | lista servidores (com `passagens` e `podeRemover`) |
| POST /api/users/staff · POST /bulk | cadastro manual · importação em lote |
| GET /api/users/staff/next-matricula | próxima `FUNC-###` que será emitida |
| PUT /api/users/staff/{id} | edita tipo e departamento |
| POST /api/users/staff/{id}/deactivate · /reactivate | inativação **soft** e reativação |
| DELETE /api/users/staff/{id} | remoção definitiva — **recusada se houver passagens** |
| GET /api/users/staff/{id}/reclassify/preview · POST /reclassify | "é na verdade um aluno": prévia dos dois lados · aplica (transfere a face, inativa o servidor, **preserva as passagens**) |
| GET /api/users/staff/match/preview · POST /match | casamento manual da linha CONFERIR do import |
| POST /api/users/staff/import/preview · POST /import | export do HikCentral: simula (não grava) · aplica |
| GET /api/access/attempts/refectory | can('cantine') | feed de negadas REFEI1/REFEI2/CANTINA1 (últimas 200) |
| GET /api/access/attempts/gate | can('portail') | feed de negadas PORT1/2/3 (últimas 200) |
| GET /api/stats/global | ADMIN | KPIs — totalToday, blockedToday* (=alertasHoje), alertasHoje, negadasHoje, divergenciaHoje, authorizedToday, activeUsers, totalUsers |
| POST /api/admin/verify | ADMIN | PIN (lockout 5→60s) |
| GET/POST /api/admin/door-mappings · GET/PUT/DELETE /{id} | ADMIN | mapeamentos (DELETE=soft) |
| GET /api/admin/meal-entitlements (+ /{userId}, /{userId}/history) | can('cantine') | direito à refeição (lista LEFT JOIN inclui sem-linha = PENDING; filtros q/turma/status) |
| GET /api/admin/meal-entitlements/summary | can('cantine') | `{authorized, notAuthorized, pending, totalStudents}` — corrigido na B.1 (`e450cd3`); a linha anterior dizia "responde 500" e estava desatualizada desde 16/07 |
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
