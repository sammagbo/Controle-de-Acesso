# PROMPT — FASE D: Autorização de Saída (Student Exit Permissions)

## CONTEXTO DO PROJETO
**MAGBO Access Control** — Lycée Molière (Rio). Terminais Hikvision (face + cartão) → webhook → Spring Boot 3.2.5/Java 17 → PostgreSQL 16 → Electron/React. Monorepo: `backend/` = Spring Boot (`com.magbo.access`).
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia as seções 3.6, 4.5 e 7.3**.

### CONTEXTO DE NEGÓCIO
Alunos **não podem sair da escola durante o horário de aula** sem autorização. O aluno se identifica por rosto ou cartão no portão; o sistema precisa saber se ele **pode** sair. A autorização pode ser permanente (casos específicos), recorrente (certos dias), por intervalo de datas, ou pontual (uma única saída).

**Exigência de auditoria do cliente:** sempre saber **quem autorizou**, **por quê**, **até quando**, **quem revogou** e **quando**.

### FATOS DE HARDWARE (validados)
- `subEventType` 75=face, 1=cartão, 8=negado. Mesmo `employeeNoString` para face e cartão.
- IDs String com zeros à esquerda. Nunca truncar.
- **O webhook é pós-evento. O backend NÃO impede a saída física.** `DENY` = não registra saída efetiva + registra tentativa. O aluno **sai fisicamente** de qualquer forma enquanto não houver bloqueio via HikCentral. Isso é esperado e medido pelo KPI de divergência.
- **A direção do portão vem SEMPRE do DoorMapping**, nunca inferida do histórico.

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`.
- ❌ ★ **NUNCA** tentativa negada de saída alterar a presença/localização do aluno. Ele **permanece presente** na escola.
- ❌ **NUNCA** deletar permissão (`DELETE` não existe). Revogação é **soft** (`status=REVOKED` + quem/quando).
- ❌ **NUNCA** inferir direção por histórico.
- ❌ **NUNCA** consumir permissão `SINGLE` numa tentativa negada — só em saída efetiva.
- ✅ Contradição com o código real → **PARE e reporte**.

---

## OBJETIVO DA FASE D
1. Serviço de avaliação de permissão de saída.
2. Integrar em `PORT*` + `SAIDA`.
3. Endpoints de cadastro, consulta e revogação, com auditoria completa.

## DEPENDÊNCIAS
**Fases A, B e C concluídas.** Requer: `StudentExitPermission`, `StudentExitPermissionRepository`, `ExitPermissionType`, `ExitPermissionStatus`, `PolicyProperties`, `AccessDecisionService` com o ponto `// FASE D:` marcado.

---

## ARQUIVOS
### Novos (5)
```
backend/src/main/java/com/magbo/access/services/ExitPermissionService.java
backend/src/main/java/com/magbo/access/dto/ExitDecision.java              (record)
backend/src/main/java/com/magbo/access/dto/ExitPermissionRequest.java
backend/src/main/java/com/magbo/access/dto/ExitPermissionDto.java
backend/src/main/java/com/magbo/access/controllers/ExitPermissionController.java
```
### Alterados (2)
```
backend/src/main/java/com/magbo/access/services/AccessDecisionService.java              (ponto 11)
backend/src/main/java/com/magbo/access/repositories/StudentExitPermissionRepository.java (+query filtrada)
```
### Ler antes
```
services/AccessDecisionService.java · models/StudentExitPermission.java
config/AreaMapping.java  ← como PORT1/2/3 mapeiam para "portail"
controllers/MealEntitlementController.java  ← padrão criado na Fase C (seguir o mesmo estilo)
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — `ExitDecision` (record)
```java
public record ExitDecision(
    boolean allowed,
    DenialReason reason,               // EXIT_NOT_AUTHORIZED | OUTSIDE_EXIT_WINDOW | null
    Long permissionId,                 // permissão que autorizou (null se negado)
    ExitPermissionType permissionType  // null se negado
) {}
```

### Passo 2 — `ExitPermissionService`
`@Service @RequiredArgsConstructor @Slf4j`. Depende de `StudentExitPermissionRepository`, `UserRepository`.

**2.1 — Avaliação (usada pelo webhook):**
```java
public ExitDecision evaluate(String userId, LocalDateTime now)
```
Lógica **exata**:
```
1. actives = repo.findByUserIdAndStatus(userId, ACTIVE)
2. SE actives.isEmpty() → ExitDecision(false, EXIT_NOT_AUTHORIZED, null, null)
3. Para cada permissão p em actives, testar validade AGORA:
   3.1 Janela horária (aplica a TODOS os tipos):
       SE p.startTime != null && p.endTime != null:
          SE now.toLocalTime() < p.startTime OU > p.endTime → inválida
       (se ambos null → qualquer hora)
   3.2 Por tipo:
       PERMANENT  → válida (ignora datas e dias; só a janela horária, se houver)
       DATE_RANGE → exige validFrom/validUntil:
                    hoje >= validFrom E hoje <= validUntil (inclusive) → válida
       RECURRING  → dia da semana atual (ISO: 1=segunda..7=domingo) ∈ p.daysOfWeek (CSV)
                    E, se validFrom/validUntil preenchidos, hoje dentro do intervalo → válida
       SINGLE     → válida se status==ACTIVE (ainda não usada)
4. SE alguma válida → ExitDecision(true, null, p.getId(), p.getPermissionType())
                      (usar a PRIMEIRA válida encontrada; ordenar por id para ser determinístico)
5. SE existem permissões ACTIVE mas NENHUMA válida agora
   → ExitDecision(false, OUTSIDE_EXIT_WINDOW, null, null)
```
⚠️ **Distinção obrigatória (exigência do cliente):** `EXIT_NOT_AUTHORIZED` = não tem **nenhuma** permissão ativa. `OUTSIDE_EXIT_WINDOW` = tem permissão, mas **fora** da data/dia/hora. **Nunca agrupar os dois** — são situações operacionalmente diferentes e aparecem separadas nos relatórios.

**2.2 — Consumo de permissão SINGLE:**
```java
@Transactional
public void consumeIfSingle(Long permissionId)
```
Se a permissão for `SINGLE` → `status = USED`, `usedAt = now()`. Se não for SINGLE → no-op.
⚠️ **Chamado SOMENTE quando a saída é efetivamente registrada** (na mesma transação do `access_log`). Nunca em tentativa negada.

**2.3 — CRUD:**
```java
@Transactional
public StudentExitPermission create(ExitPermissionRequest req, String createdBy)
```
Validações (lançar `IllegalArgumentException` com mensagem clara):
- `userId` existe em `app_users` → senão "Aluno não encontrado: {id}"
- `reason` obrigatório e não-branco
- `DATE_RANGE` → `validFrom` e `validUntil` obrigatórios; `validFrom <= validUntil`
- `RECURRING` → `daysOfWeek` obrigatório; formato CSV de valores 1..7, sem repetição, sem espaços inválidos
- `startTime`/`endTime` → se um presente, ambos obrigatórios; `startTime < endTime`
- `PERMANENT`/`SINGLE` → datas/dias opcionais
- `status` inicial = `ACTIVE` (nunca aceitar do body)
- `createdBy` = username do JWT (**nunca** do body)

```java
@Transactional
public StudentExitPermission revoke(Long id, String revokedBy, String note)
```
- Permissão inexistente → `IllegalArgumentException`
- Já `REVOKED` → `IllegalArgumentException("Permissão já revogada")`
- Seta `status=REVOKED`, `revokedBy`, `revokedAt=now()`, e concatena/atualiza `note`
- ❌ **Nunca** deletar a linha.

Consultas: `findByUser(userId)` (histórico completo desc), `findActive()`, `findFiltered(...)` paginada.

### Passo 3 — `StudentExitPermissionRepository`: +query filtrada
`@Query` paginada com filtros opcionais (`userId`, `status`, `permissionType`, intervalo de `createdAt`), seguindo o padrão de `findFilteredLogs` de `AccessLogRepository` (que usa `:#{#param == null} = true OR ...`).

### Passo 4 — DTOs
- `ExitPermissionRequest`: `userId` `@NotBlank`; `permissionType` `@NotNull`; `reason` `@NotBlank @Size(max=255)`; `validFrom`, `validUntil` (`LocalDate`); `startTime`, `endTime` (`LocalTime`); `daysOfWeek` (`String`); `note` (`@Size(max=255)`).
  ⚠️ **Não** incluir `status`, `createdBy`, `revokedBy` — são do servidor.
- `ExitPermissionDto` (saída): todos os campos + `nome` e `turma` do aluno (JOIN ou lookup) para a UI.

### Passo 5 — `ExitPermissionController`
`@RestController @RequestMapping("/api/admin/exit-permissions")`.

| Método | Rota | `@PreAuthorize` | Descrição |
|---|---|---|---|
| GET | `` | `@areaSecurity.can('portail')` | Paginado; filtros `userId`, `status`, `type`, `from`, `to` |
| GET | `/active` | `@areaSecurity.can('portail')` | Todas ACTIVE |
| GET | `/user/{userId}` | `@areaSecurity.can('portail')` | Histórico completo do aluno |
| POST | `` | `hasRole('ADMIN')` **(ver nota)** | Cria. `createdBy` do JWT |
| POST | `/{id}/revoke` | `hasRole('ADMIN')` **(ver nota)** | Body `{note}`. Soft revoke |
| DELETE | `/{id}` | — | ❌ **NÃO IMPLEMENTAR** |

⚠️ **Nota:** a permissão granular `EXIT_PERMISSION_WRITE` só existe na **Fase F**. Aqui usar `hasRole('ADMIN')` + comentário `// FASE F: trocar para hasPermission('EXIT_PERMISSION_WRITE')`.

### Passo 6 — Integrar no `AccessDecisionService` (ponto 11)
No ponto `// FASE D:` (após as regras da cantina, antes de gravar o `access_log`):
```
isGate = pid.startsWith("PORT")

SE isGate E action == SAIDA:
   exitDecision = exitPermissionService.evaluate(userId, now)
   SE !exitDecision.allowed():
      mode = policy.exit-not-authorized        // default DENY
      SE DENY:
         attempt(exitDecision.reason(), DENIED)    // EXIT_NOT_AUTHORIZED ou OUTSIDE_EXIT_WINDOW
         RETURN                                     // ★ presença NÃO muda
      SE OBSERVATION:
         attempt(exitDecision.reason(), OBSERVATION)
         // segue e grava o access_log
   SENÃO:
      // permissão válida → guardar o id para consumir após gravar o log
      consumedPermissionId = exitDecision.permissionId()

... grava access_log ...

SE consumedPermissionId != null:
   exitPermissionService.consumeIfSingle(consumedPermissionId)   // MESMA transação
```
⚠️ `PORT*` + **ENTRADA** → **nenhuma regra nova**. Registra normalmente (aluno chegando na escola).
⚠️ O consumo de SINGLE acontece **depois** de gravar o log, na mesma transação (`process` já é `@Transactional`).

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. ★ Tentativa negada de saída **não** grava `access_log` → presença (`countPresentToday`, ocupação) **inalterada**. Isso é garantido estruturalmente (attempts em tabela separada), mas confirme no teste.
2. `EXIT_NOT_AUTHORIZED` ≠ `OUTSIDE_EXIT_WINDOW`. Nunca agrupar.
3. Revogação é **soft**. `DELETE` não existe.
4. `SINGLE` só vira `USED` em saída efetiva.
5. `createdBy`/`revokedBy` sempre do JWT.
6. `reason` obrigatório na criação.
7. Direção sempre do DoorMapping.
8. `PORT*`+ENTRADA sem regra nova.

## CRITÉRIOS DE ACEITE
- [ ] `mvn clean compile` verde; backend sobe.
- [ ] POST cria permissão `ACTIVE` com `createdBy` do JWT e `reason` gravado.
- [ ] POST sem `reason` → 400. `DATE_RANGE` sem datas → 400. `RECURRING` sem `daysOfWeek` → 400. `startTime` sem `endTime` → 400.
- [ ] `POST /{id}/revoke` → `status=REVOKED`, `revokedBy`, `revokedAt`; linha **não** deletada; revogar de novo → 400.
- [ ] ★ Aluno **sem permissão** + face em `PORT1/SAIDA` → **0 `access_logs`** + 1 attempt `EXIT_NOT_AUTHORIZED` · `countPresentToday` **inalterado**.
- [ ] Aluno com `DATE_RANGE` **fora** do intervalo → attempt `OUTSIDE_EXIT_WINDOW` (**não** EXIT_NOT_AUTHORIZED).
- [ ] Aluno com `PERMANENT` ACTIVE → `access_log` SAIDA normal, 0 attempts.
- [ ] `SINGLE` → 1ª saída grava log e marca `USED`; 2ª tentativa → attempt `EXIT_NOT_AUTHORIZED`.
- [ ] `RECURRING` no dia certo → permitido; dia errado → `OUTSIDE_EXIT_WINDOW`.
- [ ] Janela horária: dentro → permitido; fora → `OUTSIDE_EXIT_WINDOW`; limites exatos inclusive.
- [ ] `PORT1` + **ENTRADA** → log normal, nenhuma regra aplicada.
- [ ] `magbo.policy.exit-not-authorized=OBSERVATION` → passa a gravar log + attempt, sem recompilar.
- [ ] Cantina e biblioteca **não** afetadas.

## VALIDAÇÕES
```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login -ContentType "application/json" -Body '{"username":"admin","password":"admin1234"}'
$h = @{ Authorization = "Bearer $($login.token)" }

# 1. Apontar o mapping de teste para PORT1/SAIDA (o Sam faz)
# 2. Sem permissão → passar o rosto → attempt, sem log
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT id,user_id,point_id,denial_reason,authorization_result FROM access_attempts ORDER BY id DESC LIMIT 2;"

# 3. Criar permissão SINGLE
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/admin/exit-permissions" -Headers $h -ContentType "application/json" -Body '{"userId":"9999999","permissionType":"SINGLE","reason":"consulta médica - teste de mesa"}'

# 4. Passar o rosto → access_log SAIDA + permissão vira USED
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT id,status,used_at,created_by,reason FROM student_exit_permissions ORDER BY id DESC LIMIT 1;"

# 5. Passar de novo → attempt EXIT_NOT_AUTHORIZED
# 6. Revogar
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/admin/exit-permissions/1/revoke" -Headers $h -ContentType "application/json" -Body '{"note":"teste"}'
```

## CHECKLIST DE CONCLUSÃO
- [ ] `ExitPermissionService` com `evaluate` (4 tipos + janela horária), `consumeIfSingle`, `create`, `revoke`
- [ ] Distinção EXIT_NOT_AUTHORIZED × OUTSIDE_EXIT_WINDOW implementada
- [ ] Validações compostas por tipo
- [ ] `createdBy`/`revokedBy` do JWT
- [ ] Sem `DELETE`
- [ ] Integração no ponto 11 do `AccessDecisionService`; PORT*+ENTRADA intacto
- [ ] `consumeIfSingle` só após log efetivo, mesma transação
- [ ] `mvn clean compile` verde · **Nenhum commit**

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| ★ Tentativa negada alterar presença | **CRÍTICA** | Attempts em tabela separada; `RETURN` antes do save; teste explícito de `countPresentToday` |
| Agrupar os dois motivos de negação | Alta (relatório errado) | Lógica literal do passo 2.1 |
| `SINGLE` consumida em tentativa negada | Alta | `consumeIfSingle` só após o save do log |
| Bordas de horário (`isBefore`/`isAfter` excluem o limite) | Média | Definir **inclusive** nos dois extremos; testar limites exatos na Fase I |
| `daysOfWeek` com formato inválido | Média | Validar no create; parse defensivo no evaluate (valor inválido → permissão não bate, nunca exception no webhook) |
| Deletar em vez de revogar | Alta | `DELETE` não implementado |

## ROLLBACK
| Nível | Ação | Perda |
|---|---|---|
| Comportamento | `magbo.policy.exit-not-authorized=OBSERVATION` → saídas voltam a ser registradas normalmente | Nenhuma |
| Código | `git revert` | Nenhuma |
| Dados | `student_exit_permissions` fica inerte | Nenhuma |

## AO TERMINAR
1. Compile. 2. Checklist. 3. Listar arquivos. 4. Confirmar: "tentativa negada de saída não grava access_log e não altera presença". 5. **NÃO commitar.**
