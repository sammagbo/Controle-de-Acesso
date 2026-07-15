# PROMPT — FASE E: Endpoints de Tentativas e KPIs

## CONTEXTO DO PROJETO
**MAGBO Access Control** — Lycée Molière (Rio). Hikvision → webhook → Spring Boot 3.2.5/Java 17 → PostgreSQL 16 → Electron/React. `backend/` = Spring Boot (`com.magbo.access`).
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia as seções 6.1, 7.1 e 7.4**.

### CONTEXTO
As Fases B–D passaram a gravar tentativas negadas em `access_attempts`. Agora é preciso **ler** esses dados: feeds para os painéis da cantina e da portaria, filtros para relatórios, e KPIs no dashboard.

**Pergunta que o sistema precisa responder** (exigência do cliente): quem tentou, quando, em qual terminal, em qual setor, se usou face ou cartão, qual regra negou, se o terminal negou fisicamente, se o MAGBO apenas classificou, e quantas tentativas por aluno/turma/setor/motivo.

### FATO CRÍTICO — COMPATIBILIDADE
O frontend atual (`js/components/AdminDashboard.js`) lê o campo **`blockedToday`** de `/api/stats/global`. **Renomear esse campo quebra a UI.** A regra é: **adicionar** campos novos, **manter** `blockedToday` como alias depreciado. Não remover nada.

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`.
- ❌ **NUNCA** alterar a semântica de `totalToday`, `activeUsers`, `authorizedToday`, `totalUsers`.
- ❌ **NUNCA** remover `blockedToday` do DTO.
- ❌ **NUNCA** alterar nenhuma query existente de `AccessLogRepository`.
- ❌ **NUNCA** misturar `access_logs` e `access_attempts` numa mesma listagem sem distinção explícita.
- ✅ Contradição com o código → **PARE e reporte**.

---

## OBJETIVO DA FASE E
1. Endpoints de leitura de tentativas (paginado, filtrado, + feeds por área).
2. Agregações (por motivo, ponto, turma, método) e o KPI de **divergência física × lógica**.
3. Ampliar `GlobalStats` **sem quebrar o frontend**.

## DEPENDÊNCIAS
**Fases A–D concluídas.** Requer `AccessAttempt`, `AccessAttemptRepository` e dados sendo gravados.

---

## ARQUIVOS
### Novos (4)
```
backend/src/main/java/com/magbo/access/controllers/AccessAttemptController.java
backend/src/main/java/com/magbo/access/dto/AccessAttemptDto.java
backend/src/main/java/com/magbo/access/dto/AttemptStatsDto.java
backend/src/main/java/com/magbo/access/services/AccessAttemptQueryService.java
```
### Alterados (3)
```
backend/src/main/java/com/magbo/access/repositories/AccessAttemptRepository.java   (+queries de agregação)
backend/src/main/java/com/magbo/access/dto/GlobalStats.java                        (+3 campos)
backend/src/main/java/com/magbo/access/controllers/StatsController.java            (preenche os campos novos)
```
### Ler antes
```
controllers/AccessController.java        ← padrão de filtros, @PreAuthorize por área, limites
repositories/AccessLogRepository.java    ← padrão de @Query nativa retornando Object[]
dto/GlobalStats.java · controllers/StatsController.java
config/AreaMapping.java                  ← ponto → área
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — `AccessAttemptRepository`: queries de agregação
Adicionar (seguir o padrão de `@Query(nativeQuery = true)` retornando `Object[]` já usado no projeto):
```java
// listagem filtrada e paginada
@Query("""
   SELECT a FROM AccessAttempt a
   WHERE (:#{#from == null} = true OR a.timestamp >= :from)
     AND (:#{#to == null} = true OR a.timestamp <= :to)
     AND (:#{#pointId == null} = true OR a.pointId = :pointId)
     AND (:#{#userId == null} = true OR a.userId = :userId)
     AND (:#{#reason == null} = true OR a.denialReason = :reason)
     AND (:#{#method == null} = true OR a.authMethod = :method)
   ORDER BY a.timestamp DESC
""")
Page<AccessAttempt> findFiltered(from, to, pointId, userId, reason, method, Pageable);

// agregações (nativeQuery, [chave, contagem])
List<Object[]> countByReasonSince(LocalDateTime start);   // GROUP BY denial_reason
List<Object[]> countByPointSince(LocalDateTime start);    // GROUP BY point_id
List<Object[]> countByMethodSince(LocalDateTime start);   // GROUP BY auth_method
List<Object[]> countByTurmaSince(LocalDateTime start);    // JOIN app_users u ON u.id = a.user_id GROUP BY u.turma

// ★ KPI de divergência física × lógica
@Query("SELECT COUNT(a) FROM AccessAttempt a WHERE a.timestamp >= :start AND a.authResult = com.magbo.access.models.AuthResult.SUCCESS AND a.authorizationResult = com.magbo.access.models.AuthorizationResult.DENIED")
long countDivergenceSince(LocalDateTime start);
```
⚠️ **`countDivergenceSince` é o KPI mais importante desta fase.** Significa: *"o terminal aprovou e a porta abriu, mas o MAGBO não considerou acesso válido"* — ou seja, o aluno entrou mesmo sem direito. Mede exatamente o que o bloqueio físico via HikCentral vai resolver. A direção da escola precisa deste número.

### Passo 2 — `AccessAttemptDto`
Campos: `id`, `userId`, `employeeNoRaw`, `nome`, `turma`, `pointId`, `action`, `terminalIp`, `authMethod`, `authResult`, `authorizationResult`, `denialReason`, `hikvisionSubEventType`, `timestamp`, `doorMappingFallback`.
- `nome`: buscar em `app_users` quando `userId != null`; senão usar `nomeSnapshot`; senão null.
- `turma`: de `app_users` quando `userId != null`; senão null.
⚠️ Resolver nome/turma **em lote** (uma consulta por página com `findAllById`), **nunca** N+1 dentro do loop.

### Passo 3 — `AttemptStatsDto`
```java
{ long total; Map<String,Long> byReason; Map<String,Long> byPoint;
  Map<String,Long> byMethod; Map<String,Long> byTurma; long divergence; }
```

### Passo 4 — `AccessAttemptQueryService`
`@Service`. Encapsula: paginação, conversão para DTO, resolução em lote de nome/turma, montagem das agregações. Mantém o controller fino.

### Passo 5 — `AccessAttemptController`
`@RestController @RequestMapping("/api/access/attempts")`.

| Método | Rota | `@PreAuthorize` | Descrição |
|---|---|---|---|
| GET | `` | `hasRole('ADMIN')` **(ver nota)** | Filtros: `from`, `to`, `pointId`, `userId`, `reason`, `method`, `page`(0), `size`(50, **máx 200**). Ordenado desc. |
| GET | `/stats` | `hasRole('ADMIN')` | `AttemptStatsDto` do período (`from`/`to`, default = hoje) |
| GET | `/refectory` | `@areaSecurity.can('cantine')` | Últimas 200 em `REFEI1`,`REFEI2`,`CANTINA1` (feed do painel) |
| GET | `/gate` | `@areaSecurity.can('portail')` | Últimas 200 em `PORT1`,`PORT2`,`PORT3` (feed da portaria) |

⚠️ **Nota:** a permissão `ATTEMPTS_READ` só existe na **Fase F**. Aqui usar `hasRole('ADMIN')` nas duas primeiras + comentário `// FASE F: adicionar or @areaSecurity.hasPermission('ATTEMPTS_READ')`. Os feeds por área já usam `can(...)` e não mudam.

⚠️ `size` máximo **200** (validar e truncar, como `AccessController` já faz com `limit`).
⚠️ Se `from`/`to` ausentes → default: hoje 00:00 até agora.

### Passo 6 — `GlobalStats` + `StatsController`
**Ler os dois arquivos primeiro.** `GlobalStats` (Lombok `@Builder`) ganha **3 campos novos**, mantendo todos os atuais:
```java
private long alertasHoje;       // = mesmo valor de blockedToday
private long negadasHoje;       // total de access_attempts hoje
private long divergenciaHoje;   // auth_result=SUCCESS AND authorization_result=DENIED
```
E o campo existente ganha Javadoc:
```java
/**
 * @deprecated Nome enganoso: conta access_logs com flag != null (alertas), e nada foi
 * bloqueado. Mantido como alias de alertasHoje para compatibilidade do frontend atual.
 * Usar alertasHoje. Remoção prevista para fase futura, após migração da UI.
 */
@Deprecated
private long blockedToday;
```
`StatsController.getGlobalStats()`:
```java
long alertas    = accessLogRepository.countBlockedSince(startOfDay);      // query EXISTENTE, não alterar
long negadas    = accessAttemptRepository.countByTimestampGreaterThanEqual(startOfDay);
long divergencia= accessAttemptRepository.countDivergenceSince(startOfDay);

.blockedToday(alertas)      // alias
.alertasHoje(alertas)
.negadasHoje(negadas)
.divergenciaHoje(divergencia)
.authorizedToday(totalToday - alertas)   // INALTERADO
```
⚠️ **Não alterar** `countBlockedSince`, `countByTimestampGreaterThanEqual` (de logs), `countActiveUsersSince`.
⚠️ Injetar `AccessAttemptRepository` no `StatsController`.

### Passo 7 — SecurityConfig
Conferir que as rotas novas ficam **fora** do `permitAll` (exigem JWT). **Não tocar** nos matchers de `/api/auth/login`, `/api/health`, `/api/hikvision/**`, `/h2-console/**`.

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. `blockedToday` **permanece** no DTO com o mesmo valor de sempre.
2. `totalToday`, `activeUsers`, `authorizedToday`, `totalUsers` **inalterados**.
3. Nenhuma query de `AccessLogRepository` alterada.
4. `size` máx 200.
5. Sem N+1 na resolução de nome/turma.
6. Listagens de tentativas **nunca** se misturam com `access_logs`.
7. `employeeNoRaw` sempre exposto no DTO (é o único identificador quando `userId` é null).

## CRITÉRIOS DE ACEITE
- [ ] `mvn clean compile` verde.
- [ ] `GET /api/access/attempts` responde paginado, ordenado desc, com todos os filtros.
- [ ] `size=500` → truncado para 200.
- [ ] `GET /api/access/attempts/stats` traz `byReason`, `byPoint`, `byMethod`, `byTurma`, `divergence`.
- [ ] `GET /api/access/attempts/refectory` e `/gate` retornam só os pontos da área.
- [ ] Operador com `setoresPermitidos=REFEI1` acessa `/refectory` (200) e **não** acessa `/gate` (403).
- [ ] ★ `GET /api/stats/global` retorna `blockedToday` **e** `alertasHoje` com o **mesmo valor**.
- [ ] `negadasHoje` bate com `SELECT COUNT(*) FROM access_attempts WHERE timestamp >= hoje`.
- [ ] `divergenciaHoje` > 0 após um evento de subtipo 8 do dia.
- [ ] ★ **AdminDashboard atual continua funcionando sem nenhuma alteração de frontend.**
- [ ] Tentativa com `userId=null` aparece na listagem com `employeeNoRaw` preenchido e `nome` do snapshot.

## VALIDAÇÕES
```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login -ContentType "application/json" -Body '{"username":"admin","password":"admin1234"}'
$h = @{ Authorization = "Bearer $($login.token)" }

Invoke-RestMethod -Uri "http://localhost:8080/api/access/attempts?size=10" -Headers $h | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "http://localhost:8080/api/access/attempts/stats" -Headers $h | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "http://localhost:8080/api/access/attempts/refectory" -Headers $h | Select -First 3
Invoke-RestMethod -Uri "http://localhost:8080/api/stats/global" -Headers $h
# → conferir: blockedToday == alertasHoje ; negadasHoje > 0 ; divergenciaHoje > 0
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT COUNT(*) FROM access_attempts WHERE timestamp::date = CURRENT_DATE;"
# → deve bater com negadasHoje
```

## CHECKLIST DE CONCLUSÃO
- [ ] 5 queries novas em `AccessAttemptRepository`, incluindo `countDivergenceSince`
- [ ] `AccessAttemptDto` com resolução de nome/turma **em lote**
- [ ] `AttemptStatsDto` com as 4 agregações + divergence
- [ ] `AccessAttemptQueryService` criado
- [ ] `AccessAttemptController` com 4 rotas, `size` máx 200, comentários `// FASE F:`
- [ ] `GlobalStats` +3 campos, `blockedToday` mantido e marcado `@Deprecated`
- [ ] `StatsController` preenche tudo sem alterar as queries existentes
- [ ] `mvn clean compile` verde · **Nenhum commit**

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| Remover/renomear `blockedToday` | **Alta** (quebra a UI hoje) | Alias mantido + `@Deprecated` |
| N+1 ao resolver nome/turma | Média (923 alunos) | `findAllById` por página |
| `@Query` com `:#{#param == null}` sintaticamente errada | Média | Copiar o padrão de `findFilteredLogs`, que já funciona |
| Agregação por turma com `userId` null | Média | `JOIN` exclui nulos naturalmente; documentar que `UNKNOWN_USER` não entra em `byTurma` |
| Rota nova cair no `permitAll` | Alta (vazamento) | Conferir `SecurityConfig`; testar sem token → 401/403 |

## ROLLBACK
| Nível | Ação | Perda |
|---|---|---|
| Código | `git revert` — os endpoints somem, a gravação de tentativas (Fase B) continua | Nenhuma |
| Frontend | Nenhum impacto: a UI ainda lê `blockedToday` | — |

## AO TERMINAR
1. Compile. 2. Checklist. 3. Confirmar: "`blockedToday` continua presente e com o mesmo valor; o AdminDashboard atual não precisa de alteração". 4. **NÃO commitar.**
