# PROMPT — FASE B: Classificação de Eventos e Roteamento do Webhook ★ FASE CRÍTICA

## ⚠️ AVISO INICIAL

Esta é **a fase de maior risco de todo o projeto**. Você vai refatorar o `HikvisionWebhookController`, que é o coração do sistema e foi validado com hardware real ao longo de 4 dias de testes. Um erro aqui quebra o único fluxo que comprovadamente funciona.

**A regra desta fase é: o caminho feliz não pode mudar em NADA.** Um evento de face (subEventType 75) ou cartão (subEventType 1) deve continuar gerando um `access_log` **byte a byte idêntico** ao que gera hoje — mesmo `point_id`, mesma `action`, mesma `flag`, mesmo `auth_method`, mesmo `hikvision_sub_event_type`, mesmo comportamento de fallback.

Se você não tiver certeza de que uma mudança preserva o comportamento: **PARE e reporte**.

---

## CONTEXTO DO PROJETO

**MAGBO Access Control** — controle de acesso do Lycée Molière (Rio de Janeiro). Terminais Hikvision (face + cartão RFID) → webhook HTTP → Spring Boot 3.2.5 / Java 17 → PostgreSQL 16 → dashboard Electron/React.

Monorepo: `backend/` = Spring Boot (pacote raiz `com.magbo.access`). Raiz = app Electron. Branch `main`.

**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia as seções 4.2, 4.3, 4.4, 4.5, 4.6, 4.7 e 5 antes de começar.**

### FATOS DE HARDWARE — validados, NÃO questionar
| subEventType | Significado | Traz `employeeNoString`? | O que fazer |
|---|---|---|---|
| **75** | Autenticação **aprovada** por face | Sim | → `access_logs`, `auth_method=FACE` |
| **1** | Autenticação **aprovada** por cartão | Sim | → `access_logs`, `auth_method=CARD` |
| **8** | Autenticação **NEGADA** pelo terminal (validade expirada etc.) | **SIM** ⚠️ | → `access_attempts` (`DEVICE_DENIED`). **NUNCA** `access_logs` |
| 9, 21, 22, major 1/2/3 | Dispositivo / porta / boot | Não | Ignorar, HTTP 200 |
| `heartBeat` | Keep-alive ~30s | Não | Ignorar, HTTP 200 |

- **O bug que esta fase corrige:** hoje o subtipo **8** (acesso NEGADO pelo terminal) traz `employeeNoString` e o webhook grava um `access_log` normal — ou seja, **um aluno barrado na porta aparece no sistema como se tivesse almoçado**. Isso foi comprovado com hardware em 13/07 (teste CANT-09).
- Face e cartão chegam com o **mesmo** `employeeNoString`. `cardNo` **nunca** existe no payload.
- IDs são **String com zeros à esquerda** (`0001764`). Nunca truncar, nunca converter para número.
- `dateTime` do payload vem em **GMT+8** — ignorar, usar hora do servidor.
- O webhook é **pós-evento**. O backend **não** bloqueia porta. `DENY` = decisão lógica + auditoria, nunca ação física.
- O terminal **enfileira e reenvia** eventos se o destino cair — por isso o webhook deve responder **200** em todos os caminhos de negócio (401/503 só para token, 500 só para exceção inesperada).

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit` / `git push`. O Sam revisa e commita.
- ❌ **NUNCA** alterar a lógica de `validateEntryWindow`, `validateExitTime`, `getLunchTimeForDay`, `parseHour` ou das constantes `LYCEE_CLASSES`, `LYCEE_START`, `LYCEE_END`, `MAX_CANTINA_TIME`, `LUNCH_WINDOW`. Elas são **movidas**, não reescritas.
- ❌ **NUNCA** alterar a validação de token, o `parsePayload`, ou o endpoint `/webhook/capture`.
- ❌ **NUNCA** tentativa negada virar acesso válido, refeição ou mudança de localização.
- ❌ **NUNCA** alterar nenhuma query existente de `AccessLogRepository`.
- ✅ Âncora não encontrada ou duplicada, ou contradição com o código real → **PARE e reporte**.

---

## OBJETIVO DA FASE B

1. **Estancar o registro falso:** eventos negados pelo terminal (subtipo 8) deixam de virar `access_log` e passam a ser gravados em `access_attempts`.
2. **Registrar tentativas de IDs desconhecidos:** hoje são silenciosamente descartados; passam a gerar `access_attempts` com `user_id=null` e o ID bruto preservado.
3. **Passar a checar `ativo`:** hoje o webhook **não** verifica se o usuário está ativo (usuário inativo gera log normal). Passa a checar, conforme política.
4. **Deduplicação:** eventos repetidos na janela configurável.
5. **Extrair a lógica de decisão** do controller para serviços testáveis, **sem alterar comportamento**.

**Ainda NÃO nesta fase:** direito à refeição (Fase C) e autorização de saída (Fase D). Os pontos de extensão devem existir, mas as regras entram depois.

---

## DEPENDÊNCIAS
**Fase A concluída e revisada.** Requer: enums (`AuthResult`, `AuthorizationResult`, `DenialReason`, `PolicyMode`), entidade `AccessAttempt`, `AccessAttemptRepository`, `PolicyProperties` e as properties configuradas.

---

## ARQUIVOS

### Novos (6)
```
backend/src/main/java/com/magbo/access/services/HikvisionEventClassifier.java
backend/src/main/java/com/magbo/access/services/AccessAttemptService.java
backend/src/main/java/com/magbo/access/services/DeduplicationService.java
backend/src/main/java/com/magbo/access/services/AccessDecisionService.java
backend/src/main/java/com/magbo/access/dto/EventClassification.java      (record)
backend/src/main/java/com/magbo/access/dto/AccessDecision.java           (record)
```

### Alterados (2)
```
backend/src/main/java/com/magbo/access/controllers/HikvisionWebhookController.java   (delega para os serviços)
backend/src/main/java/com/magbo/access/repositories/AccessLogRepository.java         (+1 método derivado, para dedup)
```

### Existentes que você DEVE LER INTEGRALMENTE antes de tocar em qualquer coisa
```
backend/src/main/java/com/magbo/access/controllers/HikvisionWebhookController.java  ← LEIA O ARQUIVO INTEIRO (367 linhas)
backend/src/main/java/com/magbo/access/services/DoorMappingService.java             ← entender ResolvedMapping
backend/src/main/java/com/magbo/access/dto/hikvision/HikvisionEventDto.java         ← campos disponíveis
backend/src/main/java/com/magbo/access/models/AccessLog.java
backend/src/main/java/com/magbo/access/models/AccessAttempt.java                    ← criada na Fase A
backend/src/main/java/com/magbo/access/config/PolicyProperties.java                 ← criada na Fase A
backend/src/main/java/com/magbo/access/repositories/AccessLogRepository.java
```

---

## ORDEM CORRETA DE IMPLEMENTAÇÃO

> **Implemente exatamente nesta ordem.** Cada passo deixa o projeto compilando.

### Passo 1 — `EventClassification` (record, pacote `dto`)
```java
public record EventClassification(
    AuthMethod method,        // FACE | CARD | UNKNOWN
    AuthResult result,        // SUCCESS | DENIED | UNKNOWN
    boolean isAccessCandidate // true SOMENTE para 75 e 1
) {}
```

### Passo 2 — `HikvisionEventClassifier` (service **puro**, sem banco, sem dependências)
`@Service`. Método único:
```java
public EventClassification classify(Integer subEventType)
```
Tabela normativa (implementar com `switch`, exatamente assim):

| subEventType | method | result | isAccessCandidate |
|---|---|---|---|
| `75` | `FACE` | `SUCCESS` | **true** |
| `1` | `CARD` | `SUCCESS` | **true** |
| `8` | `UNKNOWN` | `DENIED` | false |
| `null` | `UNKNOWN` | `UNKNOWN` | false |
| qualquer outro | `UNKNOWN` | `UNKNOWN` | false |

Javadoc obrigatório citando: "Tabela confirmada com hardware DS-K1T344MX-E1 fw V4.13.0 em 13-14/07/2026. Cartão e face compartilham a semântica de aprovação mas têm subtipos distintos (1 e 75). O subtipo 8 é NEGAÇÃO do terminal e traz identidade — nunca pode virar access_log."

⚠️ **Whitelist rígida:** apenas `isAccessCandidate == true` pode gerar `access_logs`. Não usar lista negra. Subtipo desconhecido no futuro = tentativa, nunca acesso.

### Passo 3 — `AccessAttemptService`
`@Service`, `@RequiredArgsConstructor`, depende de `AccessAttemptRepository`.

Método único e explícito (evita construir a entidade em vários lugares):
```java
public AccessAttempt record(
    String userId,                 // pode ser null (UNKNOWN_USER)
    String employeeNoRaw,          // NUNCA null
    String nomeSnapshot,
    String pointId,
    AccessAction action,
    String terminalIp,
    AuthMethod authMethod,
    AuthResult authResult,
    AuthorizationResult authorizationResult,
    DenialReason denialReason,     // NUNCA null, NUNCA NORMAL
    Integer hikvisionSubEventType,
    Boolean doorMappingFallback
)
```
Regras internas:
- `timestamp` = `LocalDateTime.now()` (**hora do servidor**, nunca a do payload).
- Validar em runtime: `employeeNoRaw != null && !isBlank` e `denialReason != null` → senão `IllegalArgumentException` (é bug de programação, não de dado).
- Logar em nível **INFO**, no mesmo estilo da linha `Access Log:` já existente, para o Sam conseguir acompanhar no console:
```
log.info("Access Attempt: user={}, raw={}, point={}, action={}, method={}, authResult={}, decision={}, reason={}, subType={}",
         userId, employeeNoRaw, pointId, action, authMethod, authResult, authorizationResult, denialReason, hikvisionSubEventType);
```

### Passo 4 — `AccessLogRepository`: +1 método (para dedup)
**Adicionar apenas isto**, sem tocar em mais nada do arquivo:
```java
List<AccessLog> findByUserIdAndPointIdAndActionAndTimestampAfter(
        String userId, String pointId, AccessAction action, LocalDateTime after);
```

### Passo 5 — `DeduplicationService`
`@Service`, depende de `AccessLogRepository` e `PolicyProperties`.
```java
public boolean isDuplicate(String userId, String pointId, AccessAction action, LocalDateTime now)
```
Lógica:
1. Se `!policyProperties.getDedup().isEnabled()` → `false`.
2. Se `windowSeconds <= 0` → `false`.
3. `after = now.minusSeconds(windowSeconds)`.
4. Retorna `!findByUserIdAndPointIdAndActionAndTimestampAfter(userId, pointId, action, after).isEmpty()`.

**Contexto do porquê:** validado em 13/07 — uma única aproximação do rosto gerou **2 eventos subtipo 75 com ~1 segundo de diferença** (o terminal dispara múltiplos frames de reconhecimento). Sem dedup, isso vira 2 registros para 1 pessoa.

### Passo 6 — `AccessDecision` (record, pacote `dto`)
```java
public record AccessDecision(
    AuthorizationResult result,   // AUTHORIZED | DENIED | OBSERVATION | NOT_APPLICABLE
    DenialReason reason,          // null quando AUTHORIZED sem observação
    String flag,                  // FORA_HORARIO | EXCEDEU_TEMPO | null  (compat com access_logs atual)
    AuthMethod method,
    AuthResult authResult,
    String userId,                // null se desconhecido
    String employeeNoRaw,
    String nomeSnapshot,
    String pointId,
    AccessAction action,
    boolean fallback,
    Long consumedPermissionId     // sempre null nesta fase; usado na Fase D
) {}
```

### Passo 7 — `AccessDecisionService` ★ o núcleo
`@Service`, `@RequiredArgsConstructor`, `@Slf4j`. Depende de: `DoorMappingService`, `UserRepository`, `ClassScheduleRepository`, `AccessLogRepository`, `HikvisionEventClassifier`, `DeduplicationService`, `AccessAttemptService`, `PolicyProperties`.

**7.1 — Mover a lógica de regras existente, SEM ALTERAR NADA:**
Copiar do `HikvisionWebhookController` para cá, **idênticos**:
- as constantes `LYCEE_CLASSES`, `LYCEE_START`, `LYCEE_END`, `MAX_CANTINA_TIME`, `LUNCH_WINDOW`
- os métodos `validateEntryWindow(User, LocalDateTime)`, `validateExitTime(String, String, LocalDateTime)`, `getLunchTimeForDay(ClassSchedule, DayOfWeek)`, `parseHour(String)`

⚠️ **Copiar literalmente.** Mesmo se você achar que algo pode ser melhorado, **não mude**. Qualquer alteração de comportamento aqui é bug. Estes métodos foram validados com hardware (testes CANT-04 e CANT-11 em 13/07).

**7.2 — Método público principal:**
```java
@Transactional
public void process(HikvisionEventDto.AccessControllerEvent event, String terminalIp)
```
Fluxo **exato** (seção 4.3 da spec):
```
 1. classification = classifier.classify(event.getSubEventType())
 2. employeeNoRaw = event.getEmployeeNoString()          // já garantido não-nulo pelo controller
    nomeSnapshot  = event.getName()
 3. resolved = doorMappingService.resolve(event.getDoorNo(), event.getReaderNo(), terminalIp)
 4. SE resolved.isFallback() E policy.missing-door-mapping == ATTEMPT:
       attemptService.record(userId=<null ou resolvido, ver nota>, employeeNoRaw, nomeSnapshot,
                             resolved.pointId(), resolved.action(), terminalIp,
                             classification.method(), classification.result(),
                             AuthorizationResult.DENIED, DenialReason.MISSING_DOOR_MAPPING,
                             subType, true)
       RETURN
    (se == FALLBACK → segue normalmente, comportamento legado preservado)
 5. SE classification.result() == DENIED:                          ★ CORRIGE O BUG DO SUBTIPO 8
       userOpt = userRepository.findByHikvisionEmployeeId(employeeNoRaw)   // só para preencher user_id se existir
       attemptService.record(userId=<id se existir, senão null>, employeeNoRaw, nomeSnapshot,
                             resolved.pointId(), resolved.action(), terminalIp,
                             classification.method(), AuthResult.DENIED,
                             AuthorizationResult.DENIED, DenialReason.DEVICE_DENIED,
                             subType, resolved.isFallback())
       RETURN                                                       // NUNCA grava access_log
 6. SE !classification.isAccessCandidate():                         // subtipo desconhecido com identidade
       attemptService.record(..., AuthResult.UNKNOWN,
                             AuthorizationResult.NOT_APPLICABLE, DenialReason.DEVICE_DENIED,
                             subType, resolved.isFallback())
       RETURN
 7. userOpt = userRepository.findByHikvisionEmployeeId(employeeNoRaw)
    SE vazio:
       attemptService.record(userId=null, employeeNoRaw, nomeSnapshot, ...,
                             AuthorizationResult.DENIED, DenialReason.UNKNOWN_USER, ...)
       RETURN
 8. user = userOpt.get()
    SE Boolean.FALSE.equals(user.getAtivo()):                       ★ CHECAGEM NOVA
       SE policy.user-inactive == DENY:
          attemptService.record(..., AuthorizationResult.DENIED, DenialReason.USER_INACTIVE, ...)
          RETURN
       SENÃO (OBSERVATION):
          attemptService.record(..., AuthorizationResult.OBSERVATION, DenialReason.USER_INACTIVE, ...)
          // NÃO retorna — segue o fluxo e gravará o access_log
 9. now = LocalDateTime.now()
    pid = resolved.pointId() em UPPER (null-safe)
    isRefectory = pid.startsWith("REFEI") || pid.startsWith("CANTINA")
    flag = null
10. SE isRefectory:
       SE action == ENTRADA:
          10.1 DEDUPLICAÇÃO:
               SE dedupService.isDuplicate(userId, pid, ENTRADA, now):
                  policy = policy.duplicate-meal
                  SE DENY  → attempt(DUPLICATE_MEAL, DENIED) ; RETURN
                  SE OBSERV→ attempt(DUPLICATE_MEAL, OBSERVATION) ; segue
          10.2 [PONTO DE EXTENSÃO — FASE C: direito à refeição entra AQUI, após dedup e ANTES da janela]
          10.3 JANELA DE HORÁRIO:
               flag = validateEntryWindow(user, now)               // lógica movida, intacta
               SE "FORA_HORARIO".equals(flag):
                  policy = policy.outside-meal-time
                  SE DENY  → attempt(OUTSIDE_MEAL_TIME, DENIED) ; RETURN
                  SE OBSERV→ attempt(OUTSIDE_MEAL_TIME, OBSERVATION) ; segue (mantendo flag no log!)
       SE action == SAIDA:
          flag = validateExitTime(userId, pid, now)                 // lógica movida, intacta
          // NENHUMA regra nova na saída da cantina
11. [PONTO DE EXTENSÃO — FASE D: PORT* + SAIDA entra AQUI]
12. GRAVA access_log:
       AccessLog.builder()
         .userId(userId).pointId(resolved.pointId()).action(resolved.action())
         .timestamp(now).flag(flag)
         .authMethod(classification.method())
         .hikvisionSubEventType(event.getSubEventType())
         .build()
    accessLogRepository.save(...)
    log.info("Access Log: user={}, point={}, action={}, flag={}, method={}, subType={}, fallback={}", ...)
```

⚠️ **Nota sobre o passo 4:** quando `missing-door-mapping=FALLBACK` (o default), o comportamento legado é **integralmente preservado** — o evento cai em `PORT1`+`ENTRADA` com `fallback=true` e gera `access_log` normal, exatamente como hoje. **Este é o default e não pode mudar.**

⚠️ **A linha `log.info("Access Log: ...")` deve permanecer com o MESMO formato de hoje** — o Sam usa esse log para validar no console e ele aparece em toda a documentação de testes.

### Passo 8 — Refatorar `HikvisionWebhookController`
**Ler o arquivo inteiro antes.** O controller passa a ser fino: HTTP + token + parse + extração do evento, delegando a decisão.

**NÃO ALTERAR (mantém-se idêntico):**
- toda a validação de token (`webhookToken`, `trimToken()`, `@PostConstruct`, 503, `?token=`, `MessageDigest.isEqual`, 401)
- `parsePayload(...)` inteiro
- a extração de `event` e `terminalIp` (incluindo o fallback `request.getRemoteAddr()`)
- o guard `if (event == null || employeeNoString == null || isEmpty)` → `log.warn("Payload ignored: no employeeNoString")` + **200 OK**
- o endpoint `/webhook/capture` **inteiro** (não tocar)
- `return ResponseEntity.ok("Success")` e o `catch (Exception e) → 500`

**ALTERAR:**
- Remover os campos `accessLogRepository`, `classScheduleRepository`, `userRepository` **se e somente se** deixarem de ser usados no controller (o `AccessDecisionService` passa a tê-los). Manter `objectMapper` e `doorMappingService` **apenas se ainda usados**.
- Adicionar `private final AccessDecisionService accessDecisionService;`
- Substituir todo o miolo (da busca do usuário até o `accessLogRepository.save(...)`) por:
```java
accessDecisionService.process(event, terminalIp);
return ResponseEntity.ok("Success");
```
- Remover os métodos movidos (`validateEntryWindow`, `validateExitTime`, `getLunchTimeForDay`, `parseHour`) e as constantes movidas (`LYCEE_CLASSES`, `LYCEE_START`, `LYCEE_END`, `MAX_CANTINA_TIME`, `LUNCH_WINDOW`) — agora vivem no service.
- Remover `resolveAuthMethod(...)` do controller **se** ninguém mais o usa lá (a classificação passa a ser do `HikvisionEventClassifier`). ⚠️ Cuidado: garantir que o mapeamento 75→FACE / 1→CARD **continua idêntico** — apenas mudou de casa.
- Remover a variável morta `isMapped` (é sempre `true`).

⚠️ **Importante:** o `HikvisionEventClassifier` substitui o `resolveAuthMethod` do controller. O resultado tem que ser **exatamente o mesmo** (75→FACE, 1→CARD, resto→UNKNOWN). Não é uma mudança de comportamento — é uma mudança de lugar.

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS

1. ★ **Caminho feliz intacto:** face(75) e cartão(1) geram `access_log` idêntico ao atual — mesmo `point_id`, `action`, `flag`, `auth_method`, `hikvision_sub_event_type`, comportamento de fallback.
2. ★ **Subtipo 8 NUNCA gera `access_log`.** Sempre `access_attempt` com `DEVICE_DENIED`.
3. **Eventos sem `employeeNoString` continuam ignorados com 200** e **sem gerar attempt** (heartbeat, 21, 22, 9, boot). Não poluir a tabela de tentativas com ruído de dispositivo.
4. **HTTP 200 em todos os caminhos de negócio.** 503 só para token não configurado; 401 só para token inválido; 500 só para exceção inesperada. (O terminal reenvia em caso de erro — 4xx/5xx geram tempestade de retry.)
5. **Lógica de horário e tempo movida sem alteração.** `validateEntryWindow` e `validateExitTime` são cópias literais.
6. **Nenhuma query existente de `AccessLogRepository` alterada.** Só o método novo de dedup.
7. **`access_logs` não recebe coluna nova.**
8. **Zeros à esquerda:** tudo String, do payload ao banco, em log e em attempt.
9. **Timestamp sempre `LocalDateTime.now()`** — nunca o `dateTime` do payload (que vem em GMT+8).
10. **`@Transactional` no `process(...)`** — access_log e attempts do mesmo evento devem ser atômicos.
11. **Não** implementar regras de entitlement (Fase C) nem de saída (Fase D). Deixar os pontos de extensão marcados com comentário `// FASE C:` / `// FASE D:`.

---

## CRITÉRIOS DE ACEITE

- [ ] `mvn clean compile` verde.
- [ ] Backend sobe e loga `Started MagboAccessApplication` + as políticas ativas.
- [ ] **Face (75)** → 1 `access_log` `REFEI1/ENTRADA/auth_method=FACE/sub=75/fallback=false` · **0 attempts** · log no console idêntico ao formato atual.
- [ ] **Cartão (1)** → 1 `access_log` `auth_method=CARD/sub=1` · 0 attempts.
- [ ] ★ **Subtipo 8** → **0 `access_logs`** · exatamente **1** `access_attempt` `denial_reason=DEVICE_DENIED`, `auth_result=DENIED`, `authorization_result=DENIED`.
- [ ] **ID inexistente** → 0 logs · 1 attempt `UNKNOWN_USER` com `user_id=null` e `employee_no_raw` preservado **com zeros**.
- [ ] **Usuário `ativo=false`** (política DENY) → 0 logs · 1 attempt `USER_INACTIVE`.
- [ ] **Heartbeat / 21 / 22** → 0 logs · **0 attempts** · 200 OK.
- [ ] **2 faces em <90s** → 1 log + 1 attempt `DUPLICATE_MEAL` (política OBSERVATION).
- [ ] **Turma com dia 'N'** → `access_log` **com** `flag=FORA_HORARIO` (salvo!) + 1 attempt `OUTSIDE_MEAL_TIME` OBSERVATION.
- [ ] Token inválido → 401. Sem token → 401. Token não configurado → 503.
- [ ] `/webhook/capture` continua funcionando exatamente como antes.
- [ ] `SELECT COUNT(*) FROM access_logs;` — nenhum registro histórico alterado ou apagado.

---

## VALIDAÇÕES (o Sam vai rodar com hardware real)

```powershell
# Estado antes
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT COUNT(*) FROM access_logs;"

# 1. Face → deve gerar access_log FACE/75, zero attempts
#    (passar o rosto no terminal)
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT id,point_id,action,flag,auth_method,hikvision_sub_event_type FROM access_logs WHERE user_id='9999999' ORDER BY id DESC LIMIT 1;"
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT COUNT(*) FROM access_attempts;"

# 2. Cartão → CARD/1
#    (aproximar o cartão)

# 3. ★ NEGADO: colocar a validade do 9999999 no passado no terminal, passar o rosto
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT id,user_id,employee_no_raw,denial_reason,auth_result,authorization_result,hikvision_sub_event_type FROM access_attempts ORDER BY id DESC LIMIT 3;"
#    → DEVE aparecer DEVICE_DENIED e NÃO deve ter entrado access_log novo

# 4. Desconhecido: cartão de ID inexistente
#    → attempt UNKNOWN_USER com user_id NULL e employee_no_raw preenchido

# 5. Dedup: passar o rosto 2x em 10s
#    → 1 access_log + 1 attempt DUPLICATE_MEAL
```

---

## CHECKLIST DE CONCLUSÃO (preencher e reportar)

- [ ] `HikvisionEventClassifier` criado — tabela 75/1/8/null/outro exata
- [ ] `AccessAttemptService` criado — valida `employeeNoRaw` e `denialReason` não-nulos, loga em INFO
- [ ] `DeduplicationService` criado — respeita `enabled` e `windowSeconds`
- [ ] `AccessDecision` e `EventClassification` (records) criados
- [ ] `AccessDecisionService` criado com o fluxo exato do passo 7.2
- [ ] `validateEntryWindow` / `validateExitTime` / `getLunchTimeForDay` / `parseHour` **movidos sem alteração** (confirmar por diff visual)
- [ ] Constantes `LYCEE_*`, `MAX_CANTINA_TIME`, `LUNCH_WINDOW` movidas com os mesmos valores
- [ ] Pontos de extensão marcados com `// FASE C:` e `// FASE D:`
- [ ] `HikvisionWebhookController` refatorado: token, parsePayload, guard e `/capture` **intactos**
- [ ] Linha `log.info("Access Log: ...")` com formato **idêntico** ao atual
- [ ] `AccessLogRepository`: apenas +1 método derivado
- [ ] Variável morta `isMapped` removida
- [ ] `mvn clean compile` verde
- [ ] **Nenhum commit feito**
- [ ] Reportar: diff resumido do controller (o que saiu, o que ficou)

---

## RISCOS DESTA FASE

| Risco | Severidade | Mitigação |
|---|---|---|
| **Alterar sem querer a lógica de janela ao mover** | **CRÍTICA** | Copiar literalmente; conferir por diff lado a lado; a Fase I adiciona `EntryWindowRegressionTest` como blindagem permanente |
| Mudar o formato do log `Access Log:` | Alta | O Sam valida por esse log; toda a documentação de teste o referencia |
| `missing-door-mapping` default virar ATTEMPT por engano | Alta | Default **FALLBACK**; conferir no log de startup das políticas |
| Attempt sendo gravado para heartbeat/porta (poluição) | Média | O guard `no employeeNoString` retorna **antes** de qualquer classificação |
| `@Transactional` faltando → access_log gravado sem o attempt de OBSERVATION | Média | Anotar `process(...)` |
| Checagem de `ativo` quebrar usuários legítimos | Média | ⚠️ Confirmar o tipo do campo em `User.java` (é `Boolean`, pode ser null) — usar `Boolean.FALSE.equals(user.getAtivo())`, que trata null como ativo |
| Remoção de dependências do controller quebrar compilação | Baixa | Compilar a cada passo |

---

## ROLLBACK

| Nível | Ação | Perda |
|---|---|---|
| **Comportamento** | `magbo.policy.user-inactive=OBSERVATION` + `magbo.dedup.enabled=false` → sistema volta a registrar quase tudo como antes (o subtipo 8 continua indo para attempts — que é o objetivo da fase) | Nenhuma |
| **Código** | `git revert` do commit da fase → volta 100% ao comportamento atual | Nenhuma |
| **Dados** | Nenhum registro existente é tocado. `access_attempts` pode ser truncada sem afetar nada: `TRUNCATE access_attempts;` | Só tentativas de teste |

---

## AO TERMINAR

1. `mvn clean compile` verde.
2. Preencha o checklist.
3. **Reporte o diff do `HikvisionWebhookController`**: exatamente o que foi removido e o que permaneceu — o Sam precisa auditar isso linha a linha.
4. Confirme explicitamente: "a lógica de `validateEntryWindow` e `validateExitTime` foi movida sem nenhuma alteração".
5. Reporte qualquer divergência entre este prompt e o código real.
6. **NÃO faça commit.**
