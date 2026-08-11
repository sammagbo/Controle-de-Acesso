# Endpoints reais

**Estado:** `main` @ `8fef0f9` · conferido em 11/08/2026 · **59 rotas**.

> **Como reconferir esta lista** (faça isto antes de confiar nela — ela envelhece
> a cada entrega):
> ```bash
> grep -rhoE '@(Get|Post|Put|Delete)Mapping' backend/src/main/java/com/magbo/access/controllers/*.java | wc -l
> ```
> Se o número não bater com **59**, a tabela está atrás do código. A fonte da
> verdade são as anotações `@RequestMapping`/`@*Mapping` + `@PreAuthorize` nos
> controllers; esta página é uma transcrição delas.

## Como ler a coluna "Autorização"

O sistema tem **três camadas** de controle, e a coluna combina as três:

| o que aparece | significa |
|---|---|
| **público** | está na lista `permitAll` do `SecurityConfig` — nenhum JWT. Só 6 rotas (abaixo). |
| **JWT** | não tem `@PreAuthorize`, mas o `SecurityConfig` fecha tudo com `anyRequest().authenticated()`. Basta estar logado. |
| `isAuthenticated()` | idem, dito explicitamente no método. |
| `hasRole('ADMIN')` | só administrador. |
| `can('area')` | `@areaSecurity.can(...)` — o operador precisa do **setor** (`system_users.setores_permitidos`). |
| `ADMIN ou PERMISSAO` | `hasRole('ADMIN') or @areaSecurity.hasPermission('...')` — permissão **granular** (`system_users.permissoes`, CSV). |

⚠️ **Rota `@PreAuthorize` sem JWT devolve 403, não 401** (dívida conhecida e
congelada). Só o webhook devolve 401. Quem depurar "por que 403?" deve suspeitar
primeiro de token ausente, não de falta de permissão.

⚠️ **`permitAll` não significa aberto.** As 3 rotas de webhook exigem o token
`MAGBO_WEBHOOK_TOKEN` validado **dentro do controller** (deny-by-default: token
ausente na config ⇒ rejeita). Estão fora do JWT porque quem chama são os
aparelhos Hikvision, que não fazem login.

---

## Público (6) — `SecurityConfig.permitAll`

| Método/rota | Guarda real | Função |
|---|---|---|
| POST `/api/auth/login` | — | devolve JWT (8h) |
| GET `/api/health` | — | status + `"database":"CONNECTED"` |
| POST `/api/hikvision/webhook` | token no header `X-MAGBO-WEBHOOK-TOKEN` **ou** `?token=` | evento de produção (multipart dos MinMoe / JSON das câmeras) |
| POST `/api/hikvision/webhook/t/{token}` | token **no caminho** | mesma coisa, para a câmera DeepinView, que descarta a query string |
| POST `/api/hikvision/webhook/capture` | token idem | **ferramenta de bancada** — loga o corpo, **não persiste**. Ver o aviso ao fim desta página |
| `/h2-console/**` | — | só existe no perfil `dev` (H2). Em `prod` não há console |

## Sessão e pessoas

| Método/rota | Autorização | Função |
|---|---|---|
| GET `/api/auth/me` | JWT | usuário logado |
| GET `/api/users` | `isAuthenticated()` | lista de pessoas (alimenta o `userCache` das telas) |
| GET `/api/users/{id}` | `isAuthenticated()` | pessoa + responsável |
| GET `/api/users/search?q=` | `isAuthenticated()` | busca remota (a UI usa com debounce 250 ms) |
| GET `/api/users/students/search?q=` | `isAuthenticated()` | busca só de ALUNO |
| GET `/api/users/all` | `hasRole('ADMIN')` | listagem completa |
| POST `/api/users` · PUT `/{id}` · DELETE `/{id}` | `hasRole('ADMIN')` | cadastro/edição/inativação |
| POST `/api/users/bulk` | `hasRole('ADMIN')` | importação em lote (planilha de alunos) |
| `/api/system-users` (GET · POST · PUT `/{id}` · DELETE `/{id}`) | `hasRole('ADMIN')` | operadores. `permissoes` = CSV de `MEAL_ENTITLEMENT_WRITE` / `EXIT_PERMISSION_WRITE` / `ATTEMPTS_READ` / `*` |
| POST `/api/admin/verify` | `hasRole('ADMIN')` | PIN do painel (lockout 5 erros → 60 s) |
| POST `/api/pronote/sync` | `hasRole('ADMIN')` | dispara a importação do CSV do Pronote |

## Fotos de identificação — ⚠️ são fotos de MENORES

| Método/rota | Autorização | Função |
|---|---|---|
| GET `/api/users/{userId}/photo` | `isAuthenticated()` | a imagem. **ETag = sha256** (revalida com `If-None-Match` → 304) e `Cache-Control: private`. 404 quando não há |
| GET `/api/admin/photos/summary` | `hasRole('ADMIN')` | `{comFoto}` — quantas pessoas já têm retrato |
| POST `/api/admin/photos/import/preview` | `hasRole('ADMIN')` | multipart `files` — **simula, não grava** |
| POST `/api/admin/photos/import` | `hasRole('ADMIN')` | multipart `files` — aplica (o plano é **refeito** no servidor) |
| POST `/api/admin/photos/import/preview/zip` | `hasRole('ADMIN')` | corpo **cru** `application/zip` — simula |
| POST `/api/admin/photos/import/zip` | `hasRole('ADMIN')` | corpo cru — aplica |
| DELETE `/api/admin/photos/{userId}` | `hasRole('ADMIN')` | exclusão **definitiva** (sem soft delete) |

**Não existe rota de exportação em massa, e isso é deliberado.** Sai uma foto
por requisição autenticada. Reconferir com:
`grep -c "photos" backend/src/main/java/com/magbo/access/controllers/UserPhotoController.java`
— devem ser as 7 acima e nada mais. Há teste que quebra se alguém criar uma
(`UserPhotoIT#naoHaExportacao`).

O ZIP entra por **corpo cru** e não multipart de propósito: os limites
`spring.servlet.multipart.*` (10 MB/20 MB) protegem o webhook das câmeras, e um
ZIP de ~1200 fotos passa deles.

## Passagens e relatórios

| Método/rota | Autorização | Função |
|---|---|---|
| POST `/api/access` | JWT **+ setor** (`canOperateSector` dentro do método → 403) | registro manual de passagem |
| GET `/api/access/logs/{pointId}` | JWT | últimas 24 h do ponto (teto 500). Params: `tipo` (ALUNO/PROFESSOR/FUNCIONARIO), **`incluirRepeticoes`** (default `false`) |
| GET `/api/access/logs/all` | JWT | Journal. Params: `dateFrom`, `dateTo`, `pointId`, `action`, `eleve` (nome **ou** matrícula), `tipo`, **`repeticoes`** (`SEULEMENT`/`SANS`; vazio = tudo), `limit` (default 50) |
| GET `/api/access/logs/user/{userId}` | `can('overview')` | histórico de uma pessoa |
| GET `/api/access/report-config` | `isAuthenticated()` (**não** ADMIN) | `{minVisitSeconds}` — fonte única do piso de visita curta; quem opera o CDI precisa e não é admin |
| GET `/api/access/overview` | `hasRole('ADMIN')` | Rapport Général (KPIs por área) |
| GET `/api/stats/global` | `hasRole('ADMIN')` | `totalToday`, `alertasHoje`, `negadasHoje`, `divergenciaHoje`, `authorizedToday`, `activeUsers`, `totalUsers`, `blockedToday`\* |
| GET `/api/access/logs/refectory` · `/api/access/refectory/meals` | `can('cantine')` | logs da cantina · refeições pareadas |
| GET `/api/access/infirmary/visits` | `can('infirmerie')` | visitas da enfermaria |

\* `blockedToday` é `@Deprecated`: **alias de `alertasHoje`**, mantido só para
compatibilidade do frontend.

**As duas flags de REPETIÇÃO** (`POSTO_FIXO`, `JA_PRESENTE`) governam
`incluirRepeticoes` e `repeticoes`. As linhas marcadas **existem sempre** no
banco; o que muda é quem as conta. O Journal mostra tudo por padrão.

## Tentativas negadas

| Método/rota | Autorização | Função |
|---|---|---|
| GET `/api/access/attempts` | `ADMIN ou ATTEMPTS_READ` | filtros `from`/`to`/`pointId`/`userId`/`reason`/`method`/`page`/`size` (≤200) |
| GET `/api/access/attempts/stats` | `ADMIN ou ATTEMPTS_READ` | agregados: total, byReason, byPoint, byTurma, byMethod, divergence |
| GET `/api/access/attempts/refectory` | `can('cantine')` | feed operacional da cantina (**últimas 12 h**) |
| GET `/api/access/attempts/gate` | `can('portail')` | feed operacional da portaria (últimas 12 h) |

## Cantina — direito à refeição

| Método/rota | Autorização | Função |
|---|---|---|
| GET `/api/admin/meal-entitlements` | `can('cantine')` | lista (LEFT JOIN: sem linha = **PENDING**); filtros `q`/`turma`/`status` |
| GET `/api/admin/meal-entitlements/summary` | `can('cantine')` | `{authorized, notAuthorized, pending, totalStudents}` |
| GET `/api/admin/meal-entitlements/{userId}` · `/{userId}/history` | `can('cantine')` | direito atual · linha do tempo (quem/quando/de→para/origem) |
| PUT `/api/admin/meal-entitlements/{userId}` | `ADMIN ou MEAL_ENTITLEMENT_WRITE` | upsert (grava histórico, `source=UI`) |
| POST `/api/admin/meal-entitlements/bulk` | `ADMIN ou MEAL_ENTITLEMENT_WRITE` | lote (`source=BULK`, máx 2000) |
| POST `/api/admin/meal-entitlements/import/preview` · `/import` | `ADMIN ou MEAL_ENTITLEMENT_WRITE` | planilha: **simula** · aplica |

## Portaria — autorizações de saída

| Método/rota | Autorização | Função |
|---|---|---|
| GET `/api/admin/exit-permissions` (+ `/active`, `/user/{userId}`) | `can('portail')` | leitura (filtros `userId`/`status`/`type`/`from`/`to`) |
| POST `/api/admin/exit-permissions` | `ADMIN ou EXIT_PERMISSION_WRITE` | criar (`createdBy` vem do JWT) |
| POST `/api/admin/exit-permissions/{id}/revoke` | `ADMIN ou EXIT_PERMISSION_WRITE` | revogação **soft** (nunca DELETE) |

## Servidores, reclassificação e HikCentral — todos `hasRole('ADMIN')`

| Método/rota | Função |
|---|---|
| GET `/api/users/staff` | lista (com `passagens`, `podeRemover` e **`postoFixoPointId`**) |
| POST `/api/users/staff` · POST `/bulk` | cadastro manual (`FUNC-###`) · importação em lote |
| GET `/api/users/staff/next-matricula` | próxima `FUNC-###` a ser emitida |
| PUT `/api/users/staff/{id}` | edita `tipo`, `departamento` e **`postoFixoPointId`**. Campo **ausente** = não mexer; **vazio** = limpar. Ponto inválido → 400. **Única porta de escrita do posto fixo — e por isso ALUNO nunca recebe um** |
| POST `/api/users/staff/{id}/deactivate` · `/reactivate` | inativação **soft** · reativação |
| DELETE `/api/users/staff/{id}` | remoção definitiva — **recusada se houver passagens**; apaga a foto na mesma transação |
| GET `/api/users/staff/{id}/reclassify/preview` · POST `/reclassify` | "é na verdade um aluno": prévia dos dois lados · aplica (transfere o identificador, inativa o servidor, **preserva as passagens**) |
| GET `/api/users/staff/match/preview` · POST `/match` | casamento manual da linha CONFERIR do import |
| POST `/api/users/staff/import/preview` · `/import` | export do HikCentral: **simula** · aplica (plano refeito no servidor) |
| GET `/api/admin/hikvision-mapping` · `/unmapped` | vínculo `hikvision_employee_id` · quem ainda não tem |
| PUT · DELETE `/api/admin/hikvision-mapping/{userId}` | liga · desliga o identificador |
| POST `/api/admin/hikvision-mapping/import-match` | casamento por CSV (`hikId;nome`) |
| GET `/api/admin/hikvision-mapping/export-csv` | **F7b** — CSV para o HCP importar. Colunas: `ID`, `Prénom`, `Nom de famille`, `Service`, `Classe`. ⚠️ O nome `Classe` é **suposição declarada** (`HikCentralCsvService.COLUNA_TURMA`): o template real do HCP é a pendência 3 de `docs/operacional/procedimento-hikcentral.md` |
| GET · POST `/api/admin/door-mappings` · GET/PUT/DELETE `/{id}` | mapeamento terminal→ponto (DELETE = soft) |
| GET · PUT · DELETE `/api/admin/class-schedules/{classe}` (+ GET lista) | horários de refeição por turma |

---

## ⚠️ `/api/hikvision/webhook/capture` — ferramenta de BANCADA

Existe para **descobrir** o formato de um aparelho novo: ela **escreve o corpo
da requisição no log** (texto das parts; as imagens são omitidas, só o tamanho
aparece) e **não persiste nada**.

**Nunca deve ser apontada por um aparelho em produção.** Numa câmera real da
portaria, o corpo traz **nomes de alunos** lidos da biblioteca facial, e eles
iriam parar no arquivo de log — que não tem a proteção que o banco tem.

- Reverificar o que ela loga: `HikvisionWebhookController`, procurar
  `log.info("Body (primeiros {} bytes)` e `log.info("Part '{}'`.
- Uso correto: apontar **um** aparelho de bancada para ela, ler o log,
  desapontar. A rota de produção é `/api/hikvision/webhook`.
