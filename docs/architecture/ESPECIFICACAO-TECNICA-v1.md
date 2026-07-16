# MAGBO Access Control — Especificação Técnica de Implementação
**Versão:** 1.0 · **Data:** 2026-07-15 · **Base:** main @ `2a66f21` (F1 já implementado e validado)
**Destinatário:** Antigravity (equipe de desenvolvimento) · **Autor da arquitetura:** Claude (arquiteto) · **Aprovador:** Sam

---

## 0. COMO USAR ESTE DOCUMENTO

Este documento é **normativo**. Todas as decisões de arquitetura já foram tomadas. O executor **não deve decidir arquitetura** — deve implementar o que está aqui. Se algo estiver ambíguo ou contradizer o código real, **PARE e reporte** em vez de improvisar.

Ordem de execução: seguir as **Fases A→K** da seção 12, em sequência. Cada fase tem critério de conclusão objetivo.

**Proibições absolutas (violação = parar tudo):**
- ❌ Nunca fazer `git commit` ou `git push` sem autorização explícita do Sam.
- ❌ Nunca apagar, alterar ou migrar registros existentes de `access_logs`.
- ❌ Nunca fazer alteração destrutiva de schema (DROP, ALTER TYPE, NOT NULL em coluna existente).
- ❌ Nunca transformar tentativa negada em acesso válido.
- ❌ Nunca contar tentativa negada como refeição.
- ❌ Nunca alterar presença/localização por tentativa negada.
- ❌ Nunca usar senha/PIN como método de autenticação de aluno.
- ❌ Nunca armazenar dados financeiros/bancários.
- ❌ Nunca afirmar ou implementar bloqueio físico pelo backend (ver §4.7).
- ❌ Nunca introduzir dados mock/placeholder.

---

## 1. AUDITORIA DE CONFORMIDADE (estado real do código em 2026-07-15)

Verificado por leitura direta do repositório. Toda decisão desta spec é compatível com isto:

### 1.1 O que EXISTE e está validado com hardware
| Item | Estado | Evidência |
|---|---|---|
| Identificação única FACE/CARD → mesmo `employeeNoString` | ✅ Validado 14/07 (T1–T4) | Terminal traduz cartão→EmployeeID internamente; `cardNo` **nunca** é enviado |
| `AuthMethod` enum (FACE/CARD/UNKNOWN) + `auth_method` + `hikvision_sub_event_type` em `access_logs` | ✅ Commit `2a66f21` | CHECK constraint gerado pelo Hibernate |
| `resolveAuthMethod()` no webhook: 75→FACE, 1→CARD, else→UNKNOWN | ✅ Implementado | Validado: face=FACE\|75, cartão=CARD\|1 |
| Parse tolerante multipart/JSON (`parsePayload`, F6b) | ✅ Validado | MinMoe=multipart; DeepinView=JSON puro |
| Token webhook por header **ou** `?token=` + `MessageDigest.isEqual` + deny-by-default (503) | ✅ Implementado | — |
| `DoorMappingService.resolve(doorNo, readerNo, ip)` com fallback IP-only (`door_no IS NULL`) | ✅ Validado | Terminais MinMoe não enviam doorNo |
| Flags `FORA_HORARIO` / `EXCEDEU_TEMPO` (observacionais, log SEMPRE salvo) | ✅ Validado 13/07 | CANT-04, CANT-11 |
| Pareamento de refeições (1ª ENTRADA + 1ª SAÍDA/dia) → N entradas = 1 refeição | ✅ Validado | CANT-03 |
| F5b: `employeeNoString` sem correspondência → ignorado, sem log | ✅ Validado | CANT-05 |
| Autorização por setor (`SystemUser.setoresPermitidos` CSV + `AreaSecurity.can(area)`) | ✅ Implementado | ADMIN faz bypass |
| Bulk import de pessoas (`POST /api/users/bulk`) — **não sobrescreve**, erro por linha | ✅ Implementado | "ID já existe — bulk não sobrescreve" |
| Zeros à esquerda preservados ponta a ponta (String) | ✅ Validado | `0001764`, `0003906` |

### 1.2 Tabela de subEventTypes (confirmada com hardware DS-K1T344MX-E1, fw V4.13.0)
| subEventType | Significado | Traz `employeeNoString`? | Tratamento nesta spec |
|---|---|---|---|
| **75** | Autenticação APROVADA por **face** | Sim | → `access_logs`, `auth_method=FACE` |
| **1** | Autenticação APROVADA por **cartão** | Sim | → `access_logs`, `auth_method=CARD` |
| **8** | Autenticação **NEGADA/expirada** pelo terminal | **Sim** ⚠️ | → `access_attempts` (`DEVICE_DENIED`). **Nunca** `access_logs` |
| 9 | Evento de dispositivo | Não | Ignorado (200 OK) |
| 21 / 22 | Porta abriu / fechou | Não | Ignorado (200 OK) |
| major 1/2/3 (1024,1028,1031,39,80,112) | Boot/config do terminal | Não | Ignorado (200 OK) |
| `heartBeat` | Keep-alive (~30s) | Não | Ignorado (200 OK) |

⚠️ **Achado crítico (CANT-09, 13/07):** o subtipo 8 traz identidade e **hoje gera `access_log` como se fosse entrada válida** — refeição falsa. A Fase B estanca isso.
⚠️ **Limitação conhecida:** cartão e face **não são distinguíveis por outro campo** além do subtipo. Não existe `cardNo` no payload. Não inventar campo.

### 1.3 O que NÃO existe (será criado por esta spec)
`access_attempts` · `meal_entitlements` · `meal_entitlement_events` · `student_exit_permissions` · permissões granulares · deduplicação · checagem de `ativo` no webhook · telas de gestão · importação de direitos · KPI de negadas.

### 1.4 Contradições encontradas na auditoria e como esta spec as resolve
| # | Contradição | Resolução normativa |
|---|---|---|
| C1 | `USER_INACTIVE` está na taxonomia, mas o webhook **não checa `ativo`** hoje (`findByHikvisionEmployeeId` não filtra) — usuário inativo gera log normal | Fase B adiciona a checagem **no service**, não no repository. É **mudança de comportamento consciente e desejada**. Documentar no relatório de auditoria. |
| C2 | `MISSING_DOOR_MAPPING` está na taxonomia, mas hoje terminal sem mapping cai em fallback legado `PORT1+ENTRADA` (`fallback=true`) — comportamento validado nos testes | Vira **política configurável** `magbo.policy.missing-door-mapping` = `FALLBACK` (default, preserva comportamento atual) \| `ATTEMPT` (grava tentativa em vez de log). **Default FALLBACK** = zero regressão. |
| C3 | Renomear `blockedToday`→`alertasHoje` quebraria o frontend atual (lê `blockedToday`) | DTO mantém **`blockedToday` como alias depreciado** + adiciona `alertasHoje` (mesmo valor) + `negadasHoje` (novo). Frontend migra para `alertasHoje`. Remover o alias só numa fase futura. |
| C4 | `meal_count` em `app_users` está dormante (nada incrementa); contagem real deriva de logs | **Não usar.** Não incrementar. Contagem continua derivada de `access_logs`. |
| C5 | Acesso manual (`POST /api/access`) não aplica regras de janela (I1) | **Fora do escopo deste ciclo.** Não alterar. Registrar como decisão pendente do Sam. |
| C6 | Variável `isMapped` no webhook é sempre `true` (código morto) | Pode ser removida durante a extração de serviços da Fase B, sem alterar comportamento. |
| C7 | Não existe Flyway no `pom.xml` nem pasta `db/migration`; prod usa `ddl-auto=update` | **Decisão do arquiteto:** este ciclo entrega **SQL versionado manual** em `deploy/migrations/` (idempotente, numerado). Adotar Flyway é fase própria futura (§3.4). Motivo: adotar Flyway com ~440k registros e schema nascido do Hibernate é projeto separado e não deve ser misturado com mudança funcional. |

---

## 2. PRINCÍPIOS DE ARQUITETURA (invioláveis)

1. **Separação estrutural (Opção B aprovada):** `access_logs` = **acessos efetivos**. `access_attempts` = **tentativas negadas**. Nenhuma query existente de `access_logs` muda. Isso garante por construção que negada nunca vira acesso/refeição/localização.
2. **Backend é observacional:** o webhook chega **depois** da decisão física do terminal. O MAGBO **não libera nem bloqueia porta** (§4.7). `DENY` no MAGBO significa **"não registra como acesso efetivo; registra tentativa"**, jamais "porta fechou".
3. **Três eixos independentes** (nunca misturar):
   - `auth_method` = **como** a pessoa se identificou (FACE/CARD/UNKNOWN).
   - `auth_result` = o que o **terminal** decidiu (SUCCESS/DENIED/UNKNOWN).
   - `authorization_result` + `denial_reason` = o que o **MAGBO** decidiu e por quê.
4. **Só aditivo no banco:** colunas novas nullable, tabelas novas. Nunca DROP/ALTER destrutivo. Registros antigos permanecem válidos com campos nulos.
5. **Política em configuração, não em código:** o que é `OBSERVATION` no piloto e `DENY` em produção muda por `application.properties`, sem recompilar.
6. **Ausência de dado ≠ negação:** `meal_entitlements` sem linha = `PENDING`, tratado por política explícita. Nunca interpretar vazio como "não pagou".
7. **Enums Java com `@Enumerated(EnumType.STRING)`.** Nunca enum nativo do PostgreSQL. Colunas `VARCHAR` + CHECK constraint.
8. **Preservação dos testes validados:** o caminho feliz (sub 75/1 → `access_logs` com `REFEI1/ENTRADA/fallback=false`) **deve continuar idêntico**. Qualquer regressão aqui invalida a entrega.

---

## 3. MODELO DE DADOS

### 3.1 Enums (todos em `com.magbo.access.models`, `EnumType.STRING`)

| Enum | Valores | Uso |
|---|---|---|
| `AuthMethod` **(JÁ EXISTE)** | `FACE`, `CARD`, `UNKNOWN` | `access_logs.auth_method`, `access_attempts.auth_method` |
| `AuthResult` **(novo)** | `SUCCESS`, `DENIED`, `UNKNOWN` | **Somente** `access_attempts.auth_result`. Não vai para `access_logs` (estar lá já significa SUCCESS — decisão do Sam). |
| `AuthorizationResult` **(novo)** | `AUTHORIZED`, `DENIED`, `OBSERVATION`, `NOT_APPLICABLE` | `access_attempts.authorization_result` |
| `DenialReason` **(novo)** | `MEAL_NOT_ENTITLED`, `OUTSIDE_MEAL_TIME`, `DUPLICATE_MEAL`, `EXIT_NOT_AUTHORIZED`, `OUTSIDE_EXIT_WINDOW`, `USER_INACTIVE`, `UNKNOWN_USER`, `MISSING_DOOR_MAPPING`, `DEVICE_DENIED`, `NORMAL` | `access_attempts.denial_reason` |
| `EntitlementStatus` **(novo)** | `AUTHORIZED`, `NOT_AUTHORIZED`, `PENDING` | `meal_entitlements.status` |
| `ExitPermissionType` **(novo)** | `PERMANENT`, `RECURRING`, `DATE_RANGE`, `SINGLE` | `student_exit_permissions.permission_type` |
| `ExitPermissionStatus` **(novo)** | `ACTIVE`, `REVOKED`, `USED`, `EXPIRED` | `student_exit_permissions.status` |
| `PolicyMode` **(novo)** | `OBSERVATION`, `DENY` | Valor das properties `magbo.policy.*` |

`DenialReason.NORMAL` existe para completude semântica; **não deve ser gravado** em `access_attempts` (tentativa sempre tem motivo real).

### 3.2 `access_logs` — SEM ALTERAÇÕES NESTE CICLO
Já contém (F1): `auth_method VARCHAR(8)`, `hikvision_sub_event_type INTEGER`. **Não adicionar `auth_result`, `granted`, `authorization_result` nem `denial_reason`** — decisão explícita do Sam: estar nesta tabela já significa acesso efetivo e bem-sucedido.

### 3.3 `access_attempts` — NOVA

Entidade `AccessAttempt` (`com.magbo.access.models`), tabela `access_attempts`:

| Coluna | Tipo Java | Tipo SQL | Null? | Descrição |
|---|---|---|---|---|
| `id` | `Long` | `BIGSERIAL PK` | não | `GenerationType.IDENTITY` |
| `user_id` | `String` | `VARCHAR(255)` | **sim** | `null` quando o ID não existe no MAGBO (`UNKNOWN_USER`). **Sem FK** (mesmo padrão de `access_logs`) |
| `employee_no_raw` | `String` | `VARCHAR(64)` | não | `employeeNoString` **bruto** do payload, sempre preservado (com zeros à esquerda) |
| `nome_snapshot` | `String` | `VARCHAR(255)` | sim | `name` do payload (útil quando `user_id` é null) |
| `point_id` | `String` | `VARCHAR(255)` | sim | Resolvido pelo DoorMapping; null se não resolvido |
| `action` | `AccessAction` | `VARCHAR(16)` | sim | ENTRADA/SAIDA conforme mapping |
| `terminal_ip` | `String` | `VARCHAR(45)` | sim | IPv4/IPv6 do dispositivo |
| `auth_method` | `AuthMethod` | `VARCHAR(8)` | sim | FACE/CARD/UNKNOWN |
| `auth_result` | `AuthResult` | `VARCHAR(8)` | não | Decisão **do terminal** |
| `authorization_result` | `AuthorizationResult` | `VARCHAR(16)` | não | Decisão **do MAGBO** |
| `denial_reason` | `DenialReason` | `VARCHAR(32)` | não | Motivo |
| `hikvision_sub_event_type` | `Integer` | `INTEGER` | sim | Subtipo bruto |
| `timestamp` | `LocalDateTime` | `TIMESTAMP` | não | **Hora do servidor** (`LocalDateTime.now()`), nunca a do payload |
| `door_mapping_fallback` | `Boolean` | `BOOLEAN` | sim | `true` se o ponto veio do fallback legado |

**Índices obrigatórios:** `idx_attempts_timestamp (timestamp DESC)` · `idx_attempts_user_ts (user_id, timestamp DESC)` · `idx_attempts_reason_ts (denial_reason, timestamp DESC)` · `idx_attempts_point_ts (point_id, timestamp DESC)`.

### 3.4 `meal_entitlements` — NOVA

Entidade `MealEntitlement`, tabela `meal_entitlements`. **Direito operacional à refeição. Nenhum dado financeiro.**

| Coluna | Tipo Java | Tipo SQL | Null? | Descrição |
|---|---|---|---|---|
| `user_id` | `String` | `VARCHAR(255) PK` | não | PK natural = `app_users.id` (1 linha por aluno) |
| `status` | `EntitlementStatus` | `VARCHAR(16)` | não | AUTHORIZED / NOT_AUTHORIZED / PENDING |
| `valid_from` | `LocalDate` | `DATE` | sim | null = sem início definido (vale desde sempre) |
| `valid_until` | `LocalDate` | `DATE` | sim | null = sem fim definido (vale indefinidamente) |
| `note` | `String` | `VARCHAR(255)` | sim | Observação administrativa (**sem dados de pagamento**) |
| `updated_by` | `String` | `VARCHAR(50)` | sim | username do operador |
| `updated_at` | `LocalDateTime` | `TIMESTAMP` | não | `@PreUpdate`/`@PrePersist` |
| `created_at` | `LocalDateTime` | `TIMESTAMP` | não | — |

**Campos reservados para evolução futura (criar as COLUNAS agora, nullable, mas NÃO implementar a lógica):** `days_of_week VARCHAR(16)` (CSV `1,2,3,4,5`, ISO-8601: 1=segunda), `meal_type VARCHAR(16)` (ex.: `LUNCH`; default null = qualquer). Justificativa: adicionar coluna depois é trivial, mas ter o campo desde já evita migração futura e deixa a intenção documentada. **A Fase D ignora esses campos na regra.**

**Regra de ausência:** sem linha para o `user_id` → tratar como `PENDING` (não como negado). **Nunca criar linha automaticamente** no fluxo do webhook.

### 3.5 `meal_entitlement_events` — NOVA (histórico/auditoria)

| Coluna | Tipo | Null? | Descrição |
|---|---|---|---|
| `id` | `BIGSERIAL PK` | não | — |
| `user_id` | `VARCHAR(255)` | não | — |
| `old_status` | `VARCHAR(16)` | sim | null na primeira definição |
| `new_status` | `VARCHAR(16)` | não | — |
| `old_valid_from`/`old_valid_until`/`new_valid_from`/`new_valid_until` | `DATE` | sim | — |
| `changed_by` | `VARCHAR(50)` | não | username |
| `changed_at` | `TIMESTAMP` | não | — |
| `note` | `VARCHAR(255)` | sim | — |
| `source` | `VARCHAR(16)` | não | `UI` \| `BULK` \| `API` |

Índice: `idx_ment_events_user_ts (user_id, changed_at DESC)`.
**Regra:** toda alteração de `meal_entitlements` grava um evento **na mesma transação**. Nunca alterar sem histórico.

### 3.6 `student_exit_permissions` — NOVA

| Coluna | Tipo Java | Tipo SQL | Null? | Descrição |
|---|---|---|---|---|
| `id` | `Long` | `BIGSERIAL PK` | não | — |
| `user_id` | `String` | `VARCHAR(255)` | não | — |
| `permission_type` | `ExitPermissionType` | `VARCHAR(16)` | não | PERMANENT/RECURRING/DATE_RANGE/SINGLE |
| `valid_from` | `LocalDate` | `DATE` | sim | — |
| `valid_until` | `LocalDate` | `DATE` | sim | — |
| `start_time` | `LocalTime` | `TIME` | sim | — |
| `end_time` | `LocalTime` | `TIME` | sim | — |
| `days_of_week` | `String` | `VARCHAR(16)` | sim | CSV ISO-8601 (1=segunda … 7=domingo) |
| `status` | `ExitPermissionStatus` | `VARCHAR(16)` | não | ACTIVE/REVOKED/USED/EXPIRED |
| `reason` | `String` | `VARCHAR(255)` | **não** | Motivo obrigatório (exigência do Sam) |
| `note` | `String` | `VARCHAR(255)` | sim | Observação |
| `created_by` | `String` | `VARCHAR(50)` | **não** | Quem autorizou (obrigatório) |
| `created_at` | `LocalDateTime` | `TIMESTAMP` | **não** | — |
| `revoked_by` | `String` | `VARCHAR(50)` | sim | — |
| `revoked_at` | `LocalDateTime` | `TIMESTAMP` | sim | — |
| `used_at` | `LocalDateTime` | `TIMESTAMP` | sim | Preenchido quando `SINGLE` é consumida |

Índices: `idx_exitperm_user_status (user_id, status)` · `idx_exitperm_validity (valid_from, valid_until)`.

**Semântica por tipo:**
- `PERMANENT`: ignora datas/dias/horários. Válida enquanto `status=ACTIVE`.
- `DATE_RANGE`: exige `valid_from`/`valid_until`; valida a data corrente no intervalo (inclusive).
- `RECURRING`: exige `days_of_week`; opcionalmente `start_time`/`end_time` e intervalo de datas.
- `SINGLE`: uma única saída autorizada. Ao ser consumida → `status=USED`, `used_at` preenchido. **Consumo só ocorre em saída efetiva** (nunca em tentativa negada).

**Regra de janela horária:** se `start_time` e `end_time` presentes → hora atual deve estar dentro (inclusive). Se ausentes → qualquer hora.

### 3.7 `system_users` — ALTERAÇÃO ADITIVA (permissões granulares)

Adicionar coluna `permissoes VARCHAR(255)` (CSV, nullable). Valores reconhecidos:
- `MEAL_ENTITLEMENT_WRITE` — alterar direito à refeição
- `EXIT_PERMISSION_WRITE` — criar/revogar autorização de saída
- `ATTEMPTS_READ` — ver tentativas negadas
- `*` — todas

**Compatibilidade:** ADMIN sempre passa (bypass). `permissoes = null` → operador sem permissões granulares (só o que `setoresPermitidos` já concede). **Nenhum operador existente perde acesso.**

---

## 4. REGRAS DE NEGÓCIO E FLUXOS

### 4.1 Configuração de políticas (`application.properties` / `application-prod.properties`)

```properties
# --- Políticas de decisão (piloto) ---
magbo.policy.meal-not-entitled=DENY
magbo.policy.meal-pending=OBSERVATION
magbo.policy.outside-meal-time=OBSERVATION
magbo.policy.duplicate-meal=OBSERVATION
magbo.policy.exit-not-authorized=DENY
magbo.policy.user-inactive=DENY
magbo.policy.missing-door-mapping=FALLBACK
# --- Deduplicação ---
magbo.dedup.window-seconds=90
magbo.dedup.enabled=true
```

**Semântica de `PolicyMode`:**
- `OBSERVATION` → grava `access_logs` normalmente (acesso conta) **E** grava `access_attempts` com `authorization_result=OBSERVATION` para auditoria/painel.
- `DENY` → **não** grava `access_logs`; grava apenas `access_attempts` com `authorization_result=DENIED`.

⚠️ `magbo.policy.meal-pending` **DEVE** ser definido explicitamente em produção. Comentário obrigatório no `application-prod.properties`:
```properties
# ATENÇÃO: em produção, decidir explicitamente. Por segurança, o padrão institucional
# provavelmente deve ser DENY (aluno sem direito confirmado não almoça).
# Piloto = OBSERVATION apenas para coletar dados reais sem impacto operacional.
```

`magbo.policy.missing-door-mapping`: `FALLBACK` (default — preserva o comportamento legado PORT1+ENTRADA validado) | `ATTEMPT` (grava tentativa `MISSING_DOOR_MAPPING`, sem log).

### 4.2 Classificação de evento (`HikvisionEventClassifier`)

Serviço puro, sem dependências de banco. Entrada: `subEventType`. Saída: `EventClassification(AuthMethod method, AuthResult result, boolean isAccessCandidate)`.

| subType | method | result | isAccessCandidate |
|---|---|---|---|
| 75 | FACE | SUCCESS | **true** |
| 1 | CARD | SUCCESS | **true** |
| 8 | UNKNOWN | DENIED | false |
| outro/null (com employeeNoString) | UNKNOWN | UNKNOWN | false |

**Whitelist rígida:** apenas `isAccessCandidate=true` pode gerar `access_logs`. Todo o resto que traga `employeeNoString` gera `access_attempts`. Eventos **sem** `employeeNoString` continuam ignorados com HTTP 200 (heartbeat, 21/22, 9, boot) — comportamento atual **preservado**.

### 4.3 Fluxo do webhook (alvo)

```
1. Token (503 se não configurado; 401 se inválido)                    [INALTERADO]
2. parsePayload (multipart | JSON puro)                               [INALTERADO]
3. Extrai event + terminalIp (payload.ipAddress || request.remoteAddr)[INALTERADO]
4. Sem employeeNoString? → log.warn + 200 OK, FIM                     [INALTERADO]
5. classificação = HikvisionEventClassifier.classify(subEventType)
6. Resolve DoorMapping (doorNo, readerNo, terminalIp)
   └─ se fallback E policy.missing-door-mapping=ATTEMPT
        → ATTEMPT(MISSING_DOOR_MAPPING, auth_result=classificação.result,
                  authorization_result=DENIED, user_id=nullable) → 200 OK, FIM
7. classificação.result == DENIED (sub 8)
   → ATTEMPT(DEVICE_DENIED, authorization_result=DENIED) → 200 OK, FIM   ★ estanca refeição falsa
8. classificação.isAccessCandidate == false (subtipo desconhecido)
   → ATTEMPT(denial_reason=DEVICE_DENIED, auth_result=UNKNOWN,
             authorization_result=NOT_APPLICABLE) → 200 OK, FIM
9. Busca usuário por hikvisionEmployeeId
   ├─ ausente → ATTEMPT(UNKNOWN_USER, user_id=null,
   │            employee_no_raw=<bruto>, nome_snapshot=<payload.name>) → 200 OK, FIM
   └─ presente mas ativo=false → política user-inactive
        DENY → ATTEMPT(USER_INACTIVE) → 200 OK, FIM
        OBSERVATION → segue + ATTEMPT(USER_INACTIVE, OBSERVATION)
10. Deduplicação (se habilitada e ação/ponto se aplicam)
    → duplicata → política duplicate-meal
11. Regras por área (ver 4.4 / 4.5 / 4.6)
12. Decisão final:
    AUTHORIZED    → ACCESS_LOG (auth_method, hikvision_sub_event_type, flag)
    OBSERVATION   → ACCESS_LOG + ACCESS_ATTEMPT(OBSERVATION)
    DENIED        → ACCESS_ATTEMPT(DENIED) apenas
13. HTTP 200 SEMPRE (evita tempestade de retry do aparelho)          [INALTERADO]
```

**Invariante:** exceções não tratadas continuam retornando 500 como hoje; nenhuma exceção pode impedir a resposta 200 nos caminhos normais.

### 4.4 Regras da CANTINA (`point_id` começa com `REFEI` ou `CANTINA`)

**Somente para `action=ENTRADA`.** Ordem de avaliação **obrigatória** (a primeira que decidir DENY encerra):

```
1. DEDUPLICAÇÃO
   Existe access_log do mesmo (user_id, point_id, ENTRADA) nos últimos
   magbo.dedup.window-seconds? → DUPLICATE_MEAL → política duplicate-meal
   [OBSERVATION no piloto: grava log + attempt]

2. DIREITO À REFEIÇÃO
   entitlement = meal_entitlements[user_id]
   ├─ ausente        → PENDING → política meal-pending
   ├─ NOT_AUTHORIZED → MEAL_NOT_ENTITLED → política meal-not-entitled [DENY no piloto]
   ├─ PENDING        → política meal-pending
   └─ AUTHORIZED     → validar vigência:
        valid_from != null && hoje < valid_from  → MEAL_NOT_ENTITLED
        valid_until != null && hoje > valid_until → MEAL_NOT_ENTITLED
        (days_of_week e meal_type: IGNORAR nesta fase — campos reservados)

3. JANELA DE HORÁRIO  [LÓGICA EXISTENTE — NÃO REESCREVER]
   flag = validateEntryWindow(user, now)   // mantém FORA_HORARIO
   se flag == "FORA_HORARIO" → OUTSIDE_MEAL_TIME → política outside-meal-time
   [OBSERVATION no piloto: grava access_log COM flag=FORA_HORARIO + attempt]
```

**Para `action=SAIDA` na cantina:** manter **exatamente** a lógica atual (`validateExitTime` → `EXCEDEU_TEMPO`). **Nenhuma regra nova.** Sem entitlement, sem dedup. Saída é sempre `AUTHORIZED`.

**Contagem de refeições:** permanece derivada de `access_logs` (pareamento 1ª ENTRADA + 1ª SAÍDA/dia). **Não** usar `meal_count`. Como tentativas negadas não entram em `access_logs`, a contagem fica automaticamente correta.

**Payload do painel da cantina para negadas** (exigência do Sam — todos obrigatórios): aluno (nome), turma, horário, método (FACE/CARD), ponto de acesso, motivo da negação.

### 4.5 Regras do PORTÃO (`point_id` começa com `PORT`)

**Somente para `action=SAIDA`.** `action=ENTRADA` no portão: registrar normalmente, **sem regra nova**.

```
1. permissions = student_exit_permissions[user_id] WHERE status=ACTIVE
2. Existe alguma VÁLIDA AGORA?
   PERMANENT   → válida
   DATE_RANGE  → valid_from <= hoje <= valid_until
   RECURRING   → dia da semana atual ∈ days_of_week
                 (+ intervalo de datas, se preenchido)
   SINGLE      → ainda não usada (status=ACTIVE)
   + se start_time/end_time preenchidos → hora atual dentro da janela
3. Nenhuma permissão ACTIVE          → EXIT_NOT_AUTHORIZED → política exit-not-authorized [DENY]
   Existe permissão mas fora de data/dia/hora → OUTSIDE_EXIT_WINDOW → mesma política
4. Válida → ACCESS_LOG (SAIDA)
   └─ se a permissão usada é SINGLE → marcar status=USED, used_at=now
      (NA MESMA TRANSAÇÃO do access_log; só em saída efetiva)
```

**Invariante crítica:** tentativa negada de saída **não** grava `access_logs` → a presença do aluno (`countPresentToday`, ocupação) **permanece inalterada**. Isto é garantido estruturalmente pela Opção B.

**Distinção obrigatória nos relatórios:** `EXIT_NOT_AUTHORIZED` (não tem autorização nenhuma) ≠ `OUTSIDE_EXIT_WINDOW` (tem, mas fora da validade). Nunca agrupar.

### 4.6 BIBLIOTECA (`BIBLIO`) e ENFERMARIA (`ENFERM`)
**Nenhuma regra nova neste ciclo.** Continuam gerando `access_logs` normais. `authorization_result` conceitual = `NOT_APPLICABLE`. Deduplicação: **não aplicar** (o toggle entrada/saída do CDI depende de eventos consecutivos).

### 4.7 MAGBO × bloqueio físico — FATO TÉCNICO CONFIRMADO

**Evidência (13-14/07):** o terminal decide localmente e **notifica depois**. Provas: (a) validade expirada → voz nega **antes** de qualquer HTTP; o evento sub 8 chega depois; (b) sequência 21 (porta abre) → 75/1 (autenticação) → 22 (porta fecha) — a porta já operou; (c) a resposta HTTP do MAGBO é ignorada pelo aparelho; (d) o terminal enfileira e reenvia eventos quando o destino cai.

**Conclusões normativas:**
1. O webhook é **pós-evento**. ❌ Não implementar "liberação em tempo real".
2. `DENY` no MAGBO = classificação lógica + auditoria. **Não** fecha porta.
3. Bloqueio físico real só existe **no lado do dispositivo**: HikCentral distribuindo access levels/schedules (procedimento operacional, ver §11.3), não código do backend.
4. **Divergência física × lógica** é dado de primeira classe e deve ser consultável: `auth_result=SUCCESS` **E** `authorization_result=DENIED` ⇒ "porta abriu, mas o MAGBO não contou como acesso válido". Este é o KPI que mede a eficácia do futuro bloqueio via HikCentral.

> **Refinamento — ADR-004 (2026-07-16):** para **refeição** **não** haverá bloqueio físico via HikCentral (nem no roadmap). O modelo da cantina é **bloqueio operacional assistido** (terminal = identidade · MAGBO = regra · operador = exceção). Para refeição, a divergência da conclusão 4 é **permanente e por design** (carga de exceção do operador), não "eficácia de bloqueio futuro". As conclusões 1–2 (webhook pós-evento; MAGBO não fecha porta) permanecem integrais. Ver `decisoes/ADR-004-bloqueio-operacional-assistido.md`.

---

## 5. CAMADA DE SERVIÇOS

**Diretriz:** o `HikvisionWebhookController` tem 367 linhas e mistura HTTP, parse e regra. Extrair para serviços — **preservando comportamento validado byte a byte** no caminho 75/1.

| Serviço (novo) | Pacote | Responsabilidade | Depende de |
|---|---|---|---|
| `HikvisionEventClassifier` | `services` | subType → (AuthMethod, AuthResult, isAccessCandidate). **Puro, sem banco.** | — |
| `AccessAttemptService` | `services` | Monta e persiste `AccessAttempt`. Método único `record(...)` com todos os campos. | `AccessAttemptRepository` |
| `MealEntitlementService` | `services` | `EntitlementDecision evaluate(userId, LocalDate)` → status efetivo + motivo. CRUD + histórico transacional. | `MealEntitlementRepository`, `MealEntitlementEventRepository` |
| `ExitPermissionService` | `services` | `ExitDecision evaluate(userId, LocalDateTime)` → válida/motivo + permissão usada. CRUD, revoke, consumo de SINGLE. | `StudentExitPermissionRepository` |
| `DeduplicationService` | `services` | `boolean isDuplicate(userId, pointId, action, now)` conforme janela configurável. | `AccessLogRepository` |
| `AccessDecisionService` | `services` | **Orquestrador.** Aplica 4.3→4.6 e devolve `AccessDecision`. Única classe que conhece a ordem das regras. | todos acima + `DoorMappingService`, `UserRepository`, `ClassScheduleRepository` |
| `PolicyProperties` | `config` | `@ConfigurationProperties(prefix="magbo.policy")` + dedup. Tipado, com defaults. | — |

**`AccessDecision` (record):** `AuthorizationResult result`, `DenialReason reason`, `String flag`, `AuthMethod method`, `AuthResult authResult`, `String pointId`, `AccessAction action`, `boolean fallback`, `String userId`, `Long consumedPermissionId`.

**Regra de ouro da refatoração:** `validateEntryWindow`, `validateExitTime`, `getLunchTimeForDay`, `parseHour` são **movidos sem alteração de lógica** (`LYCEE_CLASSES`, `LYCEE_START/END`, `MAX_CANTINA_TIME`, `LUNCH_WINDOW` idênticos). Qualquer mudança de comportamento aqui é **bug**.

**Transacionalidade:** `@Transactional` em `AccessDecisionService.process(...)` — access_log + consumo de SINGLE + attempt de OBSERVATION devem ser atômicos.

---

## 6. REPOSITORIES

### 6.1 `AccessAttemptRepository extends JpaRepository<AccessAttempt, Long>`
```
Page<AccessAttempt> findFiltered(from, to, pointId, userId, denialReason, authMethod, Pageable)  [@Query]
long countByTimestampGreaterThanEqual(LocalDateTime start)
long countByDenialReasonAndTimestampGreaterThanEqual(DenialReason r, LocalDateTime start)
List<Object[]> countByReasonSince(LocalDateTime start)              // [reason, count]
List<Object[]> countByPointSince(LocalDateTime start)               // [point_id, count]
List<Object[]> countByTurmaSince(LocalDateTime start)               // JOIN app_users, [turma, count]
List<AccessAttempt> findTop200ByPointIdInAndTimestampAfterOrderByTimestampDesc(List<String>, LocalDateTime)
long countDivergenceSince(LocalDateTime start)                      // auth_result=SUCCESS AND authorization_result=DENIED
```
### 6.2 `MealEntitlementRepository extends JpaRepository<MealEntitlement, String>`
```
Optional<MealEntitlement> findByUserId(String userId)   // = findById
List<MealEntitlement> findByStatus(EntitlementStatus status)
Page<MealEntitlement> searchJoinUsers(q, turma, status, Pageable)   // [@Query com JOIN app_users]
long countByStatus(EntitlementStatus status)
```
### 6.3 `MealEntitlementEventRepository extends JpaRepository<MealEntitlementEvent, Long>`
```
List<MealEntitlementEvent> findByUserIdOrderByChangedAtDesc(String userId)
```
### 6.4 `StudentExitPermissionRepository extends JpaRepository<StudentExitPermission, Long>`
```
List<StudentExitPermission> findByUserIdAndStatus(String userId, ExitPermissionStatus status)
List<StudentExitPermission> findByStatusOrderByCreatedAtDesc(ExitPermissionStatus status)
Page<StudentExitPermission> findFiltered(userId, status, type, from, to, Pageable)  [@Query]
```
### 6.5 `AccessLogRepository` — **NÃO ALTERAR NENHUMA QUERY EXISTENTE**
Adicionar **apenas**:
```
List<AccessLog> findByUserIdAndPointIdAndActionAndTimestampAfter(String userId, String pointId, AccessAction action, LocalDateTime after)   // dedup
List<Object[]> countByAuthMethodSince(LocalDateTime start)   // [auth_method, count] — relatório FACE vs CARD
```

---

## 7. ENDPOINTS (contratos)

Todos exigem JWT salvo indicação contrária. Formato de erro: o padrão já usado (`Map.of("error", "...")`).

### 7.1 Tentativas negadas
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/access/attempts` | `@areaSecurity.canRead(area)` derivado do `pointId`, ou ADMIN | Filtros: `from`, `to`, `pointId`, `userId`, `reason`, `method`, `page`, `size` (default 50, máx 200). Ordenado por timestamp DESC. |
| GET | `/api/access/attempts/stats` | ADMIN ou `ATTEMPTS_READ` | `{ total, byReason: {...}, byPoint: {...}, byTurma: {...}, byMethod: {...}, divergence }` para o período. |
| GET | `/api/access/attempts/refectory` | `@areaSecurity.can('cantine')` | Últimas 200 tentativas em REFEI*/CANTINA* (feed do painel). |
| GET | `/api/access/attempts/gate` | `@areaSecurity.can('portail')` | Últimas 200 em PORT* (feed da portaria). |

**DTO `AccessAttemptDto`** (resposta): `id`, `userId`, `employeeNoRaw`, `nome` (de `app_users` ou `nome_snapshot`), `turma`, `pointId`, `action`, `terminalIp`, `authMethod`, `authResult`, `authorizationResult`, `denialReason`, `hikvisionSubEventType`, `timestamp`, `doorMappingFallback`.

### 7.2 Direito à refeição
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/meal-entitlements` | `can('cantine')` (leitura) | Lista paginada + filtros `q` (nome/id), `turma`, `status`. **Inclui alunos sem linha**, retornados como `PENDING` (LEFT JOIN). |
| GET | `/api/admin/meal-entitlements/{userId}` | `can('cantine')` | Detalhe. Sem linha → `{status:"PENDING", ...}` |
| PUT | `/api/admin/meal-entitlements/{userId}` | ADMIN **ou** `MEAL_ENTITLEMENT_WRITE` | Upsert. Body: `{status, validFrom, validUntil, note}`. Grava evento de histórico. |
| POST | `/api/admin/meal-entitlements/bulk` | ADMIN **ou** `MEAL_ENTITLEMENT_WRITE` | §9. |
| GET | `/api/admin/meal-entitlements/{userId}/history` | `can('cantine')` | Histórico ordenado desc. |
| GET | `/api/admin/meal-entitlements/summary` | `can('cantine')` | `{authorized, notAuthorized, pending, totalStudents}` |

### 7.3 Autorização de saída
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/exit-permissions` | `can('portail')` | Filtros `userId`, `status`, `type`, `from`, `to`, paginado. |
| GET | `/api/admin/exit-permissions/active` | `can('portail')` | Todas ACTIVE. |
| GET | `/api/admin/exit-permissions/user/{userId}` | `can('portail')` | Histórico completo do aluno. |
| POST | `/api/admin/exit-permissions` | ADMIN **ou** `EXIT_PERMISSION_WRITE` | Body: `{userId, permissionType, validFrom, validUntil, startTime, endTime, daysOfWeek, reason, note}`. `createdBy` = usuário do JWT (**nunca** do body). Validações §10. |
| POST | `/api/admin/exit-permissions/{id}/revoke` | ADMIN **ou** `EXIT_PERMISSION_WRITE` | Body `{note}`. Seta `status=REVOKED`, `revoked_by`, `revoked_at`. **Não deletar.** |
| DELETE | `/api/admin/exit-permissions/{id}` | — | ❌ **NÃO IMPLEMENTAR.** Revogação é soft, sempre. |

### 7.4 Stats — ALTERAÇÃO COMPATÍVEL
`GET /api/stats/global` (ADMIN) — `GlobalStats` ganha campos, **sem remover nenhum**:
```json
{
  "totalToday": 0,
  "blockedToday": 0,      // DEPRECATED: alias de alertasHoje, mantido p/ compat do frontend
  "alertasHoje": 0,       // NOVO: = countBlockedSince (access_logs com flag != null)
  "negadasHoje": 0,       // NOVO: total de access_attempts hoje
  "divergenciaHoje": 0,   // NOVO: auth_result=SUCCESS AND authorization_result=DENIED
  "authorizedToday": 0,   // INALTERADO: totalToday - alertasHoje
  "activeUsers": 0,
  "totalUsers": 0
}
```
**Não alterar** a semântica de `totalToday`, `activeUsers`, `authorizedToday`.

### 7.5 SecurityConfig
As rotas novas ficam **fora** do `permitAll` (exigem JWT). **Não tocar** nos matchers existentes de `/api/auth/login`, `/api/health`, `/api/hikvision/**`, `/h2-console/**`.

---

## 8. PERMISSÕES

`AreaSecurity` ganha método `hasPermission(String permission)`:
```
1. Não autenticado → false
2. ROLE_ADMIN → true (bypass, sem hit no banco)
3. Busca SystemUser; permissoes CSV contém "*" ou a permissão exata → true
4. senão → false
```
Uso: `@PreAuthorize("@areaSecurity.hasPermission('MEAL_ENTITLEMENT_WRITE')")`.

**Compatibilidade obrigatória:** `permissoes = null` não pode remover nenhum acesso atual. Leitura continua governada por `setoresPermitidos` via `can(area)`. Só **escrita** de entitlements/permissões exige a permissão granular.

`SystemUser` ganha `permissoes` + helper `hasPermission(String)` (mesmo padrão de `canOperateSector`: CSV, trim, case-insensitive, `*` = tudo).
CRUD de `/api/system-users` passa a aceitar/retornar `permissoes`.

---

## 9. IMPORTAÇÃO EM LOTE

### 9.1 `POST /api/admin/meal-entitlements/bulk`
Body: `[{userId, status, validFrom, validUntil, note}]`. **Molde obrigatório:** seguir o padrão de `POST /api/users/bulk` (erro por linha, sem exceção global).

**Regras:**
1. `userId` deve existir em `app_users` → senão erro na linha (`Aluno não encontrado`).
2. `status` ∈ {AUTHORIZED, NOT_AUTHORIZED, PENDING} → senão erro.
3. `validFrom > validUntil` → erro.
4. **Nunca sobrescrever silenciosamente:** se já existe linha e o body **não** traz `overwrite=true` (query param), a linha é **ignorada** e contabilizada em `ignorados` com motivo `Já existe — use overwrite=true`.
5. Toda alteração efetiva grava `meal_entitlement_events` com `source=BULK`.
6. Transação **por linha** (uma falha não derruba o lote).

**Resposta (obrigatória, todos os campos):**
```json
{
  "totalRecebido": 0, "totalCriado": 0, "totalAtualizado": 0,
  "totalIgnorado": 0, "totalFalhas": 0,
  "erros": [ { "linha": 1, "userId": "0001764", "erro": "Aluno não encontrado" } ]
}
```

### 9.2 Cartões — DECISÃO ARQUITETURAL: **NÃO IMPORTAR**
**Validado com hardware (14/07):** o terminal traduz cartão→`employeeNoString` internamente. O `cardNo` **nunca** chega ao backend. Portanto:
- ❌ **NÃO** criar coluna de cartão em `app_users`.
- ❌ **NÃO** criar tabela de credenciais.
- ❌ **NÃO** adicionar cartão ao importador.
- ✅ O vínculo cartão↔pessoa vive **no terminal/HikCentral**. Para os 923 alunos, isso é distribuído pelo HikCentral (procedimento operacional §11.3), não pelo MAGBO.

### 9.3 Frontend — importação
Reusar `libs/xlsx.min.js` (já local). Colunas da planilha de entitlements: `id | status | valid_from | valid_until | note`. Preview antes de enviar + exibição do relatório de resultado. **Não** auto-corrigir dados.

---

## 10. VALIDAÇÕES

### 10.1 Entrada de API (Bean Validation, `jakarta.validation`)
- `MealEntitlementRequest`: `status` `@NotNull`; `note` `@Size(max=255)`; `validFrom`/`validUntil` opcionais; **regra composta:** `validFrom <= validUntil`.
- `ExitPermissionRequest`: `userId` `@NotBlank` + deve existir; `permissionType` `@NotNull`; `reason` `@NotBlank @Size(max=255)`; **regras compostas por tipo:**
  - `DATE_RANGE` → `validFrom` e `validUntil` obrigatórios, `validFrom <= validUntil`
  - `RECURRING` → `daysOfWeek` obrigatório, formato CSV de 1..7 sem repetição
  - `startTime`/`endTime` → se um presente, ambos obrigatórios, `startTime < endTime`
  - `PERMANENT`/`SINGLE` → datas/dias/horas opcionais
- `AccessAttemptQuery`: `size` máx 200; `from <= to`.

### 10.2 Invariantes de domínio (violação = bug crítico)
1. `access_attempts` **nunca** afeta `access_logs`.
2. `access_logs` **nunca** recebe evento com `auth_result=DENIED`.
3. `denial_reason` **nunca** é null em `access_attempts`.
4. `employee_no_raw` **nunca** é null (mesmo com `user_id` null).
5. `timestamp` sempre do servidor (`LocalDateTime.now()`), nunca do payload (o aparelho está em GMT+8 de fábrica).
6. Zeros à esquerda **nunca** truncados (tudo String).
7. `SINGLE` só vira `USED` em saída efetiva.
8. Toda alteração de entitlement gera evento de histórico na mesma transação.
9. Webhook responde **200** em todos os caminhos de negócio (só 401/503/500 nos casos previstos).

---

## 11. FRONTEND

**Restrição estrutural:** sem bundler. Componentes = arquivos `.js` planos com Babel standalone, **carregados via `<script src>` no `index.html`** (a ordem importa: dependências antes dos consumidores). Seguir o padrão dos componentes existentes (`React.createElement` ou JSX conforme o arquivo vizinho). Usar `userCache` para pessoas — **não** criar lista local. Ícones: `lucide`. Paleta navy/gold.

### 11.1 Componentes NOVOS
| Arquivo | Descrição |
|---|---|
| `js/components/MealEntitlementManagement.js` | **Gestão da cantina.** Busca aluno (via `userCache`), filtro por turma e status, tabela com status atual, edição inline (AUTHORIZED/NOT_AUTHORIZED/PENDING + validade + nota), botão de histórico (modal), importação xlsx, exportação. Estados vazio/carregando/erro. Se o operador não tem `MEAL_ENTITLEMENT_WRITE` → campos **read-only** (não esconder, desabilitar). |
| `js/components/ExitPermissionManagement.js` | **Gestão de saídas.** Formulário (tipo, validade, dias, horários, motivo obrigatório), lista de ativas, revogar (com nota), histórico por aluno, exibe **quem autorizou** e **quem revogou**. |
| `js/components/DeniedAttemptsFeed.js` | **Reutilizável.** Props: `endpoint`, `pollingMs`, `title`. Colunas: aluno, turma, horário, método (badge FACE/CARD), ponto, motivo (badge colorido por `denialReason`). Usado na cantina e na portaria. |
| `js/components/MealEntitlementHistoryModal.js` | Timeline de mudanças: quando, quem, de→para, nota, origem (UI/BULK/API). |

### 11.2 Componentes ALTERADOS
| Arquivo | Alteração |
|---|---|
| `js/components/CantineMonitor.js` | Adicionar `DeniedAttemptsFeed` (endpoint `/api/access/attempts/refectory`, polling 3s — mesmo intervalo atual). **Não alterar** a lógica existente de logs. |
| `js/components/AdminDashboard.js` | Trocar leitura de `blockedToday` → `alertasHoje`; adicionar cards `negadasHoje` e `divergenciaHoje`. Rótulo em francês coerente com a UI atual. |
| `js/components/GeneralReport.js` | Nova seção "Tentativas negadas" (por motivo/turma/ponto) + coluna/breakdown de método (FACE vs CARD). ⚠️ Arquivo tem 1.172 linhas (dívida D3) — **adicionar seção, não refatorar**. |
| `js/data/constants.js` | Adicionar labels/traduções de `DenialReason`, `AuthMethod`, `EntitlementStatus`. **Manter espelhado** com o backend (I3). |
| `index.html` | Adicionar os `<script src>` dos componentes novos na ordem correta. |
| `js/utils/api.js` | Adicionar chamadas dos endpoints novos + normalizers camelCase→snake_case seguindo o padrão existente. **Não** criar terceira camada HTTP (D1). |

### 11.3 Navegação
Adicionar as duas telas de gestão ao menu administrativo existente, visíveis conforme setor/permissão (mesma lógica de visibilidade já usada). **Não** redesenhar navegação.

---

## 12. ORDEM DE EXECUÇÃO (Fases A→K)

> Executar em sequência. Não pular. Ao fim de cada fase, o projeto deve **compilar** e o webhook continuar funcionando.

### FASE A — Fundação de domínio (sem alterar comportamento)
**Escopo:** enums (`AuthResult`, `AuthorizationResult`, `DenialReason`, `EntitlementStatus`, `ExitPermissionType`, `ExitPermissionStatus`, `PolicyMode`); entidades `AccessAttempt`, `MealEntitlement`, `MealEntitlementEvent`, `StudentExitPermission`; coluna `permissoes` em `SystemUser` + helper; repositories §6; `PolicyProperties`; properties §4.1.
**Conclusão:** compila; `ddl-auto=update` cria as tabelas no restart; webhook **inalterado**; `\d access_attempts` mostra a tabela.
**Rollback:** reverter commit; tabelas ficam inertes.

### FASE B — Classificação e roteamento no webhook ★ CRÍTICA
**Escopo:** `HikvisionEventClassifier`; `AccessAttemptService`; `DeduplicationService`; `AccessDecisionService` (orquestrador, movendo `validateEntryWindow`/`validateExitTime`/`getLunchTimeForDay`/`parseHour` **sem alterar lógica**); webhook passa a delegar; roteamento do fluxo §4.3 **sem** entitlement/exit (ainda não existem regras) — apenas: sub 8 → attempt `DEVICE_DENIED`; usuário inexistente → attempt `UNKNOWN_USER`; usuário inativo → política; subtipo desconhecido → attempt; dedup conforme política; `missing-door-mapping` conforme política.
**Conclusão:** face(75) e cartão(1) geram `access_logs` **exatamente como antes** (mesmo `point_id`, `action`, `flag`, `auth_method`, `fallback`); sub 8 **não** gera log e gera 1 attempt; ID desconhecido gera attempt com `user_id=null` e `employee_no_raw` preservado.
**Rollback:** reverter commit → volta ao comportamento atual.

### FASE C — Direito à refeição
**Escopo:** `MealEntitlementService` (evaluate + CRUD + histórico transacional); integração na regra da cantina (§4.4, ordem obrigatória); endpoints §7.2 (exceto bulk).
**Conclusão:** aluno `NOT_AUTHORIZED` → attempt `MEAL_NOT_ENTITLED`, **sem** access_log, refeição **não** conta; `AUTHORIZED` → fluxo normal; sem linha → `PENDING` conforme política.
**Rollback:** `magbo.policy.meal-not-entitled=OBSERVATION` desliga o efeito sem reverter código.

### FASE D — Autorização de saída
**Escopo:** `ExitPermissionService` (evaluate + CRUD + revoke + consumo de SINGLE); integração em PORT*+SAIDA (§4.5); endpoints §7.3.
**Conclusão:** sem permissão → attempt `EXIT_NOT_AUTHORIZED`, **sem** access_log, presença inalterada; com permissão válida → saída normal; `SINGLE` vira `USED`.
**Rollback:** `magbo.policy.exit-not-authorized=OBSERVATION`.

### FASE E — Endpoints de tentativas + KPIs
**Escopo:** §7.1 completo; `GlobalStats` §7.4 (com alias depreciado); queries de agregação.
**Conclusão:** `/api/access/attempts` responde paginado e filtrado; `/api/stats/global` traz campos novos **e** `blockedToday` intacto.

### FASE F — Permissões granulares
**Escopo:** `AreaSecurity.hasPermission`; `@PreAuthorize` nas rotas de escrita; CRUD de system-users aceita `permissoes`.
**Conclusão:** operador sem permissão recebe 403 na escrita; nenhum acesso atual perdido.

### FASE G — Importação em lote
**Escopo:** §9.1 + tela de import no componente de gestão.
**Conclusão:** relatório com os 5 contadores + erros por linha; sem sobrescrita silenciosa.

### FASE H — Frontend
**Escopo:** §11 completo.
**Conclusão:** telas funcionam contra a API real; dashboards atuais **sem regressão**.

### FASE I — Testes automatizados ★ OBRIGATÓRIA
**Escopo:** §13. **Não é opcional** — é o que substitui a validação incremental abandonada nesta estratégia.
**Conclusão:** `mvn test` verde; cobertura dos casos da §13.2/13.3.

### FASE J — SQL de migração
**Escopo:** §14. Arquivos em `deploy/migrations/`.
**Conclusão:** SQLs revisados, idempotentes, testados num banco limpo.

### FASE K — Documentação
**Escopo:** §15.
**Conclusão:** docs refletem o código; nenhum segredo commitado.


---

## 13. TESTES

**Contexto crítico:** o projeto tem **zero testes automatizados** hoje (dívida D2 / risco R7). Como esta estratégia concentra a validação no fim, os testes automatizados **deixam de ser desejáveis e passam a ser obrigatórios** — são a única rede de proteção contra regressão num ciclo grande.

### 13.1 Infraestrutura
- Conferir/adicionar `spring-boot-starter-test` no `pom.xml` (JUnit 5, Mockito, AssertJ, MockMvc).
- Criar `src/test/resources/application-test.properties`: H2 em memória, `ddl-auto=create-drop`, `spring.sql.init.mode=never` (⚠️ **não** carregar o `data.sql`, que é seed de QA), token de webhook fixo de teste, políticas explícitas.
- Perfil `test`. **Nunca** apontar teste para o PostgreSQL de desenvolvimento.

### 13.2 Testes unitários (obrigatórios)
| Classe de teste | Casos mínimos |
|---|---|
| `HikvisionEventClassifierTest` | 75→(FACE,SUCCESS,true) · 1→(CARD,SUCCESS,true) · 8→(UNKNOWN,DENIED,false) · 21→(UNKNOWN,UNKNOWN,false) · null→(UNKNOWN,UNKNOWN,false) · valor arbitrário (999)→(UNKNOWN,UNKNOWN,false) |
| `MealEntitlementServiceTest` | sem linha→PENDING · AUTHORIZED vigente→ok · AUTHORIZED com `validUntil` no passado→MEAL_NOT_ENTITLED · AUTHORIZED com `validFrom` no futuro→MEAL_NOT_ENTITLED · NOT_AUTHORIZED→MEAL_NOT_ENTITLED · alteração gera evento de histórico · `days_of_week`/`meal_type` preenchidos são **ignorados** nesta fase |
| `ExitPermissionServiceTest` | PERMANENT ACTIVE→válida · REVOKED→inválida · DATE_RANGE dentro/fora→válida/OUTSIDE_EXIT_WINDOW · RECURRING dia certo/errado · janela horária dentro/fora/limites exatos · SINGLE não usada→válida; USED→inválida · sem permissão→EXIT_NOT_AUTHORIZED · **distinção** EXIT_NOT_AUTHORIZED × OUTSIDE_EXIT_WINDOW |
| `DeduplicationServiceTest` | dentro da janela→duplicata · fora→não · janela=0/disabled→nunca duplicata · pontos diferentes→não duplicata · ações diferentes→não duplicata |
| `AccessDecisionServiceTest` | **ordem das regras**: NOT_AUTHORIZED + fora de horário → vence `MEAL_NOT_ENTITLED` (dedup→entitlement→horário) · políticas OBSERVATION vs DENY produzem decisões diferentes com a mesma entrada · SAIDA na cantina não avalia entitlement · BIBLIO/ENFERM→NOT_APPLICABLE |
| `EntryWindowRegressionTest` | **Blindagem da lógica movida:** turma Lycée dentro/fora de 11h–15h · turma com `class_schedule` 'N'→FORA_HORARIO · turma sem schedule→null · `parseHour("11H00")`→11:00 · hora inválida→null · janela = hora+1h (limites exatos) |
| `ExitTimeRegressionTest` | sem entrada anterior→null · <1h→null · >1h→EXCEDEU_TEMPO · exatamente 1h→null (limite) |

### 13.3 Testes de integração (`@SpringBootTest` + `MockMvc`, perfil `test`)
| Teste | Cenário | Asserção |
|---|---|---|
| `WebhookFaceIT` | POST multipart com **payload real** de face (sub 75) | 200 · 1 `access_log` `auth_method=FACE`, `sub=75` · **0** attempts |
| `WebhookCardIT` | POST multipart com payload real de cartão (sub 1) | 200 · 1 `access_log` `auth_method=CARD`, `sub=1` · 0 attempts |
| `WebhookDeniedIT` ★ | POST com sub **8** (payload real do CANT-09) | 200 · **0 `access_logs`** · 1 attempt `DEVICE_DENIED`, `auth_result=DENIED` |
| `WebhookUnknownUserIT` | employeeNoString inexistente | 200 · 0 logs · 1 attempt `UNKNOWN_USER`, `user_id=null`, `employee_no_raw` preservado |
| `WebhookInactiveUserIT` | usuário `ativo=false` | política DENY → 0 logs + attempt `USER_INACTIVE` |
| `WebhookHeartbeatIT` | payload de heartbeat / sub 21 / sub 22 | 200 · 0 logs · **0 attempts** (sem employeeNoString = ignorado) |
| `WebhookJsonCameraIT` | `EventNotificationAlert` JSON puro com `ipAddress` | Ramo JSON do `parsePayload` funciona (**nunca testado com hardware — R: câmeras da portaria isoladas por VLAN**) |
| `WebhookTokenIT` | sem token · token errado · token por header · token por `?token=` | 401 · 401 · 200 · 200 |
| `WebhookMultipartPictureIT` | multipart com part `Picture` (jpeg) + `AccessControllerEvent` | Ignora a imagem, processa o JSON |
| `MealEntitlementFlowIT` | NOT_AUTHORIZED → evento de face na cantina | 0 logs · 1 attempt `MEAL_NOT_ENTITLED` · `/refectory/meals` **não** conta refeição |
| `ExitPermissionFlowIT` | sem permissão → face no PORT1/SAIDA | 0 logs · 1 attempt `EXIT_NOT_AUTHORIZED` · `countPresentToday` **inalterado** |
| `ExitSinglePermissionIT` | SINGLE válida → saída → nova tentativa | 1º: log + `status=USED` · 2º: attempt `EXIT_NOT_AUTHORIZED` |
| `ZeroPaddingIT` | employeeNoString `0001764` | `user_id` gravado = `0001764` (**nunca** `1764`) em log e attempt |
| `StatsCompatIT` | `/api/stats/global` | `blockedToday` presente e == `alertasHoje`; `negadasHoje` correto |
| `PermissionsIT` | operador sem `MEAL_ENTITLEMENT_WRITE` faz PUT | 403 · leitura continua 200 |
| `BulkEntitlementIT` | lote com linha válida, inexistente, duplicada, status inválido | contadores corretos · erros por linha · sem sobrescrita sem `overwrite=true` |
| `LegacyRegressionIT` ★ | Suite de blindagem: cria logs históricos (com `auth_method=null`) e roda **todas** as queries de `AccessLogRepository` | Nenhuma exceção; resultados idênticos ao esperado (registros antigos continuam válidos) |

### 13.4 Payloads reais para os testes (usar EXATAMENTE estes formatos)
Salvar em `src/test/resources/payloads/`. Estrutura confirmada com hardware:
```
multipart/form-data; boundary=MIME_boundary
  part "AccessControllerEvent" (application/json):
    {"ipAddress":"172.20.40.12","portNo":80,"protocol":"HTTP","macAddress":"a4:d5:c2:2f:ea:d2",
     "channelID":1,"dateTime":"2026-07-14T11:33:19+08:00","activePostCount":1,
     "eventType":"AccessControllerEvent","eventState":"active","eventDescription":"Access Controller Event",
     "AccessControllerEvent":{"deviceName":"Access Controller","majorEventType":5,"subEventType":75,
       "cardReaderKind":1,"cardReaderNo":1,"verifyNo":0,"employeeNoString":"9999999","name":"Teste Piloto",
       "userType":"normal","currentVerifyMode":"cardOrFaceOrFp","attendanceStatus":"undefined",
       "label":"","statusValue":0,"mask":"no","purePwdVerifyEnable":true,"FaceRect":{...},"serialNo":123}}
  part "Picture" (image/jpeg): <bytes>
```
Variações necessárias: `subEventType` 75 / 1 / 8 / 21; `employeeNoString` `9999999` / `0001764` / `8888888` (inexistente); JSON puro `EventNotificationAlert` para o ramo câmera.
⚠️ **Fuso do payload é GMT+8** (fábrica). O backend **ignora** `dateTime` e usa a hora do servidor — os testes devem asseverar isso.

### 13.5 Bateria de validação com hardware (executada pelo Sam APÓS o `mvn test` verde)
Roteiro em `docs/testing/plano-validacao-estrutural.md`. Pré: Bloco A do plano de 13/07 (IPs, containers, backend, backup).

| # | Teste | Esperado |
|---|---|---|
| V01 | Face 9999999 (entitlement AUTHORIZED) | `access_log` REFEI1/ENTRADA/FACE/75/`fallback=false` · 0 attempts |
| V02 | Cartão 9999999 | `access_log` CARD/1 |
| V03 | Cartão Luis `0001764` | zeros preservados |
| V04 | 9999999 → `NOT_AUTHORIZED` → face | **0 logs** · attempt `MEAL_NOT_ENTITLED` · painel mostra aluno/turma/hora/método/ponto/motivo |
| V05 | Validade expirada no terminal → face | terminal nega · attempt `DEVICE_DENIED` · **0 logs** ★ (era a refeição falsa) |
| V06 | 2 faces em 10s | 1 log + 1 attempt `DUPLICATE_MEAL` (política OBSERVATION) |
| V07 | Turma com dia 'N' → face | log **com** `flag=FORA_HORARIO` + attempt OBSERVATION `OUTSIDE_MEAL_TIME` |
| V08 | Cartão de ID inexistente | attempt `UNKNOWN_USER` (`user_id` null, `employee_no_raw` preenchido) |
| V09 | `ativo=false` → face | attempt `USER_INACTIVE` · 0 logs |
| V10 | Mapping → PORT1/SAIDA, sem permissão → face | attempt `EXIT_NOT_AUTHORIZED` · presença **inalterada** |
| V11 | Criar permissão SINGLE → face | log SAIDA · permissão `USED` · 2ª tentativa → attempt |
| V12 | `/api/stats/global` | `blockedToday`==`alertasHoje`; `negadasHoje`>0; `divergenciaHoje`>0 (após V05) |
| V13 | Dashboards e relatórios existentes | **sem regressão** visual/numérica |
| V14 | Contagem de refeições após V04/V05/V06 | negadas **não** contam |

---

## 14. SQL E ESTRATÉGIA DE MIGRAÇÃO

### 14.1 Decisão (arquiteto)
**Não adotar Flyway neste ciclo.** Entregar **SQL versionado manual** em `deploy/migrations/`, idempotente e numerado. Motivo: adotar Flyway exige baseline de um schema nascido do Hibernate com ~440k registros — é um projeto próprio e não deve ser misturado com mudança funcional. **Fase futura:** `V000__baseline.sql` + `flyway.baselineOnMigrate=true`. Os arquivos entregues aqui já nascem no formato `V{n}__{nome}.sql` para conversão trivial.

- **PC (dev):** continua `ddl-auto=update` — Hibernate cria tudo no restart. Os SQLs **não** são executados aqui.
- **VM (prod):** aplicar os SQLs **na ordem**, manualmente, **antes** de subir a nova versão do backend. Manter `ddl-auto=update` como rede de segurança (é idempotente e só adiciona).

### 14.2 Arquivos (todos idempotentes: `IF NOT EXISTS` / `DO $$`)
```
deploy/migrations/
  V001__access_attempts.sql
  V002__meal_entitlements.sql
  V003__meal_entitlement_events.sql
  V004__student_exit_permissions.sql
  V005__system_users_permissoes.sql
  V006__indexes.sql
  README.md          (ordem, como aplicar, como reverter)
  rollback/
    R001__drop_access_attempts.sql   ... etc (DROP TABLE IF EXISTS — só p/ emergência)
```

### 14.3 `V001__access_attempts.sql` (modelo normativo — seguir este padrão nos demais)
```sql
-- MAGBO Access Control — V001: tentativas de acesso negadas
-- Idempotente. Aplicar ANTES de subir o backend com a Fase B.
CREATE TABLE IF NOT EXISTS access_attempts (
    id                       BIGSERIAL PRIMARY KEY,
    user_id                  VARCHAR(255),
    employee_no_raw          VARCHAR(64)  NOT NULL,
    nome_snapshot            VARCHAR(255),
    point_id                 VARCHAR(255),
    action                   VARCHAR(16),
    terminal_ip              VARCHAR(45),
    auth_method              VARCHAR(8),
    auth_result              VARCHAR(8)   NOT NULL,
    authorization_result     VARCHAR(16)  NOT NULL,
    denial_reason            VARCHAR(32)  NOT NULL,
    hikvision_sub_event_type INTEGER,
    timestamp                TIMESTAMP    NOT NULL,
    door_mapping_fallback    BOOLEAN
);
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_action_check
    CHECK (action IS NULL OR action IN ('ENTRADA','SAIDA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_auth_method_check
    CHECK (auth_method IS NULL OR auth_method IN ('FACE','CARD','UNKNOWN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_auth_result_check
    CHECK (auth_result IN ('SUCCESS','DENIED','UNKNOWN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_authorization_result_check
    CHECK (authorization_result IN ('AUTHORIZED','DENIED','OBSERVATION','NOT_APPLICABLE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE access_attempts ADD CONSTRAINT access_attempts_denial_reason_check
    CHECK (denial_reason IN ('MEAL_NOT_ENTITLED','OUTSIDE_MEAL_TIME','DUPLICATE_MEAL',
      'EXIT_NOT_AUTHORIZED','OUTSIDE_EXIT_WINDOW','USER_INACTIVE','UNKNOWN_USER',
      'MISSING_DOOR_MAPPING','DEVICE_DENIED','NORMAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
⚠️ **Os CHECKs devem listar exatamente os mesmos valores dos enums Java.** Divergência = erro em runtime. Ao adicionar valor a um enum, atualizar o CHECK na mesma entrega.

### 14.4 Estratégia de migração para a VM
1. Backup **antes** de qualquer coisa (`pg_dump -F c`) — ver skill `backup-restauracao`.
2. Aplicar V001..V006 na ordem, conferindo `\d` de cada tabela.
3. Subir o backend novo. Conferir startup sem erro de schema.
4. Smoke: health · 1 evento de face real · `/api/stats/global` · dashboards.
5. Se falhar → rollback (14.5).

### 14.5 Rollback
| Nível | Ação | Perda de dados? |
|---|---|---|
| **Comportamento** (preferencial) | `magbo.policy.*=OBSERVATION` + `magbo.dedup.enabled=false` → sistema volta a registrar tudo como antes, só que com auditoria extra | Nenhuma |
| **Código** | `git revert` do(s) commit(s) da fase; tabelas novas ficam inertes (ninguém lê/escreve) | Nenhuma |
| **Schema** (emergência, raro) | `deploy/migrations/rollback/R00n__*.sql` (DROP TABLE IF EXISTS) | Só das tabelas novas |
| **Dados** | `pg_restore` do backup pré-migração | Volta ao ponto do backup |
⚠️ **Nunca** reverter `access_logs` (colunas do F1 já em produção e validadas).

---

## 15. DOCUMENTAÇÃO (entrega obrigatória)

| Arquivo | Ação |
|---|---|
| `CLAUDE.md` | §Estado atual: novas tabelas, políticas, fato do bloqueio físico. §Gotchas: manter |
| `.claude/rules/backend.md` | Taxonomia (4 eixos), regra "access_logs = efetivo / attempts = negado", ordem das regras da cantina, serviços novos |
| `.claude/rules/database.md` | Tabelas novas, CHECK constraints espelhando enums, política de SQL versionado |
| `.claude/rules/hikvision.md` | Já contém a tabela de subtipos — acrescentar: cartão traduzido pelo terminal, `cardNo` inexistente, whitelist {75,1} |
| `.claude/rules/frontend.md` | Componentes novos, labels espelhados, DeniedAttemptsFeed reutilizável |
| `docs/architecture/visao-geral.md` | Camada de decisão (AccessDecisionService) |
| `docs/architecture/fluxos.md` | Fluxos §4.3/4.4/4.5 |
| `docs/architecture/endpoints.md` | Todos os endpoints novos |
| `docs/architecture/banco-de-dados.md` | Todas as tabelas novas |
| `docs/architecture/decisoes/ADR-001-attempts-vs-logs.md` | **NOVO.** Registrar Opção A × B e por que B |
| `docs/architecture/decisoes/ADR-002-cartao-nao-persistido.md` | **NOVO.** Evidência de hardware: terminal traduz cartão→employeeNo |
| `docs/architecture/decisoes/ADR-003-webhook-pos-evento.md` | **NOVO.** Bloqueio físico só via HikCentral |
| `docs/testing/plano-validacao-estrutural.md` | **NOVO.** Bateria §13.5 |
| `docs/operacional/procedimento-hikcentral.md` | **NOVO.** §16 |
| `deploy/migrations/README.md` | **NOVO.** Ordem e aplicação |

**Regras:** datas ISO · nunca inserir segredos · divergência doc×código resolve a favor do código.

---

## 16. PROCEDIMENTO OPERACIONAL — BLOQUEIO FÍSICO VIA HIKCENTRAL

**Documento a escrever** (`docs/operacional/procedimento-hikcentral.md`), **não é código**. Conteúdo obrigatório — a ser preenchido **com o Fabiano**, pois depende de decisões operacionais da escola:

> ⚠️ **Refinado por ADR-004 (2026-07-16) — para REFEIÇÃO.** A reunião com o Fabiano decidiu que
> **não há bloqueio físico via HikCentral para refeição** (nem no roadmap): a cantina opera em
> **bloqueio operacional assistido** e o HikCentral é **provisionamento puro de pessoas**. Os
> itens 1–8 abaixo (redação original, orientada a "bloqueio físico via HCP") permanecem válidos
> como referência para **saída/portail**, mas para refeição o documento vigente é o
> `procedimento-hikcentral.md` já consolidado (D1–D9). Ver `decisoes/ADR-004-bloqueio-operacional-assistido.md`.

1. **Quem cria os grupos:** definir responsável (Fabiano/SI) e nomenclatura (ex.: `CANTINA-AUTORIZADOS`, `SAIDA-AUTORIZADOS`).
2. **Como alunos autorizados são incluídos:** processo a partir do MAGBO (`GET /api/admin/meal-entitlements?status=AUTHORIZED` → export CSV) → importação no HikCentral → atribuição ao access level dos terminais REFEI*.
3. **Como são removidos:** mesma via, com periodicidade definida.
4. **Como os terminais recebem a atualização:** HikCentral distribui credenciais/níveis; confirmar tempo de propagação e se exige ação manual ("Aplicar/Sincronizar").
5. **Como validar sincronização:** conferir no HCP "pessoas pendentes de envio" (o painel já mostra este número — hoje há **34 pendentes** e **1 porta em anomalia**, ver §17-R3) + teste físico com aluno de teste.
6. **Como funciona offline:** o terminal já autentica localmente com as credenciais distribuídas — **é isso que faz o almoço continuar funcionando se a rede/VM cair**. Documentar como propriedade desejada, não como falha.
7. **Rollback:** reverter o access level; alunos voltam a ser aceitos pelo terminal; MAGBO continua registrando (observacional).
8. **Divergência:** enquanto o bloqueio físico não existir, o MAGBO registra `MEAL_NOT_ENTITLED` e o aluno **entra fisicamente**. Isso é esperado e mensurável por `divergenciaHoje`. **A direção precisa saber disso.**

---

## 17. RISCOS E DECISÕES ABERTAS

| # | Risco | Severidade | Mitigação nesta spec |
|---|---|---|---|
| R1 | **Ciclo grande sem validação incremental** (mudança de estratégia) | **Alta** | Fase I (testes automatizados) é obrigatória e bloqueante; bateria §13.5 com hardware; rollback por política sem reverter código |
| R2 | Refatoração do webhook quebra o caminho validado | **Alta** | `EntryWindowRegressionTest` + `ExitTimeRegressionTest` + `LegacyRegressionIT` + V01–V03 blindam byte a byte |
| R3 | HikCentral: 1 controlador com porta em anomalia + **34 pessoas pendentes de envio** (visto no painel em 08/07) | Média | Fora do escopo de código. **Pauta obrigatória com o Fabiano** antes do piloto |
| R4 | Frontend depende de CDNs (React/Tailwind/Babel/lucide/jspdf) → kiosk offline não renderiza | **Alta (bloqueia piloto)** | Não é escopo deste ciclo. **Vendorizar em `libs/` antes do piloto** (risco R1 do relatório de auditoria) |
| R5 | `?token=` na URL fica em logs de proxy/servidor | Baixa (rede interna) | Aceito: o terminal não suporta header customizado. Documentado |
| R6 | Descompasso de fuso Postgres × Java observado no PC (~1h) | Média | Invariante §10.2-5: timestamp sempre do Java. **Na VM: garantir mesmo fuso nos dois containers** |
| R7 | Payload real das câmeras DeepinView **nunca capturado** (VLAN isola) | Média | `WebhookJsonCameraIT` cobre o ramo JSON por simulação; captura real depende da VM |
| R8 | String com padrão de senha exposta como e-mail de autor no histórico git/`.mailmap` (repo público) | **Alta se for senha real** | **Decisão pendente do Sam**: confirmar e rotacionar |

**Decisões que permanecem com o Sam (não implementar sem resposta):**
1. `magbo.policy.meal-pending` em **produção**: OBSERVATION ou DENY? (recomendação: DENY)
2. I1 — acesso manual (`POST /api/access`) deve aplicar regras de janela/entitlement, ou é isenção consciente do operador? (fora deste ciclo)
3. Remoção do alias `blockedToday` (fase futura)
4. Adoção do Flyway (fase futura)
5. R8 acima

---

## 18. CRITÉRIO DE ACEITE FINAL DA ENTREGA

A entrega só é considerada completa quando **todos** forem verdadeiros:

- [ ] `mvn clean package` compila sem erros; `mvn test` **verde**, cobrindo §13.2 e §13.3
- [ ] Backend sobe com `ddl-auto=update` e cria as 4 tabelas novas + coluna `permissoes`
- [ ] **Caminho validado intacto:** face(75) e cartão(1) geram `access_logs` idênticos ao comportamento atual (`point_id`, `action`, `flag`, `auth_method`, `hikvision_sub_event_type`, `fallback`)
- [ ] **Sub 8 não gera `access_logs`** e gera exatamente 1 `access_attempt` `DEVICE_DENIED` ★
- [ ] ID desconhecido → attempt com `user_id=null` e `employee_no_raw` preservado (com zeros)
- [ ] Tentativa negada **não** aparece em `/refectory/meals`, `countPresentToday`, ocupação, nem em nenhum KPI de acesso
- [ ] `/api/stats/global` mantém `blockedToday` e adiciona `alertasHoje`/`negadasHoje`/`divergenciaHoje`
- [ ] Dashboards e relatórios existentes **sem regressão**
- [ ] Todas as políticas funcionam por properties (OBSERVATION ↔ DENY) **sem recompilar**
- [ ] Operador sem permissão granular recebe 403 na escrita e 200 na leitura; nenhum operador existente perdeu acesso
- [ ] Bulk retorna os 5 contadores + erros por linha; não sobrescreve sem `overwrite=true`
- [ ] Toda alteração de entitlement tem evento de histórico com quem/quando/de→para
- [ ] Permissão de saída registra quem autorizou, motivo, validade, quem revogou e quando; `SINGLE` consome só em saída efetiva
- [ ] SQLs em `deploy/migrations/` aplicam limpo num banco vazio e são idempotentes
- [ ] Documentação e ADRs escritos
- [ ] **Nenhum commit feito sem autorização explícita do Sam**
- [ ] Nenhum registro existente alterado ou apagado
- [ ] Nenhum segredo em código, docs ou testes

---

## 19. RESUMO PARA O EXECUTOR

**Você vai construir a camada de decisão do MAGBO.** Hoje o sistema registra tudo que o terminal manda como se fosse acesso válido — inclusive acessos **negados** (subtipo 8), o que gera refeição falsa. Depois desta entrega:

- `access_logs` = **só o que realmente aconteceu e foi autorizado**
- `access_attempts` = **tudo que foi tentado e negado**, com quem/quando/onde/como/por quê
- Direito à refeição e autorização de saída passam a ser **dados explícitos e auditáveis**
- O que é alerta e o que é negação vira **configuração**, não código
- O MAGBO continua **observacional** — ele não fecha porta; ele registra a verdade e mede a divergência

**As três coisas que não podem quebrar:** (1) face e cartão continuam identificando a mesma pessoa e gerando o mesmo log; (2) zeros à esquerda; (3) nenhuma query existente de `access_logs` muda de resultado.

**Em caso de dúvida ou contradição com o código real: PARE e reporte. Não improvise arquitetura.**
