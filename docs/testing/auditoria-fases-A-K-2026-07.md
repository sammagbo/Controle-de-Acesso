# Auditoria de Conformidade — Fases A→K (Camada de Decisão)

**Data:** 2026-07-17 · **Auditor:** Claude (sessão não-assistida, somente leitura)
**Base:** working tree em `main` @ `5b2590b` (limpo) · **Contratos:** `docs/architecture/prompts/0N-FASE-*.md` + `ESPECIFICACAO-TECNICA-v1.md`
**Método:** por fase — extração dos critérios do prompt → verificação estática (arquivo:linha) → verificação dinâmica somente leitura (Postgres, GETs, UI) → veredito → checkpoint.
**Regra:** nenhuma divergência foi corrigida; tudo apenas registrado. Nenhum commit feito.

> **Desfecho (2026-07-20):** as 6 divergências da Fase H foram resolvidas — D-H2 `a07da0b`, D-H4 `40cfbc2`, D-H5 `31fbab4` (Bloco 1); D-H1 `71033cf`, D-H6 `658b392` (Bloco 2). **D-H3 aceita** por decisão do Sam (redundância consciente do card "Barrados", revisar layout pós-piloto). Menores (D-E1, código morto candidato, 3 frases de doc) permanecem como inventário, sem ação.

## Tabela-resumo

| Fase | Veredito | Observações | Divergências |
|---|---|---|---|
| A — Fundação de domínio | **CONFORME** | 2 | 0 |
| B — Classificação/webhook | **CONFORME** | 3 | 0 |
| C — Direito à refeição | **CONFORME** | 3 | 0 |
| D — Autorização de saída | **CONFORME** | 2 | 0 |
| E — Endpoints/KPIs | **CONFORME COM OBSERVAÇÕES** | 3 | 1 (menor: `to` ignorado no /stats) |
| F — Permissões granulares | **CONFORME** | 0 | 0 |
| G — Importação em lote | **CONFORME** | 1 | 0 |
| H — Frontend | **DIVERGÊNCIA** | 3 | **6** (D-H1..D-H6) |
| I — Testes | **CONFORME** (183/0/2 reproduzido) | 1 | 0 |
| J — SQL/migrações | **CONFORME** | 1 | 0 |
| K — Documentação | **CONFORME COM OBSERVAÇÕES** | 3 (deriva doc↔código) | 0 |
| Transversais | **CONFORME COM OBSERVAÇÕES** | inventários | 0 órfãs · 0 segredos · 0 CDN |

**Destaques:** as 6 divergências concentram-se na Fase H (UI); as 2 de maior impacto operacional são **D-H5** (cards de resumo do Gestion Cantine renderizam vazios — bug de nome de campo, provado ao vivo) e **D-H2** (tooltip do KPI de divergência explica a métrica errada para a direção). Backend A–G íntegro; suíte de testes verde reproduzida; KPIs conferidos contra SQL ao vivo.

---

## FASE A — Fundação de domínio

**Veredito: CONFORME** (2 observações, 0 divergências)

### Estático

| Entrega prometida | Evidência | Status |
|---|---|---|
| 7 enums com valores exatos | `AuthResult.java:6-10` (SUCCESS/DENIED/UNKNOWN) · `AuthorizationResult.java:6-11` (4 valores) · `DenialReason.java:7-18` (10 valores, NORMAL incluído com Javadoc "não gravar") · `EntitlementStatus.java:6-10` · `ExitPermissionType.java:6-11` · `ExitPermissionStatus.java:6-11` · `PolicyMode.java:8-11` | ✅ |
| `AccessAttempt` — userId nullable sem FK, employeeNoRaw NOT NULL len 64, enums STRING, timestamp @Builder.Default now() | `models/AccessAttempt.java:24-67` — todas as 14 colunas batem coluna a coluna com a tabela do prompt | ✅ |
| `MealEntitlement` — PK natural userId, campos reservados documentados, @PrePersist/@PreUpdate | `models/MealEntitlement.java:20-69`; Javadoc "Reservado para evolução futura" em `daysOfWeek`/`mealType` (linhas 38-48) | ✅ |
| `MealEntitlementEvent` — histórico imutável, source NOT NULL len 16 | `models/MealEntitlementEvent.java:19-58` | ✅ |
| `StudentExitPermission` — reason e createdBy NOT NULL | `models/StudentExitPermission.java:52-59` | ✅ |
| 4 repositories com métodos derivados da Fase A | `AccessAttemptRepository.java:14-20` · `MealEntitlementRepository.java:18-20` · `MealEntitlementEventRepository.java:12` · `StudentExitPermissionRepository.java:13-17` (as `@Query` extras são das Fases C/E, previstas) | ✅ |
| `SystemUser.permissoes` + `hasPermission()` espelhando `canOperateSector` | `models/SystemUser.java:51-52` (coluna nullable) e `:95-104` (helper: ADMIN→true, null/blank→false, `*`→true, CSV trim case-insensitive) | ✅ |
| `PolicyProperties` com defaults + log `@PostConstruct` | `config/PolicyProperties.java:26-32` (defaults exatos da spec §4.1) e `:42-54` (log das políticas ativas) | ✅ |
| Blocos de política nos 3 `.properties` | `application.properties:53-65` · `application-dev.properties:54-66` · `application-prod.properties:60-83` | ✅ (ver Obs. 1) |

### Dinâmico (Postgres `magbodb`, somente leitura)

- `\d access_attempts` — 14 colunas idênticas à entidade; **5 CHECK constraints** gerados espelhando os enums (action, auth_method, auth_result, authorization_result, denial_reason com os 10 valores). ✅
- `\d meal_entitlements` — PK `user_id`, CHECK de status com 3 valores, campos reservados presentes. ✅
- `system_users.permissoes` existe (information_schema). ✅

### Observações

1. **`application-prod.properties:72` tem `magbo.policy.meal-pending=DENY`**, enquanto o prompt da Fase A previa OBSERVATION + comentário de atenção. **Não é divergência**: é a decisão D5 do Sam (16/07, ADR-004), documentada no próprio arquivo (linha 60: "decidido por Sam em 16/07/2026") e no CLAUDE.md. Dev e default seguem OBSERVATION como previsto.
2. `missing-door-mapping` implementado como `String` em vez de enum próprio (`PolicyProperties.java:32`) — o prompt permitia explicitamente as duas formas.

### Requer bancada/hardware (fora do escopo)
- "Evento de face real continua gerando access_log idêntico" — já provado no smoke 16/07 e V01–V03 (17/07).

---

## FASE B — Classificação de eventos e roteamento do webhook (CRÍTICA)

**Veredito: CONFORME** (3 observações, 0 divergências)

### Estático

| Entrega prometida | Evidência | Status |
|---|---|---|
| `HikvisionEventClassifier` — tabela 75/1/8/null/outro exata, Javadoc de hardware | `services/HikvisionEventClassifier.java:16-26` (switch literal; null→UNKNOWN/UNKNOWN/false); Javadoc obrigatório presente (linhas 8-12) | ✅ |
| `AccessAttemptService.record(...)` — valida employeeNoRaw/denialReason, timestamp do servidor, log INFO | `services/AccessAttemptService.java:37-42` (IllegalArgumentException) · `:57` (`LocalDateTime.now()`) · `:62-63` (formato `Access Attempt:` do prompt) | ✅ |
| `DeduplicationService` — enabled, windowSeconds<=0, janela | `services/DeduplicationService.java:18-28` — lógica literal dos 4 passos | ✅ |
| Records `EventClassification` e `AccessDecision` | `dto/EventClassification.java` · `dto/AccessDecision.java:9-22` (12 campos da spec §5) | ✅ (ver Obs. 2) |
| `AccessDecisionService.process(...)` `@Transactional` com o fluxo exato do passo 7.2 | `services/AccessDecisionService.java:61-295` — ordem: classify→resolve→missing-mapping(ATTEMPT? linha 71)→DENIED sub 8 (linha 83, com lookup de userId p/ preencher, retorno antes de qualquer log)→não-candidato (linha 96, NOT_APPLICABLE+DEVICE_DENIED)→UNKNOWN_USER (linha 108)→USER_INACTIVE por política (linha 122, `Boolean.FALSE.equals`)→cantina (dedup linha 151 → entitlement linha 174 → janela linha 218)→portão (linha 249)→save (linha 286)→consumeIfSingle na mesma transação (linha 288) | ✅ |
| Lógica movida sem alteração: `validateEntryWindow`/`validateExitTime`/`getLunchTimeForDay`/`parseHour` + constantes | `AccessDecisionService.java:50-59` (LYCEE_CLASSES 8 turmas, 11h-15h, MAX_CANTINA_TIME/LUNCH_WINDOW 1h) e `:301-374` — semântica idêntica à descrita nos testes de blindagem (`'N'`→FORA_HORARIO, sem schedule→null, parseHour tolerante, `compareTo > 0` no limite de 1h) | ✅ |
| Controller refatorado: token/parsePayload/capture intactos, delega ao service | `controllers/HikvisionWebhookController.java` — 209 linhas: token deny-by-default 503 (`:33-36`), `?token=` (`:37-46`), `MessageDigest.isEqual` (`:49-51`), guard sem employeeNoString→200 (`:81-84`), delegação (`:86`), `/webhook/capture` intacto (`:138-208`). Campos `accessLogRepository`/`userRepository`/`classScheduleRepository`/`doorMappingService` removidos; só `objectMapper` e o service | ✅ |
| `AccessLogRepository` +1 método derivado apenas | `AccessLogRepository.java:27-28` (`findByUserIdAndPointIdAndActionAndTimestampAfter`) | ✅ |
| Formato do log `Access Log:` preservado | `AccessDecisionService.java:292-294` — formato idêntico ao especificado no prompt (user/point/action/flag/method/subType/fallback) | ✅ |

### Observações

1. O guard do webhook usa `isBlank()` (`HikvisionWebhookController.java:81`) em vez do `isEmpty()` original — é a **correção B.1** (`e450cd3`, 16/07), documentada no CLAUDE.md. Conforme.
2. **`dto/AccessDecision.java` não tem nenhum uso no código** (grep: única ocorrência é a própria definição). O prompt mandava criá-lo e o `process()` é `void` como o próprio prompt especifica — foi criado e ficou órfão. Candidato a código morto (ver transversais). Não é divergência funcional.
3. Subtipo desconhecido grava `DEVICE_DENIED` (linha 101) — é a **dívida congelada nº 2** do CLAUDE.md (falta `UNKNOWN_EVENT` no enum), prevista e explicitamente aceita no prompt ("dívida congelada: NÃO corrigir sem decisão").

### Requer bancada/hardware
- Comportamento com face/cartão/sub 8 reais: provado no smoke 16/07 (3/3) e V01–V05 (17/07). Não repetido nesta auditoria.

---

## FASE C — Direito à refeição

**Veredito: CONFORME** (3 observações, 0 divergências)

### Estático

| Entrega prometida | Evidência | Status |
|---|---|---|
| `evaluate(userId, date)` com a lógica exata (sem linha→PENDING/reason null; NOT_AUTHORIZED→MEAL_NOT_ENTITLED; AUTHORIZED fora de vigência→MEAL_NOT_ENTITLED; vigente→entitled) | `services/MealEntitlementService.java:38-66` — literal ao prompt; `daysOfWeek`/`mealType` não são lidos em lugar nenhum da regra | ✅ |
| `upsert` transacional com histórico na mesma transação | `MealEntitlementService.java:72-130` — valida aluno existe (76) e datas (80); captura old\*; salva entidade + `MealEntitlementEvent` (110-124) na mesma transação; log INFO no formato do prompt (126) | ✅ |
| Query LEFT JOIN incluindo alunos sem linha como PENDING, paginada | `repositories/MealEntitlementRepository.java:22-48` (`findEntitlementsWithUsers` + countQuery, `COALESCE(m.status,'PENDING')`, filtros q/turma/status) | ✅ |
| 4 DTOs com Bean Validation | `dto/EntitlementDecision.java` · `MealEntitlementRequest.java:12-20` (`@NotNull status`, `@Size(max=255) note`) · `MealEntitlementDto` · `MealEntitlementHistoryDto` | ✅ |
| Controller com 5 rotas, auth por área na leitura, `changedBy` do JWT, `source="UI"` | `controllers/MealEntitlementController.java:26-76` — GET/GET summary/GET {id}/GET history/PUT; `size` truncado a 200 (35-37); JWT via `SecurityContextHolder` (67); `IllegalArgumentException`→400 `{error}` (73-75) | ✅ |
| Integração no ponto 10.2 (após dedup, antes da janela), só ENTRADA em REFEI\*/CANTINA\* | `services/AccessDecisionService.java:173-217` (marcador `// FASE C:` na linha 173; ordem dedup 151 → entitlement 174 → janela 218); SAIDA da cantina só `validateExitTime` (240-242) | ✅ |
| Regras: nunca criar linha no webhook; `meal_count` intocado | grep: nenhum `mealEntitlementRepository.save` fora do `upsert`; nenhum acesso a `meal_count` nos serviços novos | ✅ |

### Observações

1. O PUT devolve **200 com corpo vazio** (`MealEntitlementController.java:72`, `ok().build()`). Não viola o prompt, mas é a espécie de contrato que causou o bug do front corrigido em `902de76` — conferido nas transversais que o front tolera.
2. `summary()` (`MealEntitlementService.java:158-170`) deriva `pending = totalStudents − authorized − notAuthorized`. Correto para "sem linha = PENDING"; **caso-borda**: linha de entitlement de aluno **inativo** conta em `authorized`/`notAuthorized` mas não em `totalStudents` (só ativos) — em cenário extremo `pending` pode sair distorcido/negativo. Sem impacto hoje; registrar apenas.
3. O prompt pedia Javadoc no `evaluate` documentando que `daysOfWeek`/`mealType` são ignorados; o Javadoc está **na entidade** (`MealEntitlement.java:38-48`), não no método. Cosmético.

---

## FASE D — Autorização de saída

**Veredito: CONFORME** (2 observações, 0 divergências)

### Estático

| Entrega prometida | Evidência | Status |
|---|---|---|
| `evaluate` com os 4 tipos + janela horária inclusiva + distinção obrigatória de motivos | `services/ExitPermissionService.java:31-48` — sem ativa→`EXIT_NOT_AUTHORIZED` (35); ativa mas nenhuma válida→`OUTSIDE_EXIT_WINDOW` (47); ordenação determinística por id (39). `isValidNow` (50-97): janela horária p/ todos os tipos, limites inclusivos (`isBefore`/`isAfter`); DATE_RANGE exige datas (66); RECURRING com parse defensivo — formato inválido→não bate, nunca exception (78-80); SINGLE=ACTIVE (93) | ✅ |
| `consumeIfSingle` — só SINGLE, só em saída efetiva, mesma transação | `ExitPermissionService.java:100-111` (no-op p/ não-SINGLE); chamado **após** o save do log dentro do `process @Transactional` (`AccessDecisionService.java:286-290`) | ✅ |
| `create` com validações compostas; status forçado ACTIVE; `createdBy` do JWT | `ExitPermissionService.java:114-173` (reason obrigatório 118; DATE_RANGE 121; RECURRING CSV 1..7 131-146; start/end pareados 147-154; `status(ACTIVE)` 164) · `ExitPermissionController.java:78` (JWT) | ✅ |
| `revoke` soft; revogar 2x→400; sem DELETE | `ExitPermissionService.java:176-199` · controller **não tem** `@DeleteMapping` (rotas: 3×GET + POST + POST /revoke) | ✅ |
| Integração ponto 11: PORT\*+SAIDA; ENTRADA sem regra | `AccessDecisionService.java:245-274` (marcador `// FASE D:`; guard `isGate && SAIDA`; DENY→attempt+return antes do save → presença estruturalmente inalterada) | ✅ |
| Query filtrada paginada com JOIN p/ nome/turma | `StudentExitPermissionRepository.java:19-37` | ✅ |

### Observações

1. `GET /active` e `GET /user/{userId}` devolvem `nome`/`turma` **null** (`ExitPermissionController.java:62`, comentário `// TODO: fetch names if needed`). O prompt pedia nome+turma no DTO de saída; só a listagem filtrada (`GET /`) faz o JOIN. A tela `ExitPermissionManagement` foi validada E2E (17/07) — o front resolve nome via `userCache`. Funcional na prática, contrato parcialmente cumprido; TODO residual inventariado nas transversais.
2. `revoke` concatena `" | Revoked: " + note` em `note` VARCHAR(255) sem checar tamanho (`ExitPermissionService.java:188-194`) — nota longa pode estourar a coluna e virar 500. Caso-borda, sem ocorrência registrada.

---

## FASE E — Endpoints de tentativas e KPIs

**Veredito: CONFORME COM OBSERVAÇÕES** (3 observações, 1 divergência menor)

### Estático

| Entrega prometida | Evidência | Status |
|---|---|---|
| 5+ queries novas no repository, incl. `countDivergenceSince` | `AccessAttemptRepository.java:22-55` (findFiltered com padrão `:#{#param == null}`, countByReason/Point/Method/TurmaSince, countDivergenceSince = SUCCESS+DENIED) | ✅ |
| `AccessAttemptDto` com resolução de nome/turma **em lote** | `services/AccessAttemptQueryService.java:67-91` (`findAllById` uma vez por página/lista; snapshot como fallback em `mapToDto:93-100`) — sem N+1 | ✅ |
| `AttemptStatsDto` com 4 agregações + divergence | `dto/AttemptStatsDto.java` · montagem em `AccessAttemptQueryService.java:41-65` | ✅ |
| Controller 4 rotas; `size` máx 200; feeds por área | `controllers/AccessAttemptController.java:27-62` · truncamento em `AccessAttemptQueryService.java:30` · feeds `can('cantine')`/`can('portail')` | ✅ |
| `GlobalStats` +3 campos, `blockedToday` mantido `@Deprecated` com o Javadoc do prompt | `dto/GlobalStats.java:16-30` | ✅ |
| `StatsController` preenche tudo sem alterar queries existentes; `blockedToday`==`alertasHoje` | `controllers/StatsController.java:32-49` (mesma variável `alertas` nos dois campos; `authorizedToday = totalToday - alertas` inalterado) | ✅ |
| Rotas novas fora do `permitAll` | `security/SecurityConfig.java:39-46` — permitAll só login/health/webhook/capture/h2-console; `anyRequest().authenticated()` | ✅ |

### Divergência (menor)

- **D-E1:** `GET /api/access/attempts/stats` declara o parâmetro `to` mas **nunca o usa** (`AccessAttemptController.java:44-50` → `queryService.getStatsSince(start)` só recebe `from`). O contrato do prompt era "período (`from`/`to`, default = hoje)". Quem passar `to` recebe silenciosamente estatísticas até agora. Impacto baixo (a UI atual não envia `to`), mas é contrato não cumprido. **Não corrigido (decisão do Sam).**

### Observações

1. Os feeds `/refectory` e `/gate` aplicam **janela de 12h** (`AccessAttemptQueryService.java:36`) além do Top200 do prompt — é a semântica operacional decidida na Fase H (CLAUDE.md: "cantina/portão = operacional (últimas 12h)"). Conforme decisão posterior.
2. `byTurma` exclui `user_id` null via JOIN (`AccessAttemptRepository.java:51`) — comportamento previsto e documentado no prompt.
3. Agregações mapeiam chave null→"UNKNOWN" (`AccessAttemptQueryService.java:46-55`) — proteção extra não pedida, sem efeito adverso.

---

## FASE F — Permissões granulares

**Veredito: CONFORME** (0 observações, 0 divergências)

| Entrega prometida | Evidência | Status |
|---|---|---|
| `AreaSecurity.hasPermission` espelhando `can()` (ADMIN bypass sem DB, reuso da entidade) | `security/AreaSecurity.java:43-56` + Javadoc do prompt (38-42); `can()` inalterado (21-36) | ✅ |
| Classe `Permissions` final, construtor privado, 3 constantes | `security/Permissions.java:3-12` | ✅ |
| 5 `@PreAuthorize` trocados; zero resíduos `// FASE F` | `MealEntitlementController.java:61` (PUT) e `:79` (bulk) · `ExitPermissionController.java:75` (POST) e `:91` (revoke) · `AccessAttemptController.java:28` (GET) e `:43` (/stats) — grep `FASE F` em `backend/src/main/java` = **0 ocorrências** | ✅ |
| Leitura continua por setor (não alterada) | GETs de entitlements/exit-permissions com `can('cantine')`/`can('portail')`; feeds idem | ✅ |
| CRUD de operadores aceita/retorna/valida `permissoes`; 400 lista valores válidos | `controllers/SystemUserController.java:34` (list), `:40-52` (validatePermissoes aceita `*`), `:60-63`/`:84-87` (400 com mensagem), DTOs `:116`/`:124` | ✅ |
| `passwordHash` nunca sai em resposta | `SystemUserController.list()` monta Map explícito sem hash; create/update devolvem `{id}`/`{status}` | ✅ |
| `/api/auth/me` expõe role/setores/permissoes | `controllers/AuthController.java:79` | ✅ |

---

## FASE G — Importação em lote

**Veredito: CONFORME** (1 observação, 0 divergências)

| Entrega prometida | Evidência | Status |
|---|---|---|
| `MealEntitlementBulkItem` com `status` **String** | `dto/MealEntitlementBulkItem.java:9` | ✅ |
| `BulkResultDto` com 5 contadores + erros por linha | `dto/BulkResultDto.java:10-15` | ✅ |
| `importBulk` com transação **por linha** | `MealEntitlementService.java:212-277` — `importBulk` sem `@Transactional`; upsert é `REQUIRES_NEW` (72) e chamado via self-injection `@Lazy` (68-70, 254) para o proxy valer em chamada interna — uma falha não desfaz as linhas boas | ✅ |
| `ignorado` ≠ `falha`; sem sobrescrita silenciosa | existente sem overwrite→`totalIgnorado`+erro "Já existe — use overwrite=true" e `continue` (243-252); exceções→`totalFalhas` (262-268) | ✅ |
| Histórico `source="BULK"` em todo upsert efetivo | `MealEntitlementService.java:254` | ✅ |
| Endpoint: limite 2000, lote vazio→400, sempre 200 com relatório, auth da Fase F | `MealEntitlementController.java:78-94` | ✅ |
| Nenhum campo de cartão em lugar nenhum | grep `cardNo|numero_cartao|card_number` no backend = 0 fora de docs/DTO hikvision (ADR-002 respeitado) | ✅ |

### Observações

1. Erros de linha usam a chave `linha` como String (`String.valueOf(linha)`, linha 247) — o front já lê assim (validado no E2E do bulk D5, 17/07). Sem impacto.

---

## FASE H — Frontend

**Veredito: DIVERGÊNCIA** (6 divergências, 3 observações) — telas principais funcionam (confirmado ao vivo nesta auditoria), mas seis itens do contrato não foram cumpridos.

### Estático — conforme

| Entrega prometida | Evidência | Status |
|---|---|---|
| 4 componentes novos, sem ES modules | `js/components/DeniedAttemptsFeed.js` · `MealEntitlementHistoryModal.js` · `MealEntitlementManagement.js` · `ExitPermissionManagement.js` — grep `^import|^export` em `js/components/` = 0 | ✅ |
| Labels no idioma da UI (francês) espelhando o backend | `js/data/constants.js:59-95` (DENIAL_REASON/AUTH_METHOD/ENTITLEMENT_STATUS/EXIT_PERMISSION_TYPE/STATUS_LABELS, em francês) | ✅ |
| `js/utils/api.js` com as chamadas novas + tratamento de 403 com mensagem clara | funções em `api.js:192-437`; 403 → mensagem específica em francês (ex.: `:205`, `:244`, `:273`); `checkAuthError` p/ 401/403 de sessão (`:56-60`) | ✅ |
| **Fiação `window.api`** (a lição da fase) | bloco de anexação `js/utils/api.js:443-455` (11 funções); inventário completo de chamadas `window.api.*`/`window.api?.*` no app: **todas têm definição E anexação — 0 órfãs de definição** (ver transversais) | ✅ |
| `DeniedAttemptsFeed` reutilizável, 6 colunas, desconhecido→`employeeNoRaw` | `DeniedAttemptsFeed.js:6` (props `fetchFn`/`pollingMs`/`title`/`emptyMessage`); colunas nome (fallback `employeeNoRaw` `:151`), turma (`:160`), horário (`:183`), método badge (`:193`), ponto (`:168-169`), motivo badge (`:197`); avatar local F7c (`:154`) | ✅ |
| `CantineMonitor` + feed separado, polling 3s | `CantineMonitor.js:233-241` (sidebar própria "Tentatives Refusées", `fetchFn=getRefectoryAttempts`, `pollingMs=3000`) | ✅ |
| `GeneralReport` — seção adicionada sem refatorar | `GeneralReport.js:1110-1117` (`fetchFn=window.api?.getAllAttempts` — endpoint geral, decisão do Sam 17/07) | ✅ |
| Import xlsx preservando zeros à esquerda | `MealEntitlementManagement.js:113-114` (`sheet_to_json(..., { raw: false })` com comentário) + `.toString().trim()` (`:128`) | ✅ |
| `index.html` ordem correta | `index.html:59-84` — constants(59) → api.js(61) → utils/api(64) → userCache(65) → Toast(70) → Feed(75) → HistoryModal(76) → Management(77-78) → consumidores → `App.js`(111) | ✅ |
| Navegação | `js/App.js:274-277` — rotas `MEAL_ENTITLEMENT_MANAGEMENT` / `EXIT_PERMISSION_MANAGEMENT` | ✅ |

### Divergências

- **D-H1 — Feed de negadas da portaria NÃO existe na UI.** O prompt (passo 6) e a spec §11.1 exigem `DeniedAttemptsFeed` com `getGateAttempts` na tela `ExitPermissionManagement`. Grep no app inteiro: `DeniedAttemptsFeed` só é usado em `CantineMonitor.js:235` e `GeneralReport.js:1112`; `getGateAttempts` está definida (`js/utils/api.js:413`) e anexada (`:445`) mas **nenhum componente a consome** — endpoint `/api/access/attempts/gate` do backend fica sem consumidor. Agrava: `.claude/rules/frontend.md` e o CLAUDE.md afirmam o feed "usado na cantina **e na portaria**" — **deriva doc↔código** (ver transversais).
- **D-H2 — Tooltip da divergência explica a métrica ERRADA.** `AdminDashboard.js:369-371`: *"Accès via code terminal sans correspondance dans la base de données (Ex : Terminal non reconnu, badge inconnu)"*. Isso descreve `UNKNOWN_USER`/`MISSING_DOOR_MAPPING` — a divergência real é `auth_result=SUCCESS` E `authorization_result=DENIED` ("o terminal liberou, o MAGBO não considerou válido; mede o que o bloqueio via HikCentral vai resolver"). O prompt exigia exatamente esse texto e avisava: "sem essa explicação o número não significa nada para a direção". A direção lendo o tooltip atual entende **outra coisa**.
- **D-H3 — `blockedToday` continua sendo lido pela UI.** O prompt mandava *trocar* `blockedToday`→`alertasHoje`; o `AdminDashboard.js` manteve o card "Barrados" lendo `stats.blockedToday` (`:308-309`) **e** adicionou o card "Alertas Hoje" com `alertasHoje` (`:336-337`) — dois cards com o mesmo valor e rótulos diferentes ("Barrados" é justamente o nome enganoso que motivou a depreciação). Confirmado visualmente ao vivo: painel exibe "BARRADOS 1" e "ALERTAS HOJE 1" lado a lado (screenshot `audit-admin-kpis`). Impacto: confusão de leitura; bloqueia a remoção futura do alias.
- **D-H4 — Permissão granular NUNCA é lida pelo frontend.** Grep em `js/`: zero ocorrências de `permissoes`/`hasPermission`. O prompt exigia usar `/api/auth/me` (que expõe `permissoes` — `AuthController.java:79`) para desabilitar campos de escrita. Em vez disso: `MealEntitlementManagement.js:16` usa `canEdit = window.auth?.isAdmin()` — operador **com** `MEAL_ENTITLEMENT_WRITE` vê os campos desabilitados (UI mais restritiva que o backend); `ExitPermissionManagement.js:11` usa `isAdmin() || isOperator()` — **qualquer** operador vê a escrita habilitada e só descobre o 403 ao salvar; e o `:53` (`{canEdit && (...)}`) **esconde** o bloco em vez de desabilitar, contra a regra explícita "campos desabilitados, não escondidos". Backend segue sendo a autoridade (sem furo de segurança), mas o contrato de UX da fase não foi implementado.
- **D-H5 — Cards de resumo do Gestion Cantine renderizam VAZIOS (bug de contrato de campo).** `MealEntitlementManagement.js:192,196` lê `summary.totalAuthorized`/`summary.totalNotAuthorized`; o backend (`MealEntitlementService.summary()`, `:164-169`) devolve `{authorized, notAuthorized, pending, totalStudents}` e `getMealEntitlementSummary` (`js/utils/api.js:211-221`) repassa o JSON cru, sem normaliser → os dois campos são `undefined`. **Provado ao vivo**: screenshot `audit-droits-repas` mostra "TOTAL AUTORISÉS"/"TOTAL NON AUTORISÉS" sem número, com a API respondendo `authorized=2, notAuthorized=0, pending=924, totalStudents=926` no mesmo instante. É exatamente a espécie de bug de campo caçada na fiação da Fase H (`f2169c1` etc.) — este escapou. Além do bug, o prompt pedia 4 valores no resumo (autorizados/sem direito/pendentes/total); só 2 cards existem.
- **D-H6 — Agregados de tentativas negadas do `GeneralReport` não implementados.** O prompt (passo 9) pedia "totais por motivo, por turma, por ponto; e um breakdown de método (FACE vs CARD) usando `/api/access/attempts/stats`". Grep em `GeneralReport.js`: zero ocorrências de `byReason`/`byTurma`/`byPoint`/`byMethod`/`getAttemptStats` — a seção "Tentatives Refusées" (`:1110-1117`) é **apenas o feed** dos últimos 50 (decisão do Sam de 17/07 cobriu o *endpoint do feed*, não a supressão dos agregados). O endpoint `/attempts/stats` do backend funciona (verificado ao vivo) e fica **sem consumidor** na UI, junto com a `getAttemptStats` do `api.js`.

### Observações

1. Idioma misto no `AdminDashboard`: cards em português ("Autorizados", "Barrados", "Tentativas Negadas") num arquivo cujo tooltip novo é francês e cujas telas irmãs são em francês. O prompt pedia coerência de idioma; o padrão pré-existente do arquivo já era PT. Registrar para decisão do Sam junto com D-H3.
2. `ExitPermissionManagement` resolve nome/turma via `userCache` no cliente — compensa os `nome`/`turma` null de `/active` e `/user/{userId}` (obs. 1 da Fase D). Funcional.
3. Chave `linha` dos erros de bulk como String — o front lê direto; sem impacto (ver Fase G).

### Dinâmico
- Ver seção "Verificação dinâmica" (backend + UI) abaixo.

---

## FASE I — Testes automatizados

**Veredito: CONFORME** (1 observação, 0 divergências)

### Execução real (nesta auditoria)

```
mvn test → exit 0
Surefire: 26 arquivos de relatório | Tests: 183 | Failures: 0 | Errors: 0 | Skipped: 2
```

- **7 classes unitárias** (todas as prometidas): `HikvisionEventClassifierTest`, `MealEntitlementServiceTest`, `ExitPermissionServiceTest` (+nested `JanelaHoraria`), `DeduplicationServiceTest`, `AccessDecisionServiceTest`, `EntryWindowRegressionTest` (blindagem), `ExitTimeRegressionTest` (blindagem).
- **17 classes de integração** + `ContextLoadsIT` — as 16 prometidas presentes, incluindo `WebhookDeniedIT` (o mais importante), `ZeroPaddingIT`, `LegacyRegressionIT`, `ExitPermissionFlowIT`, `StatsCompatIT`, `BulkEntitlementIT`, `PermissionsIT`.
- **2 `@Disabled` justificados** e restritos a `LegacyRegressionIT` (`:172` "DISTINCT ON", `:187` "interval '4 hours'") — nativas PostgreSQL-only, exatamente como a regra da fase manda (V13 cobre a conferência manual; executada na bateria de 17/07).

### Infraestrutura

| Item | Evidência | Status |
|---|---|---|
| H2 em memória, perfil test, nunca o Postgres de dev | `application-test.properties:13` (`jdbc:h2:mem:magbotest;...MODE=PostgreSQL`) | ✅ |
| `spring.sql.init.mode=never` | `application-test.properties:29` (com comentário do porquê) | ✅ |
| Token de webhook fixo | `application-test.properties:35` (e ITs fixam via `@SpringBootTest(properties=...)` por causa do `setx` do PC — gotcha #7 do CLAUDE.md) | ✅ |
| 6 payloads reais | `src/test/resources/payloads/` — face-75, card-1, denied-8, door-21, heartbeat, camera-json | ✅ |
| Surefire inclui `*IT.java` | provado pela execução: os 17 ITs rodaram (26 relatórios no surefire-reports) | ✅ |

### Observações

1. O prompt previa 16 classes de integração; existem 17 + `ContextLoadsIT` (excedente, não falta). O total 183/0/2 bate literalmente com o registrado no CLAUDE.md.

---

## VERIFICAÇÃO DINÂMICA (backend prod real + UI Electron real, somente leitura)

Ambiente: `magbo-postgres` UP · backend `prod` no PC (4 env vars do gotcha #2) · `Started MagboAccessApplication in 7.807s` · health `{"status":"UP","database":"CONNECTED"}` · 2 WARNs `SECURITY [prod]` esperados no PC (gotcha #4) · log de startup: `MAGBO policies: meal-not-entitled=DENY, meal-pending=DENY, ... missing-door-mapping=FALLBACK, dedup=90s (enabled=true)` — **políticas de produção D5 ativas**.

### GETs autenticados (admin) × contraprova SQL

| Verificação | Resultado | Contraprova |
|---|---|---|
| `/api/stats/global` | `blockedToday=1 == alertasHoje=1` ✅ · `negadasHoje=8` · `divergenciaHoje=5` · `totalToday=19` · `authorizedToday=18` | SQL: attempts hoje=**8** ✅ · SUCCESS+DENIED hoje=**5** ✅ |
| `/api/access/attempts?size=500` | `pageSize=200` (truncado ✅) · `totalElements=9` | SQL: total attempts=**9** ✅ |
| `/api/access/attempts/stats` | `total=8, divergence=5`, `byReason` com 7 motivos coerentes | ✅ |
| `/api/access/attempts/refectory` · `/gate` | 200, 6 e 2 itens (janela 12h) | ✅ |
| `/api/admin/meal-entitlements/summary` | `authorized=2, notAuthorized=0, pending=924, totalStudents=926` (2+0+924=926 ✅) | — |
| `/api/admin/meal-entitlements?size=3` | `totalElements=926` — **todos** os alunos listados (sem linha ⇒ PENDING) | ✅ |
| `/api/admin/meal-entitlements/0000001` (aluno sem linha) | `status=PENDING` ✅ (ausência ≠ negação, ao vivo) | — |
| `/api/admin/exit-permissions` · `/active` | 200, vazios (banco limpo pós-bateria 17/07) | ✅ |

### UI Electron real (driver da skill `run-magbo-app`, modo kiosk — internet bloqueada)

4 sessões (login real, navegação e screenshots apenas; **nenhum clique de ação, nenhum insert**):

| Sessão | Resultado | Screenshot |
|---|---|---|
| Monitor Cantine | feed "Tentatives Refusées" renderiza · **0 requests externos · 0 erros de console** (R1 segue resolvido) | `%TEMP%\magbo-driver\audit-cantine-*.png` |
| Painel Admin (KPIs) | cards Acessos 19 / Autorizados 18 / **Barrados 1** / Alertas Hoje 1 / Tentativas Negadas 8 / Divergências 5 — valores idênticos à API; duplicação Barrados×Alertas visível (D-H3) | `audit-admin-kpis-*.png` |
| Droits Repas | lista 926 alunos "En attente" (badge distinto, zeros à esquerda visíveis: `0003707`…); **cards de resumo vazios** (D-H5) | `audit-droits-repas-*.png` |
| Sorties | tela renderiza ("Controle de Saídas", em PT), lista vazia coerente com o banco; **sem feed de negadas** (prova dinâmica da D-H1) | `audit-sorties-*.png` |
| Rapport Général | seção "Tentatives refusées — tous les points" renderiza (endpoint geral) | `audit-rapport-*.png` |

Todas as 4 sessões: `externals=0`, `consoleErrors=[]`.

---

## FASE J — SQL versionado e migração

**Veredito: CONFORME** (1 observação, 0 divergências)

| Entrega prometida | Evidência | Status |
|---|---|---|
| V001–V006 idempotentes, padrão Flyway de nome | `deploy/migrations/V001..V006` — `CREATE TABLE IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` | ✅ |
| Zero SQL destrutivo nos V00n | grep `DROP|TRUNCATE|DELETE|ALTER..TYPE` = 0 (único match é o nome `permission_type_check`) | ✅ |
| CHECKs espelham os enums Java exatamente | conferido enum a enum: V001 (5 CHECKs = AccessAction/AuthMethod/AuthResult/AuthorizationResult/DenialReason com 10 valores) · V002/V003 (EntitlementStatus; **CHECK manual de `source` UI/BULK/API com aviso de manutenção** — `V003:37-45`) · V004 (ExitPermissionType/Status) — e contra o `\d` do banco real: idênticos | ✅ |
| `permissoes` nullable | `V005:14` + aviso explícito de por quê (`:8-11`) | ✅ |
| Índices só nas tabelas novas; nenhum em `access_logs` | `V006` (7 índices, aviso no cabeçalho) | ✅ |
| Rollbacks R001–R005 com aviso de emergência | `rollback/R001..R005` — todos com "!! EMERGENCIA APENAS" na 1ª linha | ✅ |
| README com contexto (não-Flyway), quando aplicar, ordem, backup, smoke, rollback | `deploy/migrations/README.md` — seções 1–4+ conferidas | ✅ |
| Sem Flyway no pom, sem `db/migration`, `ddl-auto` intacto | confirmado (nenhuma pasta `db/migration`; ddl-auto=update em uso no PC — tabelas criadas pelo Hibernate conferem com os SQLs) | ✅ |

### Observações

1. O **teste de aplicação em banco limpo, 2× (idempotência executada)** não foi repetido nesta auditoria: criar/dropar um banco temporário é ação de escrita no servidor Postgres, vetada pelas regras da sessão. A equivalência foi verificada por outro caminho: o `\d` das 4 tabelas reais (geradas pelo Hibernate) bate coluna a coluna e CHECK a CHECK com os V00n. Execução no banco limpo → **requer Sam** (procedimento do próprio README, Passo 7 do prompt J).

---

## FASE K — Documentação e ADRs

**Veredito: CONFORME COM OBSERVAÇÕES** (0 divergências próprias; 3 derivas doc↔código detectadas — listadas nas transversais e imputadas aqui como observações)

| Entrega prometida | Evidência | Status |
|---|---|---|
| ADR-001/002/003 (+004 posterior) | `docs/architecture/decisoes/` — 4 ADRs presentes; ADR-003 com estrutura Contexto/Decisão/Consequências/Evidência/Status | ✅ |
| `plano-validacao-estrutural.md` com V01–V14 | presente; bateria executada e aprovada 17/07 (`docs/testing/evidencias/2026-07-17/`) | ✅ |
| `procedimento-hikcentral.md` com lacunas explícitas | presente; 6 marcadores de pendência (`[A DEFINIR...]`/PENDENTE) — não inventou respostas | ✅ |
| `endpoints.md` com rotas novas | 9 menções a meal-entitlements/exit-permissions/attempts | ✅ |
| CLAUDE.md §Estado atual + gotchas preservados | conferido (gotchas 1–7 presentes; estado reflete A–K + B.1 + Fase H) | ✅ |
| Rules atualizadas (backend/database/hikvision/frontend) | conferidas — corretas **exceto** os 3 pontos de deriva abaixo | ⚠️ |

### Observações (deriva doc↔código — corrigir docs, não código)

1. **`.claude/rules/frontend.md:22`** ainda afirma: "o card de resumo da cantina (`/meal-entitlements/summary`) hoje responde **500**". O backend foi corrigido na B.1 (`e450cd3`; `summary()` usa `UserType.ALUNO` e responde 200 — confirmado ao vivo). A dívida real hoje é outra: **o front lê campos errados do summary** (D-H5).
2. **`.claude/rules/frontend.md:15`** e **CLAUDE.md** afirmam que o `DeniedAttemptsFeed` é "usado na cantina **e na portaria**" — falso no código (só CantineMonitor e GeneralReport; D-H1).
3. **`.claude/rules/frontend.md:15`** e CLAUDE.md descrevem as props do feed como `endpoint`/`pollingMs`/`title`; as props reais são **`fetchFn`**/`pollingMs`/`title`/`emptyMessage` (`DeniedAttemptsFeed.js:6`).

---

## VERIFICAÇÕES TRANSVERSAIS

**Veredito: CONFORME COM OBSERVAÇÕES** (inventários abaixo; as derivas doc↔código já imputadas à Fase K)

### 1. Inverso da fiação (`window.api`)
Inventário completo de chamadas `window.api.X` e `window.api?.X` em `js/` (21 nomes distintos): **todas têm definição e anexação — 0 órfãs.** Legadas resolvem em `js/api.js` (fetchLogs, registerAccess, fetchAllLogs, fetchGlobalStats, fetchOverview, fetchUserLogs, forcePronoteSync, createUser, createUsersBulk, updateUser, deleteUser); as da Fase H no bloco `js/utils/api.js:443-455`.

### 2. Resíduos
- **dicebear:** 1 ocorrência, **só em comentário** (`js/utils/helpers.js:79` — explica a substituição F7c). Runtime limpo. ✅
- **URLs http(s) externas no frontend:** nenhuma carga de recurso externo. `index.html` tem **zero** `src=`/`href=` http (R1 vendorizado). O que existe em `js/` são: `<a href>` de crédito/institucional (sammagbo.com, lyceemoliere.com.br — abrem no navegador, não são requests da UI), namespaces XML de SVG, e defaults `http://localhost:8080`. Prova de runtime: 4 sessões kiosk com **externals=0**. ✅
- **TODO/FIXME (inventário):** backend — `ExitPermissionController.java:62` ("TODO: fetch names if needed", ligado à obs. 1 da Fase D) · `pronote/ApiPronoteDataSource.java:34` (pré-existente, fora do escopo A–K). js — `MealEntitlementManagement.js:163` (comentário sobre filtro por turma ideal via API).
- **Código morto candidato:**
  - `backend/dto/AccessDecision.java` — record criado na Fase B e nunca usado (o `process()` é `void`).
  - `js/utils/api.js` — **5 funções definidas, nunca anexadas, nunca chamadas:** `getMealEntitlement` (:223), `getExitPermissions` (:284), `getExitPermissionsByUser` (:317), `getAttempts` (:363), `getAttemptStats` (:385). As duas últimas ficariam vivas se D-H6 fosse implementada.
  - `AccessAttemptRepository` — `findTop200ByUserIdOrderByTimestampDesc` (:20) e `countByDenialReasonAndTimestampGreaterThanEqual` (:16) declarados (contrato da Fase A) e sem uso atual.

### 3. Segredos (working tree + docs)
- Token de webhook: nenhum valor real em lugar nenhum; só `dev-webhook-token` (placeholder de dev em `application-dev.properties:46`) e `test-token-fixo-para-integracao` (fixture de teste). ✅
- Senha de banco dev `magbo_dev_pass_2026` aparece em CLAUDE.md/rules/deploy — **estado conhecido e aceito** (senha de dev local, documentada como tal; a VM usa `.env`). Sem novidade.
- `ProdSecurityStartupCheck` confirmou ao vivo que PC roda com senha/JWT de dev (2 WARNs esperados — gotcha #4).

### 4. Contratos de retorno (espécie do `902de76`)
Funções de escrita do `js/utils/api.js` × corpo real dos endpoints: `putMealEntitlement` tolera 200 vazio (`api.js:248-250` — a correção); `postExitPermission`/`revokeExitPermission` fazem `res.json()` incondicional, mas os endpoints **devolvem DTO no corpo** (`ExitPermissionController.java:80, :97`) — seguro; `postMealEntitlementBulk` idem (`BulkResultDto` sempre no corpo). **Nenhum caso restante da espécie.** ✅

### 5. Deriva doc↔código
3 itens, todos em docs (código vence): ver observações da **Fase K** (summary "responde 500" desatualizado; feed "usado na portaria" falso; props do feed `endpoint`→na verdade `fetchFn`).

---

## ITENS QUE REQUEREM SAM / BANCADA (fora do escopo desta auditoria)

1. **Decidir as divergências da Fase H** (D-H1 feed da portaria ausente · D-H2 tooltip errado da divergência · D-H3 card "Barrados"/`blockedToday` duplicado · D-H4 permissão granular não lida na UI · D-H5 cards de resumo vazios · D-H6 agregados do relatório) — nenhuma foi corrigida, conforme regra da auditoria. D-H2 e D-H5 são as de maior impacto operacional imediato (informação errada/vazia para direção e cantina).
2. **D-E1**: parâmetro `to` do `/attempts/stats` ignorado — corrigir ou documentar o contrato.
3. **Fase J**: teste de aplicação dos V001–V006 em banco limpo, 2× (idempotência executada) — auditoria não criou banco temporário (ação de escrita vetada).
4. **Docs**: corrigir as 3 derivas doc↔código da Fase K (frontend.md:15, :22; CLAUDE.md §Fase H).
5. **Idioma da UI**: padronizar PT×FR (AdminDashboard e tela Sorties em PT; cantina/droits/rapport em FR) — decisão de produto.
6. **Bancada (já coberta pela bateria V01–V14 de 17/07, não repetida):** comportamentos com hardware real (subtipos 75/1/8, dedup física, consumo SINGLE em saída real).

---

## CONCLUSÃO

O sistema implementado **corresponde com alta fidelidade aos contratos das Fases A–G, I e J** — verificado arquivo a arquivo, com suíte de testes verde reproduzida (183/0/2) e comportamento dinâmico conferido contra o banco real (KPIs = SQL, ponta a ponta). A **Fase H concentra todas as divergências relevantes** (6), todas no padrão já conhecido da fase: contratos de campo/consumidor entre backend e UI que só aparecem percorrendo as telas — a auditoria percorreu com o app Electron real e achou o que os curls não mostram (cards de resumo vazios, feed da portaria ausente, tooltip errado). A Fase K está íntegra, com 3 frases desatualizadas a corrigir nos docs.

Nada foi corrigido, commitado ou alterado além deste relatório. Backend e banco locais foram usados somente para leitura (o backend subido para a auditoria foi encerrado ao final).

