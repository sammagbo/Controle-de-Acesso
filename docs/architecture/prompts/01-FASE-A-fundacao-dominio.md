# PROMPT — FASE A: Fundação de Domínio

## CONTEXTO DO PROJETO (leia antes de qualquer coisa)

Você está trabalhando no **MAGBO Access Control**, sistema de controle de acesso do Lycée Molière (Rio de Janeiro). Arquitetura: terminais Hikvision (reconhecimento facial + cartão RFID) → webhook HTTP → backend Spring Boot 3.2.5 / Java 17 → PostgreSQL 16 → dashboard Electron/React (sem bundler, Babel standalone).

Estrutura do monorepo: `backend/` = Spring Boot (pacote raiz `com.magbo.access`). Raiz do repo = aplicação Electron. Branch única: `main`, atualmente em `2a66f21`.

**Documento normativo desta implementação:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md`. Leia as **seções 2, 3 e 4.1** antes de começar. Este prompt implementa a **Fase A** (seção 12 da spec).

### FATOS DE HARDWARE — validados com equipamento real, NÃO questionar, NÃO reinterpretar
- Terminal: Hikvision DS-K1T344MX-E1, firmware V4.13.0.
- `subEventType` **75** = autenticação aprovada por **face**. **1** = aprovada por **cartão**. **8** = **NEGADA pelo terminal** (e ainda assim traz `employeeNoString` — origem de registro falso hoje). **21/22** = porta abriu/fechou. **9** = evento de dispositivo. `heartBeat` a cada ~30s.
- Face e cartão chegam com o **mesmo** `employeeNoString`. O número do cartão (`cardNo`) **nunca** é enviado ao backend. Não invente esse campo.
- IDs de pessoas são **String com zeros à esquerda** (ex.: `0001764`). Nunca converter para número, nunca truncar.
- Payload chega como `multipart/form-data` (terminais MinMoe) ou JSON puro (câmeras DeepinView).
- O `dateTime` do payload vem em **GMT+8** (fuso de fábrica). **Ignorar**; usar sempre a hora do servidor.
- O webhook é **pós-evento**: o terminal decide e notifica depois. O backend **não** bloqueia porta.

### REGRAS INVIOLÁVEIS (violação = parar tudo e reportar)
- ❌ **NUNCA** executar `git commit` ou `git push`. O Sam commita, sempre, após revisar.
- ❌ **NUNCA** apagar, alterar ou migrar registros existentes.
- ❌ **NUNCA** fazer DDL destrutivo (DROP, ALTER TYPE, adicionar NOT NULL a coluna existente).
- ❌ **NUNCA** usar enum nativo do PostgreSQL. Enums são Java + `@Enumerated(EnumType.STRING)` + coluna VARCHAR.
- ❌ **NUNCA** introduzir dados mock, placeholder ou fixture fora de `src/test/`.
- ❌ **NUNCA** armazenar dados financeiros/bancários.
- ✅ Se uma âncora de código não for encontrada, ou for encontrada mais de uma vez, ou algo neste prompt contradisser o código real: **PARE e reporte**. Não improvise arquitetura.

---

## OBJETIVO DA FASE A

Criar toda a **fundação de domínio** (enums, entidades JPA, repositories, configuração de políticas) **sem alterar nenhum comportamento do sistema**. Ao final desta fase, o sistema deve se comportar exatamente como antes — as estruturas novas existem, mas ninguém as usa ainda.

Esta é uma fase de baixo risco por construção: código novo, isolado, sem integração.

---

## DEPENDÊNCIAS
Nenhuma. Esta é a primeira fase. Requer apenas o `main` em `2a66f21` (que já contém o enum `AuthMethod` e as colunas `auth_method` / `hikvision_sub_event_type` em `access_logs` — **não recriar**).

---

## ARQUIVOS

### Novos (16)
```
backend/src/main/java/com/magbo/access/models/AuthResult.java
backend/src/main/java/com/magbo/access/models/AuthorizationResult.java
backend/src/main/java/com/magbo/access/models/DenialReason.java
backend/src/main/java/com/magbo/access/models/EntitlementStatus.java
backend/src/main/java/com/magbo/access/models/ExitPermissionType.java
backend/src/main/java/com/magbo/access/models/ExitPermissionStatus.java
backend/src/main/java/com/magbo/access/models/PolicyMode.java
backend/src/main/java/com/magbo/access/models/AccessAttempt.java
backend/src/main/java/com/magbo/access/models/MealEntitlement.java
backend/src/main/java/com/magbo/access/models/MealEntitlementEvent.java
backend/src/main/java/com/magbo/access/models/StudentExitPermission.java
backend/src/main/java/com/magbo/access/repositories/AccessAttemptRepository.java
backend/src/main/java/com/magbo/access/repositories/MealEntitlementRepository.java
backend/src/main/java/com/magbo/access/repositories/MealEntitlementEventRepository.java
backend/src/main/java/com/magbo/access/repositories/StudentExitPermissionRepository.java
backend/src/main/java/com/magbo/access/config/PolicyProperties.java
```

### Alterados (4)
```
backend/src/main/java/com/magbo/access/models/SystemUser.java          (+ campo permissoes, + helper hasPermission)
backend/src/main/resources/application.properties                       (+ bloco de políticas)
backend/src/main/resources/application-prod.properties                  (+ bloco de políticas + comentário de atenção)
backend/src/main/resources/application-dev.properties                   (+ bloco de políticas)
```

### Existentes que você DEVE LER antes (para seguir o padrão do projeto)
```
backend/src/main/java/com/magbo/access/models/AccessLog.java      → padrão de entidade (Lombok, @Builder, @Column)
backend/src/main/java/com/magbo/access/models/AuthMethod.java     → padrão de enum
backend/src/main/java/com/magbo/access/models/AccessAction.java   → padrão de enum simples
backend/src/main/java/com/magbo/access/models/SystemUser.java     → padrão de CSV + canOperateSector (vai espelhar em hasPermission)
backend/src/main/java/com/magbo/access/repositories/AccessLogRepository.java → padrão de repository
```

---

## ORDEM CORRETA DE IMPLEMENTAÇÃO

### Passo 1 — Enums (7 arquivos)
Todos em `com.magbo.access.models`, enums Java simples, seguindo o padrão de `AuthMethod.java`. **Valores exatos, sem adicionar nem remover nenhum:**

```
AuthResult:            SUCCESS, DENIED, UNKNOWN
AuthorizationResult:   AUTHORIZED, DENIED, OBSERVATION, NOT_APPLICABLE
DenialReason:          MEAL_NOT_ENTITLED, OUTSIDE_MEAL_TIME, DUPLICATE_MEAL,
                       EXIT_NOT_AUTHORIZED, OUTSIDE_EXIT_WINDOW, USER_INACTIVE,
                       UNKNOWN_USER, MISSING_DOOR_MAPPING, DEVICE_DENIED, NORMAL
EntitlementStatus:     AUTHORIZED, NOT_AUTHORIZED, PENDING
ExitPermissionType:    PERMANENT, RECURRING, DATE_RANGE, SINGLE
ExitPermissionStatus:  ACTIVE, REVOKED, USED, EXPIRED
PolicyMode:            OBSERVATION, DENY
```

Adicionar um Javadoc curto em cada, explicando o eixo semântico:
- `AuthResult` = decisão **do terminal** (físico).
- `AuthorizationResult` = decisão **do MAGBO** (lógica).
- `DenialReason` = motivo da decisão. `NORMAL` existe por completude e **não deve ser gravado** em `access_attempts`.
- `PolicyMode` = `OBSERVATION` (registra acesso E tentativa) vs `DENY` (registra só tentativa; **não** bloqueia porta fisicamente).

### Passo 2 — Entidade `AccessAttempt`
Tabela `access_attempts`. Seguir o padrão de `AccessLog.java` (mesmas anotações Lombok: `@Getter @Setter @ToString @NoArgsConstructor @AllArgsConstructor @Builder @EqualsAndHashCode(onlyExplicitlyIncluded = true)`).

| Campo Java | Tipo | Anotação de coluna | Null? |
|---|---|---|---|
| `id` | `Long` | `@Id @GeneratedValue(strategy = GenerationType.IDENTITY)` + `@EqualsAndHashCode.Include` | não |
| `userId` | `String` | `@Column(name="user_id")` | **sim** |
| `employeeNoRaw` | `String` | `@Column(name="employee_no_raw", nullable=false, length=64)` | não |
| `nomeSnapshot` | `String` | `@Column(name="nome_snapshot")` | sim |
| `pointId` | `String` | `@Column(name="point_id")` | sim |
| `action` | `AccessAction` | `@Enumerated(EnumType.STRING) @Column(length=16)` | sim |
| `terminalIp` | `String` | `@Column(name="terminal_ip", length=45)` | sim |
| `authMethod` | `AuthMethod` | `@Enumerated(EnumType.STRING) @Column(name="auth_method", length=8)` | sim |
| `authResult` | `AuthResult` | `@Enumerated(EnumType.STRING) @Column(name="auth_result", nullable=false, length=8)` | não |
| `authorizationResult` | `AuthorizationResult` | `@Enumerated(EnumType.STRING) @Column(name="authorization_result", nullable=false, length=16)` | não |
| `denialReason` | `DenialReason` | `@Enumerated(EnumType.STRING) @Column(name="denial_reason", nullable=false, length=32)` | não |
| `hikvisionSubEventType` | `Integer` | `@Column(name="hikvision_sub_event_type")` | sim |
| `timestamp` | `LocalDateTime` | `@Column(nullable=false)` + `@Builder.Default = LocalDateTime.now()` | não |
| `doorMappingFallback` | `Boolean` | `@Column(name="door_mapping_fallback")` | sim |

⚠️ `userId` **sem** foreign key (mesmo padrão de `access_logs`, que também não tem FK). `employeeNoRaw` sempre preenchido, mesmo quando `userId` é null.

### Passo 3 — Entidade `MealEntitlement`
Tabela `meal_entitlements`. **PK natural = `userId`** (String), uma linha por aluno.

| Campo | Tipo | Coluna | Null? |
|---|---|---|---|
| `userId` | `String` | `@Id @Column(name="user_id")` | não |
| `status` | `EntitlementStatus` | `@Enumerated(EnumType.STRING) @Column(nullable=false, length=16)` | não |
| `validFrom` | `LocalDate` | `@Column(name="valid_from")` | sim |
| `validUntil` | `LocalDate` | `@Column(name="valid_until")` | sim |
| `note` | `String` | `@Column(length=255)` | sim |
| `daysOfWeek` | `String` | `@Column(name="days_of_week", length=16)` | sim |
| `mealType` | `String` | `@Column(name="meal_type", length=16)` | sim |
| `updatedBy` | `String` | `@Column(name="updated_by", length=50)` | sim |
| `updatedAt` | `LocalDateTime` | `@Column(name="updated_at", nullable=false)` | não |
| `createdAt` | `LocalDateTime` | `@Column(name="created_at", nullable=false, updatable=false)` | não |

⚠️ **`daysOfWeek` e `mealType` são CAMPOS RESERVADOS.** Criar as colunas agora (evita migração futura), mas **nenhuma lógica os usa nesta implementação**. Documentar isso em Javadoc: "Reservado para evolução futura — a regra atual IGNORA este campo."

Adicionar `@PrePersist` (seta `createdAt` e `updatedAt`) e `@PreUpdate` (seta `updatedAt`), seguindo o padrão de `SystemUser.onCreate()`.

### Passo 4 — Entidade `MealEntitlementEvent`
Tabela `meal_entitlement_events`. Histórico imutável — **nunca** deve ser atualizado ou apagado, só inserido.

| Campo | Tipo | Coluna | Null? |
|---|---|---|---|
| `id` | `Long` | `@Id @GeneratedValue(IDENTITY)` | não |
| `userId` | `String` | `@Column(name="user_id", nullable=false)` | não |
| `oldStatus` | `EntitlementStatus` | `@Enumerated(STRING) @Column(name="old_status", length=16)` | sim |
| `newStatus` | `EntitlementStatus` | `@Enumerated(STRING) @Column(name="new_status", nullable=false, length=16)` | não |
| `oldValidFrom` / `oldValidUntil` / `newValidFrom` / `newValidUntil` | `LocalDate` | `@Column(name="old_valid_from")` etc. | sim |
| `changedBy` | `String` | `@Column(name="changed_by", nullable=false, length=50)` | não |
| `changedAt` | `LocalDateTime` | `@Column(name="changed_at", nullable=false)` | não |
| `note` | `String` | `@Column(length=255)` | sim |
| `source` | `String` | `@Column(nullable=false, length=16)` | não |

`source` aceita: `UI`, `BULK`, `API`.

### Passo 5 — Entidade `StudentExitPermission`
Tabela `student_exit_permissions`.

| Campo | Tipo | Coluna | Null? |
|---|---|---|---|
| `id` | `Long` | `@Id @GeneratedValue(IDENTITY)` | não |
| `userId` | `String` | `@Column(name="user_id", nullable=false)` | não |
| `permissionType` | `ExitPermissionType` | `@Enumerated(STRING) @Column(name="permission_type", nullable=false, length=16)` | não |
| `validFrom` | `LocalDate` | `@Column(name="valid_from")` | sim |
| `validUntil` | `LocalDate` | `@Column(name="valid_until")` | sim |
| `startTime` | `LocalTime` | `@Column(name="start_time")` | sim |
| `endTime` | `LocalTime` | `@Column(name="end_time")` | sim |
| `daysOfWeek` | `String` | `@Column(name="days_of_week", length=16)` | sim |
| `status` | `ExitPermissionStatus` | `@Enumerated(STRING) @Column(nullable=false, length=16)` | não |
| `reason` | `String` | `@Column(nullable=false, length=255)` | **não** |
| `note` | `String` | `@Column(length=255)` | sim |
| `createdBy` | `String` | `@Column(name="created_by", nullable=false, length=50)` | **não** |
| `createdAt` | `LocalDateTime` | `@Column(name="created_at", nullable=false, updatable=false)` | não |
| `revokedBy` | `String` | `@Column(name="revoked_by", length=50)` | sim |
| `revokedAt` | `LocalDateTime` | `@Column(name="revoked_at")` | sim |
| `usedAt` | `LocalDateTime` | `@Column(name="used_at")` | sim |

`daysOfWeek`: CSV ISO-8601 (`1`=segunda … `7`=domingo). Ex.: `"1,3,5"`.
`reason` e `createdBy` são **obrigatórios por exigência do cliente** (auditoria: sempre saber quem autorizou e por quê).

### Passo 6 — Repositories (4 arquivos)
Interfaces `extends JpaRepository`, `@Repository`, seguindo o padrão de `AccessLogRepository.java`.

**`AccessAttemptRepository extends JpaRepository<AccessAttempt, Long>`** — declarar apenas os métodos derivados nesta fase (as `@Query` de agregação entram na Fase E):
```java
long countByTimestampGreaterThanEqual(LocalDateTime start);
long countByDenialReasonAndTimestampGreaterThanEqual(DenialReason reason, LocalDateTime start);
List<AccessAttempt> findTop200ByPointIdInAndTimestampAfterOrderByTimestampDesc(List<String> pointIds, LocalDateTime after);
List<AccessAttempt> findTop200ByUserIdOrderByTimestampDesc(String userId);
```

**`MealEntitlementRepository extends JpaRepository<MealEntitlement, String>`**:
```java
List<MealEntitlement> findByStatus(EntitlementStatus status);
long countByStatus(EntitlementStatus status);
```
(`findById(userId)` já vem do JpaRepository — não duplicar.)

**`MealEntitlementEventRepository extends JpaRepository<MealEntitlementEvent, Long>`**:
```java
List<MealEntitlementEvent> findByUserIdOrderByChangedAtDesc(String userId);
```

**`StudentExitPermissionRepository extends JpaRepository<StudentExitPermission, Long>`**:
```java
List<StudentExitPermission> findByUserIdAndStatus(String userId, ExitPermissionStatus status);
List<StudentExitPermission> findByStatusOrderByCreatedAtDesc(ExitPermissionStatus status);
List<StudentExitPermission> findByUserIdOrderByCreatedAtDesc(String userId);
```

### Passo 7 — `SystemUser`: campo `permissoes` + helper
**Ler o arquivo primeiro.** Adicionar, seguindo o padrão do campo `setoresPermitidos` (que é CSV com suporte a `*`):

```java
/**
 * CSV de permissões granulares deste operador.
 * Valores reconhecidos: MEAL_ENTITLEMENT_WRITE, EXIT_PERMISSION_WRITE, ATTEMPTS_READ.
 * "*" = todas. null = nenhuma permissão granular (não remove nada do que
 * setoresPermitidos já concede — apenas escrita de entitlements/permissões exige isto).
 */
@Column(name = "permissoes", length = 255)
private String permissoes;
```

E um helper espelhando **exatamente** a lógica de `canOperateSector` (ler o método existente e replicar o estilo: trim, case-insensitive, `*` = tudo, null/blank = false):
```java
public boolean hasPermission(String permission) { ... }
```

⚠️ **Compatibilidade obrigatória:** operadores existentes têm `permissoes = null`. Isso **não pode remover nenhum acesso atual**. `hasPermission` só será consultado nas rotas de escrita novas (Fase F).

### Passo 8 — `PolicyProperties`
`com.magbo.access.config.PolicyProperties`, com `@Component` + `@ConfigurationProperties(prefix = "magbo")` (ou `@Configuration`), Lombok `@Getter @Setter`. Estrutura aninhada:

```
magbo.policy.meal-not-entitled      → PolicyMode (default DENY)
magbo.policy.meal-pending           → PolicyMode (default OBSERVATION)
magbo.policy.outside-meal-time      → PolicyMode (default OBSERVATION)
magbo.policy.duplicate-meal         → PolicyMode (default OBSERVATION)
magbo.policy.exit-not-authorized    → PolicyMode (default DENY)
magbo.policy.user-inactive          → PolicyMode (default DENY)
magbo.policy.missing-door-mapping   → String, "FALLBACK" ou "ATTEMPT" (default "FALLBACK")
magbo.dedup.window-seconds          → int (default 90)
magbo.dedup.enabled                 → boolean (default true)
```

⚠️ `missing-door-mapping` **não** é `PolicyMode` — é um enum/String próprio com valores `FALLBACK` (comportamento atual preservado) e `ATTEMPT`. Se preferir criar um enum `DoorMappingPolicy { FALLBACK, ATTEMPT }` em `models`, faça — é aceitável e mais limpo.

Adicionar um método de log no `@PostConstruct` que imprima as políticas ativas no startup (ajuda muito na operação):
```
log.info("MAGBO policies: meal-not-entitled={}, meal-pending={}, outside-meal-time={}, duplicate-meal={}, exit-not-authorized={}, user-inactive={}, missing-door-mapping={}, dedup={}s (enabled={})", ...)
```

### Passo 9 — Properties (3 arquivos)
**Ler cada arquivo antes de editar.** Adicionar ao final de cada um (`application.properties`, `application-dev.properties`, `application-prod.properties`):

```properties
# --- Políticas de decisão de acesso ---
# OBSERVATION = registra o acesso normalmente E registra a tentativa para auditoria
# DENY        = NÃO registra acesso; registra apenas a tentativa negada
# ATENÇÃO: DENY é uma decisão LÓGICA do MAGBO. O backend NÃO bloqueia porta
# fisicamente (o terminal decide localmente e notifica depois). Bloqueio físico
# real só existe distribuindo access levels pelo HikCentral.
magbo.policy.meal-not-entitled=DENY
magbo.policy.meal-pending=OBSERVATION
magbo.policy.outside-meal-time=OBSERVATION
magbo.policy.duplicate-meal=OBSERVATION
magbo.policy.exit-not-authorized=DENY
magbo.policy.user-inactive=DENY
# FALLBACK = terminal sem mapeamento cai no comportamento legado (PORT1+ENTRADA)
# ATTEMPT  = terminal sem mapeamento gera tentativa MISSING_DOOR_MAPPING
magbo.policy.missing-door-mapping=FALLBACK

# --- Deduplicação de eventos ---
magbo.dedup.enabled=true
magbo.dedup.window-seconds=90
```

**Adicional obrigatório apenas em `application-prod.properties`**, acima do bloco:
```properties
# ATENÇÃO PRODUÇÃO: magbo.policy.meal-pending DEVE ser decidido explicitamente pela
# direção da escola. OBSERVATION é adequado ao piloto (coleta dados sem impacto).
# Por segurança, o padrão institucional em produção provavelmente deve ser DENY
# (aluno sem direito confirmado não deve ser contabilizado como refeição paga).
```

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS NESTA FASE

1. **Nenhum comportamento existente pode mudar.** Nenhum arquivo de controller ou service é tocado. O webhook permanece **byte a byte** como está.
2. **`AuthMethod` já existe** (`FACE`, `CARD`, `UNKNOWN`) — não recriar, não alterar.
3. **`access_logs` não recebe nenhuma coluna nova nesta fase** (nem `auth_result`, nem `granted`, nem `denial_reason`). Decisão do cliente: estar nessa tabela já significa acesso efetivo e bem-sucedido.
4. Todos os enums com `@Enumerated(EnumType.STRING)`. **Nunca** `ORDINAL`. **Nunca** enum PostgreSQL.
5. `userId` em `access_attempts` é **nullable** e **sem FK** — é a única forma de registrar um ID desconhecido (`UNKNOWN_USER`).
6. `employeeNoRaw` **nunca** é null.
7. Zeros à esquerda: tudo String. Nenhuma conversão numérica em lugar nenhum.
8. Não adicionar dependências ao `pom.xml` nesta fase.

---

## CRITÉRIOS DE ACEITE

- [ ] `mvn clean compile` passa sem erros e sem warnings novos.
- [ ] `mvn spring-boot:run -Dspring-boot.run.profiles=prod` sobe e loga `Started MagboAccessApplication`.
- [ ] O log de startup mostra a linha nova com as políticas ativas.
- [ ] Com `ddl-auto=update`, as 4 tabelas novas são criadas automaticamente no restart.
- [ ] `\d access_attempts` mostra todas as colunas da seção 3.3 da spec, com os CHECK constraints gerados pelo Hibernate para os campos enum.
- [ ] `\d meal_entitlements`, `\d meal_entitlement_events`, `\d student_exit_permissions` idem.
- [ ] `\d system_users` mostra a coluna `permissoes`.
- [ ] `\d access_logs` **inalterada** (mesmas colunas de antes: já tem `auth_method` e `hikvision_sub_event_type` do commit anterior).
- [ ] Um evento de face real continua gerando `access_log` idêntico ao comportamento atual (nada mudou).
- [ ] `SELECT COUNT(*) FROM access_logs;` retorna o mesmo número de antes (nenhum dado tocado).

---

## VALIDAÇÕES (comandos que o Sam vai rodar)

```powershell
# 1. Compilação
cd backend; mvn clean compile

# 2. Restart e startup limpo
mvn spring-boot:run "-Dspring-boot.run.profiles=prod"

# 3. Tabelas criadas
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d access_attempts"
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d meal_entitlements"
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d meal_entitlement_events"
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d student_exit_permissions"
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d system_users"

# 4. Nada foi tocado
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT COUNT(*) FROM access_logs;"
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT COUNT(*) FROM access_attempts;"   -- deve ser 0

# 5. Health
Invoke-WebRequest http://localhost:8080/api/health -UseBasicParsing | Select -ExpandProperty Content
```

---

## CHECKLIST DE CONCLUSÃO (preencher e reportar ao Sam)

- [ ] 7 enums criados com os valores exatos da spec
- [ ] `AccessAttempt` criada — `userId` nullable, `employeeNoRaw` NOT NULL
- [ ] `MealEntitlement` criada — PK natural `userId`, campos reservados `daysOfWeek`/`mealType` documentados como não usados
- [ ] `MealEntitlementEvent` criada
- [ ] `StudentExitPermission` criada — `reason` e `createdBy` NOT NULL
- [ ] 4 repositories criados
- [ ] `SystemUser.permissoes` + `hasPermission()` adicionados, espelhando `canOperateSector`
- [ ] `PolicyProperties` criado com defaults e log de startup
- [ ] Políticas adicionadas aos 3 `.properties`, com o comentário de atenção no prod
- [ ] `mvn clean compile` verde
- [ ] Nenhum controller/service alterado
- [ ] Nenhum commit feito
- [ ] Lista dos arquivos criados/alterados reportada

---

## RISCOS DESTA FASE

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `ddl-auto=update` não criar alguma tabela por erro de mapeamento | Baixa | Conferir `\d` de cada tabela; ler o log de startup do Hibernate |
| Nome de coluna divergir do esperado (camelCase → snake_case automático do Hibernate) | Média | **Sempre** declarar `@Column(name="...")` explicitamente, como manda a tabela deste prompt |
| `@ConfigurationProperties` não bindar sem `@EnableConfigurationProperties` | Média | Usar `@Component` + `@ConfigurationProperties`; validar pelo log de startup das políticas |
| Adicionar `permissoes` quebrar o CRUD atual de system-users | Baixa | Campo nullable; não alterar DTOs nesta fase |

---

## ROLLBACK

| Nível | Ação | Perda |
|---|---|---|
| Código | `git checkout -- .` (nada foi commitado) ou reverter o commit da fase | Nenhuma |
| Schema | As 4 tabelas ficam **inertes** (nenhum código as lê ou escreve). Não é necessário DROP. Se exigido: `DROP TABLE IF EXISTS access_attempts, meal_entitlement_events, meal_entitlements, student_exit_permissions;` e `ALTER TABLE system_users DROP COLUMN IF EXISTS permissoes;` | Nenhuma (tabelas vazias) |
| Dados | Nenhum dado existente foi tocado. Rollback não requer restore. | — |

---

## AO TERMINAR

1. Rode `mvn clean compile` e confirme que passa.
2. Preencha o checklist acima.
3. Liste **todos** os arquivos criados e alterados.
4. Reporte qualquer divergência entre este prompt e o código real.
5. **NÃO faça commit.** Aguarde a revisão do Sam.
