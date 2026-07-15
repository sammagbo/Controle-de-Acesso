# PROMPT — FASE C: Direito à Refeição (Meal Entitlements)

## CONTEXTO DO PROJETO

**MAGBO Access Control** — controle de acesso do Lycée Molière (Rio). Terminais Hikvision (face + cartão) → webhook → Spring Boot 3.2.5/Java 17 → PostgreSQL 16 → Electron/React.
Monorepo: `backend/` = Spring Boot (`com.magbo.access`). Branch `main`.
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia as seções 3.4, 3.5, 4.4 e 7.2**.

### CONTEXTO DE NEGÓCIO (essencial para entender esta fase)
**A cantina é paga pelos responsáveis.** Estar cadastrado no sistema **não** significa ter direito à refeição. Hoje o sistema não controla isso: qualquer aluno reconhecido gera uma refeição contabilizada. Esta fase cria o controle explícito.

**Regra de ouro do cliente:** *"Não usar campo vazio como regra definitiva, pois vazio pode significar dado não preenchido."* → ausência de registro = `PENDING`, **nunca** interpretado como "não pagou".

### FATOS DE HARDWARE (validados, não questionar)
- `subEventType` **75**=face aprovada, **1**=cartão aprovado, **8**=NEGADO pelo terminal. Face e cartão trazem o **mesmo** `employeeNoString`. `cardNo` nunca é enviado.
- IDs são String com zeros à esquerda (`0001764`). Nunca truncar.
- O webhook é **pós-evento**. O backend **não** bloqueia porta. **`DENY` aqui significa: não registra como acesso efetivo, registra tentativa.** O aluno **entra fisicamente** de qualquer forma — isso é esperado e será medido pelo KPI de divergência.

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`. O Sam revisa e commita.
- ❌ **NUNCA** tentativa negada virar acesso, refeição ou mudança de localização.
- ❌ **NUNCA** armazenar dados financeiros, bancários ou de pagamento. Só o **direito operacional**.
- ❌ **NUNCA** criar linha de entitlement automaticamente durante o fluxo do webhook.
- ❌ **NUNCA** alterar `meal_count` de `app_users` (campo dormante — a contagem deriva de `access_logs`).
- ❌ **NUNCA** alterar a lógica de `validateEntryWindow`.
- ✅ Âncora não encontrada/duplicada ou contradição com o código → **PARE e reporte**.

---

## OBJETIVO DA FASE C
1. Serviço de avaliação do direito à refeição (`MealEntitlementService`).
2. Integrar a regra no fluxo da cantina, **na posição exata** (após dedup, antes da janela de horário).
3. Endpoints administrativos de consulta e alteração, **com histórico auditável**.

**Ainda NÃO nesta fase:** importação em lote (Fase G), permissões granulares (Fase F), telas (Fase H).

## DEPENDÊNCIAS
**Fases A e B concluídas e revisadas.** Requer: `MealEntitlement`, `MealEntitlementEvent`, seus repositories, `EntitlementStatus`, `PolicyProperties`, `AccessDecisionService` com o ponto de extensão `// FASE C:` marcado.

---

## ARQUIVOS

### Novos (6)
```
backend/src/main/java/com/magbo/access/services/MealEntitlementService.java
backend/src/main/java/com/magbo/access/dto/EntitlementDecision.java          (record)
backend/src/main/java/com/magbo/access/dto/MealEntitlementDto.java
backend/src/main/java/com/magbo/access/dto/MealEntitlementRequest.java
backend/src/main/java/com/magbo/access/dto/MealEntitlementHistoryDto.java
backend/src/main/java/com/magbo/access/controllers/MealEntitlementController.java
```
### Alterados (2)
```
backend/src/main/java/com/magbo/access/services/AccessDecisionService.java   (integra a regra no ponto 10.2)
backend/src/main/java/com/magbo/access/repositories/MealEntitlementRepository.java  (+query de busca com JOIN)
```
### Ler antes
```
services/AccessDecisionService.java · models/MealEntitlement.java · models/MealEntitlementEvent.java
controllers/UserController.java  ← padrão de controller admin, @PreAuthorize, respostas
security/AreaSecurity.java       ← como funciona can('cantine')
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — `EntitlementDecision` (record)
```java
public record EntitlementDecision(
    EntitlementStatus effectiveStatus,  // status efetivo APÓS avaliar vigência
    boolean entitled,                   // true só se AUTHORIZED e vigente
    DenialReason reason                 // MEAL_NOT_ENTITLED, ou null se entitled
) {}
```

### Passo 2 — `MealEntitlementService`
`@Service @RequiredArgsConstructor @Slf4j`. Depende de `MealEntitlementRepository`, `MealEntitlementEventRepository`.

**2.1 — Avaliação (usada pelo webhook):**
```java
public EntitlementDecision evaluate(String userId, LocalDate date)
```
Lógica **exata**:
```
1. opt = repo.findById(userId)
2. SE vazio → EntitlementDecision(PENDING, false, null)
      // "PENDING" NÃO é negação. Quem decide o que fazer com PENDING é a POLÍTICA,
      // avaliada pelo AccessDecisionService. Retornar reason=null aqui.
3. e = opt.get()
4. SE e.status == NOT_AUTHORIZED → (NOT_AUTHORIZED, false, MEAL_NOT_ENTITLED)
5. SE e.status == PENDING        → (PENDING, false, null)
6. SE e.status == AUTHORIZED:
     SE e.validFrom  != null && date.isBefore(e.validFrom)  → (AUTHORIZED, false, MEAL_NOT_ENTITLED)
     SE e.validUntil != null && date.isAfter(e.validUntil)  → (AUTHORIZED, false, MEAL_NOT_ENTITLED)
     SENÃO → (AUTHORIZED, true, null)
7. ⚠️ IGNORAR os campos daysOfWeek e mealType. São reservados para evolução futura.
     Documentar isso em Javadoc.
```

**2.2 — Upsert com histórico (transacional):**
```java
@Transactional
public MealEntitlement upsert(String userId, EntitlementStatus status, LocalDate validFrom,
                              LocalDate validUntil, String note, String changedBy, String source)
```
Lógica:
```
1. Validar: userId existe em app_users (injetar UserRepository) → senão IllegalArgumentException("Aluno não encontrado: " + userId)
2. Validar: validFrom/validUntil → se ambos != null e validFrom.isAfter(validUntil) → IllegalArgumentException
3. existing = repo.findById(userId)
4. Capturar old* (status, validFrom, validUntil) — null se não existia
5. Criar ou atualizar a entidade; setar updatedBy = changedBy
6. repo.save(...)
7. eventRepo.save(MealEntitlementEvent com old*/new*, changedBy, changedAt=now, note, source)
   ⚠️ NA MESMA TRANSAÇÃO. Nunca alterar sem histórico.
8. log.info("Meal entitlement: user={}, {} -> {}, validFrom={}, validUntil={}, by={}, source={}", ...)
9. return saved
```
`source` ∈ {`UI`, `BULK`, `API`}.

**2.3 — Consultas:** `getOrPending(userId)` (retorna o DTO com `PENDING` quando não há linha), `history(userId)`, `summary()` (contagens por status + total de alunos).

### Passo 3 — `MealEntitlementRepository`: +query de busca
Adicionar `@Query` **nativa** que faz `LEFT JOIN` de `app_users` com `meal_entitlements`, para que **alunos sem linha apareçam como PENDING** na listagem:
```sql
SELECT u.id, u.nome, u.turma,
       COALESCE(m.status, 'PENDING') AS status,
       m.valid_from, m.valid_until, m.note, m.updated_by, m.updated_at
FROM app_users u
LEFT JOIN meal_entitlements m ON m.user_id = u.id
WHERE u.tipo = 'ALUNO' AND u.ativo = true
  AND (:q IS NULL OR u.nome ILIKE CONCAT('%', :q, '%') OR u.id LIKE CONCAT('%', :q, '%'))
  AND (:turma IS NULL OR u.turma = :turma)
  AND (:status IS NULL OR COALESCE(m.status, 'PENDING') = :status)
ORDER BY u.nome
```
Paginada (`Pageable` + query de count). Retornar `List<Object[]>` ou uma projection — seguir o padrão já usado no projeto (há várias `nativeQuery` retornando `Object[]` em `AccessLogRepository`).

### Passo 4 — DTOs
- `MealEntitlementRequest` (entrada do PUT): `status` (`@NotNull EntitlementStatus`), `validFrom`, `validUntil` (`LocalDate`, opcionais), `note` (`@Size(max=255)`).
- `MealEntitlementDto` (saída): `userId`, `nome`, `turma`, `status`, `validFrom`, `validUntil`, `note`, `updatedBy`, `updatedAt`.
- `MealEntitlementHistoryDto`: `changedAt`, `changedBy`, `oldStatus`, `newStatus`, `oldValidFrom`, `oldValidUntil`, `newValidFrom`, `newValidUntil`, `note`, `source`.

### Passo 5 — `MealEntitlementController`
`@RestController @RequestMapping("/api/admin/meal-entitlements") @RequiredArgsConstructor`.

| Método | Rota | `@PreAuthorize` | Descrição |
|---|---|---|---|
| GET | `` | `@areaSecurity.can('cantine')` | Lista paginada. Params: `q`, `turma`, `status`, `page` (0), `size` (50, máx 200). **Inclui alunos sem linha como PENDING**. |
| GET | `/summary` | `@areaSecurity.can('cantine')` | `{authorized, notAuthorized, pending, totalStudents}` |
| GET | `/{userId}` | `@areaSecurity.can('cantine')` | Detalhe; sem linha → `{status:"PENDING"}` |
| GET | `/{userId}/history` | `@areaSecurity.can('cantine')` | Histórico desc |
| PUT | `/{userId}` | `hasRole('ADMIN')` **(ver nota)** | Upsert. `changedBy` = username do JWT, `source="UI"` |

⚠️ **Nota sobre a autorização do PUT:** a permissão granular `MEAL_ENTITLEMENT_WRITE` só existe a partir da **Fase F**. Nesta fase, proteger o PUT com `@PreAuthorize("hasRole('ADMIN')")`. A Fase F trocará para `hasRole('ADMIN') or @areaSecurity.hasPermission('MEAL_ENTITLEMENT_WRITE')`. **Deixe um comentário `// FASE F: trocar para hasPermission` na anotação.**

`changedBy` **sempre** do `SecurityContextHolder`, **nunca** do body (seguir o padrão de `AccessController.registerAccess`).

Tratamento de erro: `IllegalArgumentException` → 400 com `Map.of("error", msg)`, seguindo o padrão do projeto.

### Passo 6 — Integrar no `AccessDecisionService` (ponto 10.2)
No ponto marcado `// FASE C:` (após dedup, **antes** da janela de horário):
```
decision = mealEntitlementService.evaluate(userId, now.toLocalDate())

SE decision.effectiveStatus() == NOT_AUTHORIZED
   OU (decision.effectiveStatus() == AUTHORIZED E !decision.entitled()):   // fora de vigência
      mode = policy.meal-not-entitled          // default DENY
      SE DENY  → attempt(MEAL_NOT_ENTITLED, DENIED) ; RETURN
      SE OBSERV→ attempt(MEAL_NOT_ENTITLED, OBSERVATION) ; segue

SE decision.effectiveStatus() == PENDING:
      mode = policy.meal-pending               // default OBSERVATION no piloto
      SE DENY  → attempt(MEAL_NOT_ENTITLED, DENIED) ; RETURN
      SE OBSERV→ attempt(MEAL_NOT_ENTITLED, OBSERVATION) ; segue

SE entitled == true → segue normalmente (nenhuma tentativa registrada)
```
⚠️ **Ordem obrigatória (não inverter):** dedup → **entitlement** → janela de horário. Se um aluno sem direito também está fora de horário, o motivo que prevalece é `MEAL_NOT_ENTITLED` (mais grave e mais específico).
⚠️ **Aplica-se SOMENTE a `action == ENTRADA` em pontos `REFEI*`/`CANTINA*`.** Saída da cantina **não** avalia entitlement. Biblioteca, enfermaria e portão **não** avaliam entitlement.

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. **Ausência de linha = `PENDING`**, jamais negação automática.
2. **Nunca criar linha automaticamente** no webhook — só via API/UI/bulk.
3. **Toda alteração gera evento de histórico na mesma transação.** Sem exceção.
4. **Nenhum dado financeiro.** `note` é observação administrativa; não colocar valores, boletos, status de pagamento.
5. `daysOfWeek` e `mealType` **ignorados** nesta fase (campos reservados).
6. Ordem das regras: dedup → entitlement → horário.
7. Entitlement **não** se aplica a SAIDA, BIBLIO, ENFERM, PORT*.
8. `changedBy` sempre do JWT.
9. `meal_count` de `app_users` **não** é tocado.
10. Contagem de refeições continua derivada de `access_logs` — como negadas não entram lá, a contagem fica correta automaticamente.

## CRITÉRIOS DE ACEITE
- [ ] `mvn clean compile` verde; backend sobe.
- [ ] Aluno **sem linha** → `GET /{userId}` retorna `PENDING`; a listagem o inclui.
- [ ] `PUT` com status `AUTHORIZED` → grava + cria evento de histórico com `changedBy` correto.
- [ ] `PUT` com `validFrom > validUntil` → 400.
- [ ] `PUT` para `userId` inexistente → 400 "Aluno não encontrado".
- [ ] `GET /{userId}/history` mostra a mudança (old→new, quem, quando, source=UI).
- [ ] ★ Aluno `NOT_AUTHORIZED` + evento de face na cantina → **0 `access_logs`** + 1 attempt `MEAL_NOT_ENTITLED` (`authorization_result=DENIED`).
- [ ] ★ `/api/access/refectory/meals` **não** conta esse aluno.
- [ ] Aluno `AUTHORIZED` vigente → fluxo normal, `access_log` gerado, **0 attempts**.
- [ ] Aluno `AUTHORIZED` com `validUntil` no passado → attempt `MEAL_NOT_ENTITLED`.
- [ ] Aluno `PENDING` com política OBSERVATION → `access_log` **+** attempt OBSERVATION.
- [ ] `magbo.policy.meal-not-entitled=OBSERVATION` → mesmo aluno passa a gerar log + attempt (**sem recompilar**).
- [ ] Saída da cantina (SAIDA) **não** avalia entitlement.
- [ ] Regressão: aluno sem nenhum entitlement e política PENDING=OBSERVATION → sistema se comporta como antes.

## VALIDAÇÕES
```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login -ContentType "application/json" -Body '{"username":"admin","password":"admin1234"}'
$h = @{ Authorization = "Bearer $($login.token)" }

# 1. Consulta de aluno sem linha → PENDING
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/meal-entitlements/9999999" -Headers $h

# 2. Marcar como NOT_AUTHORIZED
Invoke-RestMethod -Method Put -Uri "http://localhost:8080/api/admin/meal-entitlements/9999999" -Headers $h -ContentType "application/json" -Body '{"status":"NOT_AUTHORIZED","note":"teste de mesa"}'

# 3. Passar o rosto no terminal → deve gerar attempt, NÃO access_log
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT id,user_id,denial_reason,authorization_result FROM access_attempts ORDER BY id DESC LIMIT 2;"
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT COUNT(*) FROM access_logs WHERE user_id='9999999' AND timestamp::date=CURRENT_DATE;"

# 4. Refeições NÃO devem contar
Invoke-RestMethod -Uri "http://localhost:8080/api/access/refectory/meals" -Headers $h

# 5. Histórico
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/meal-entitlements/9999999/history" -Headers $h

# 6. Reverter para AUTHORIZED e conferir fluxo normal
Invoke-RestMethod -Method Put -Uri "http://localhost:8080/api/admin/meal-entitlements/9999999" -Headers $h -ContentType "application/json" -Body '{"status":"AUTHORIZED","validUntil":"2030-12-31"}'
```

## CHECKLIST DE CONCLUSÃO
- [ ] `MealEntitlementService` com `evaluate` + `upsert` transacional + histórico
- [ ] `daysOfWeek`/`mealType` ignorados e documentados como reservados
- [ ] Query com LEFT JOIN incluindo alunos sem linha como PENDING
- [ ] 4 DTOs criados com Bean Validation
- [ ] `MealEntitlementController` com 5 rotas; PUT com `// FASE F:` comentado
- [ ] `changedBy` do JWT, nunca do body
- [ ] Integração no `AccessDecisionService` na posição correta (após dedup, antes do horário)
- [ ] Só ENTRADA em REFEI*/CANTINA*
- [ ] `mvn clean compile` verde
- [ ] **Nenhum commit**

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| Interpretar PENDING como negação por padrão | **Alta** (viola exigência do cliente) | `PENDING` só nega se a política mandar; default do piloto = OBSERVATION |
| Ordem das regras invertida (horário antes de entitlement) | Média | Motivo errado no relatório; seguir a ordem literal do passo 6 |
| Alterar entitlement sem gravar histórico | **Alta** (auditoria quebrada) | `@Transactional` cobrindo save + event |
| Aplicar entitlement na saída ou em outros setores | Média | Guard explícito: `isRefectory && action==ENTRADA` |
| Query LEFT JOIN pesada com 923 alunos | Baixa | Paginada; índice de PK já existe |

## ROLLBACK
| Nível | Ação | Perda |
|---|---|---|
| Comportamento | `magbo.policy.meal-not-entitled=OBSERVATION` e `meal-pending=OBSERVATION` → nenhum aluno é negado; sistema volta a registrar tudo | Nenhuma |
| Código | `git revert` do commit da fase | Nenhuma |
| Dados | `meal_entitlements` e `meal_entitlement_events` ficam inertes | Nenhuma |

## AO TERMINAR
1. `mvn clean compile` verde. 2. Checklist preenchido. 3. Listar arquivos. 4. Confirmar: "a ordem dedup→entitlement→horário está implementada literalmente". 5. Reportar divergências. 6. **NÃO commitar.**
