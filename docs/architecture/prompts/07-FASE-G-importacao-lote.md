# PROMPT — FASE G: Importação em Lote de Direitos à Refeição

## CONTEXTO DO PROJETO
**MAGBO Access Control** — Lycée Molière (Rio). Spring Boot 3.2.5/Java 17 → PostgreSQL 16. `backend/` = Spring Boot (`com.magbo.access`).
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia a seção 9**.

### CONTEXTO DE NEGÓCIO
São **923 alunos**. Exigência do cliente: *"Não quero cadastrar manualmente direitos à refeição de 923 alunos."* A secretaria/cantina precisa importar uma planilha.

Exigência crítica: *"Nunca sobrescrever dados válidos silenciosamente."*

### ★ DECISÃO ARQUITETURAL JÁ TOMADA — CARTÕES NÃO SÃO IMPORTADOS
Validado com hardware em 14/07: **o terminal traduz o cartão para o `employeeNoString` da pessoa internamente**. O número do cartão (`cardNo`) **nunca** chega ao backend. Portanto:
- ❌ **NÃO** criar coluna de cartão em `app_users`.
- ❌ **NÃO** criar tabela de credenciais.
- ❌ **NÃO** adicionar cartão a nenhum importador.
- ✅ O vínculo cartão↔pessoa vive no terminal/HikCentral. Para os 923, isso é distribuído pelo HikCentral (procedimento operacional), não pelo MAGBO.
**Não questione nem "melhore" essa decisão. Está fechada e documentada no ADR-002.**

### PADRÃO EXISTENTE A SEGUIR (ler antes)
`POST /api/users/bulk` em `UserController` já implementa bulk import de pessoas com: ordenação prévia, validação por linha, erro por linha (`errors` com índice), contadores, e a regra *"ID já existe — bulk não sobrescreve"*. **Siga esse mesmo estilo.**

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`.
- ❌ **NUNCA** sobrescrever silenciosamente.
- ❌ **NUNCA** deixar uma linha ruim derrubar o lote inteiro.
- ❌ **NUNCA** alterar dado sem gravar histórico.
- ❌ **NUNCA** importar cartão.
- ❌ **NUNCA** dados financeiros.
- ✅ Contradição com o código → **PARE e reporte**.

---

## OBJETIVO DA FASE G
Endpoint de importação em lote de `meal_entitlements` com relatório completo e sem sobrescrita silenciosa.

## DEPENDÊNCIAS
**Fases A–F concluídas.** Requer `MealEntitlementService.upsert(...)` (Fase C) e `hasPermission` (Fase F).

---

## ARQUIVOS
### Novos (2)
```
backend/src/main/java/com/magbo/access/dto/MealEntitlementBulkItem.java
backend/src/main/java/com/magbo/access/dto/BulkResultDto.java
```
### Alterados (2)
```
backend/src/main/java/com/magbo/access/controllers/MealEntitlementController.java   (+POST /bulk)
backend/src/main/java/com/magbo/access/services/MealEntitlementService.java         (+método bulk)
```
### Ler antes
```
controllers/UserController.java  ← método createUsersBulk: COPIAR O ESTILO (erros por linha, contadores)
services/MealEntitlementService.java (Fase C)
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — `MealEntitlementBulkItem` (DTO de entrada)
```java
String userId;            // obrigatório
String status;            // obrigatório: AUTHORIZED | NOT_AUTHORIZED | PENDING
LocalDate validFrom;      // opcional
LocalDate validUntil;     // opcional
String note;              // opcional, máx 255
```
⚠️ `status` como **String** (não enum) no DTO de entrada — assim um valor inválido vira **erro de linha** com mensagem clara, em vez de 400 do Jackson que derruba o lote inteiro. Converter para enum dentro do processamento, capturando `IllegalArgumentException`.

### Passo 2 — `BulkResultDto`
```java
int totalRecebido;
int totalCriado;
int totalAtualizado;
int totalIgnorado;
int totalFalhas;
List<Map<String,String>> erros;   // [{linha, userId, erro}]
```
**Todos os 5 contadores são obrigatórios** (exigência explícita do cliente).

### Passo 3 — `MealEntitlementService.importBulk(...)`
```java
public BulkResultDto importBulk(List<MealEntitlementBulkItem> items, boolean overwrite, String changedBy)
```
Lógica **exata**:
```
result = new BulkResultDto(); result.totalRecebido = items.size()

PARA cada item (índice i, linha = i+1):
   TRY:
      1. userId obrigatório e não-branco → senão "ID obrigatório"
      2. Aluno existe em app_users? → senão "Aluno não encontrado"
      3. status → EntitlementStatus.valueOf(status.trim().toUpperCase())
         (IllegalArgumentException → "Status inválido: {v}. Válidos: AUTHORIZED, NOT_AUTHORIZED, PENDING")
      4. validFrom > validUntil → "Data inicial posterior à data final"
      5. existing = repo.findById(userId)
      6. SE existing.isPresent() E !overwrite:
            totalIgnorado++
            erros.add({linha, userId, "Já existe — use overwrite=true para atualizar"})
            CONTINUE                                    // ⚠️ NÃO sobrescreve
      7. upsert(userId, status, validFrom, validUntil, note, changedBy, source="BULK")
         SE existia → totalAtualizado++ ; SENÃO → totalCriado++
   CATCH (Exception e):
      totalFalhas++
      erros.add({linha, userId, e.getMessage()})
```
⚠️ **Transação por linha**, não por lote. Usar `@Transactional(propagation = Propagation.REQUIRES_NEW)` no `upsert`, **ou** não anotar o `importBulk` e deixar cada `upsert` na sua transação. Uma linha ruim **não** pode desfazer as boas.
⚠️ Cada `upsert` efetivo grava `meal_entitlement_events` com `source="BULK"` — histórico obrigatório mesmo em importação.
⚠️ `totalIgnorado` (já existe, sem overwrite) é **diferente** de `totalFalhas` (erro real). Não misturar.

Ao fim: `log.info("Bulk meal entitlements by {}: recebido={}, criado={}, atualizado={}, ignorado={}, falhas={}", ...)`.

### Passo 4 — Endpoint
```java
@PostMapping("/bulk")
@PreAuthorize("hasRole('ADMIN') or @areaSecurity.hasPermission('MEAL_ENTITLEMENT_WRITE')")
public ResponseEntity<BulkResultDto> importBulk(
        @RequestBody List<MealEntitlementBulkItem> items,
        @RequestParam(defaultValue = "false") boolean overwrite)
```
- `changedBy` = username do JWT.
- **Limite de tamanho:** máx **2000** itens por requisição → senão 400 "Lote muito grande (máx 2000)". (923 alunos cabem folgado; protege contra abuso.)
- Sempre HTTP **200** com o relatório, mesmo com falhas — o relatório **é** a resposta. Só 400 para lote vazio/nulo/grande demais.

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. **Sem sobrescrita silenciosa.** Existente + sem `overwrite=true` → ignorado e **reportado**.
2. Transação por linha.
3. Todo upsert efetivo grava histórico com `source="BULK"`.
4. Os 5 contadores sempre presentes.
5. `ignorado` ≠ `falha`.
6. `changedBy` do JWT.
7. Cartão não entra.
8. `status` inválido = erro de linha, não 400 do lote.

## CRITÉRIOS DE ACEITE
- [ ] `mvn clean compile` verde.
- [ ] Lote com 3 linhas válidas (alunos novos) → `totalCriado=3`, demais 0.
- [ ] Repetir o **mesmo** lote sem `overwrite` → `totalIgnorado=3`, `totalCriado=0`, 3 entradas em `erros` com o motivo.
- [ ] Repetir com `?overwrite=true` → `totalAtualizado=3`.
- [ ] Lote misto (1 válida, 1 aluno inexistente, 1 status inválido, 1 data invertida) → `totalCriado=1`, `totalFalhas=3`, 3 erros com **linha e motivo corretos**, e a linha válida **persistida** (prova da transação por linha).
- [ ] Cada criação/atualização gera evento com `source=BULK` e `changed_by` correto.
- [ ] Operador sem `MEAL_ENTITLEMENT_WRITE` → 403.
- [ ] Lote vazio → 400. Lote com 2001 itens → 400.
- [ ] Nenhum registro de `access_logs` tocado.

## VALIDAÇÕES
```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login -ContentType "application/json" -Body '{"username":"admin","password":"admin1234"}'
$h = @{ Authorization = "Bearer $($login.token)" }

# 1. Lote válido
$body = '[{"userId":"9999999","status":"AUTHORIZED","validUntil":"2030-12-31"},{"userId":"0001764","status":"NOT_AUTHORIZED","note":"teste"},{"userId":"0003906","status":"PENDING"}]'
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/admin/meal-entitlements/bulk" -Headers $h -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 3

# 2. Mesmo lote de novo (sem overwrite) → todos ignorados
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/admin/meal-entitlements/bulk" -Headers $h -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 3

# 3. Com overwrite
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/admin/meal-entitlements/bulk?overwrite=true" -Headers $h -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 3

# 4. Lote misto
$mix = '[{"userId":"9999999","status":"AUTHORIZED"},{"userId":"0000000","status":"AUTHORIZED"},{"userId":"0001764","status":"XPTO"},{"userId":"0003906","status":"AUTHORIZED","validFrom":"2030-01-01","validUntil":"2020-01-01"}]'
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/admin/meal-entitlements/bulk?overwrite=true" -Headers $h -ContentType "application/json" -Body $mix | ConvertTo-Json -Depth 3

# 5. Histórico com source=BULK
docker exec magbo-postgres psql -U magbo -d magbodb -c "SELECT user_id,old_status,new_status,changed_by,source FROM meal_entitlement_events ORDER BY id DESC LIMIT 5;"
```

## CHECKLIST DE CONCLUSÃO
- [ ] `MealEntitlementBulkItem` com `status` como String
- [ ] `BulkResultDto` com os 5 contadores + erros por linha
- [ ] `importBulk` com transação **por linha**
- [ ] `overwrite` default `false`; ignorado ≠ falha
- [ ] Histórico com `source="BULK"`
- [ ] Endpoint com limite de 2000 e `@PreAuthorize` da Fase F
- [ ] Estilo seguindo `createUsersBulk`
- [ ] Nenhum campo de cartão em lugar nenhum
- [ ] `mvn clean compile` verde · **Nenhum commit**

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| Transação de lote única → 1 erro desfaz tudo | **Alta** | `REQUIRES_NEW` por linha; teste do lote misto prova |
| Sobrescrita silenciosa | **Alta** (exigência do cliente) | `overwrite` explícito; ignorados reportados |
| `status` inválido virar 400 do Jackson | Média | String no DTO + `valueOf` capturado |
| Importação sem histórico | Alta | `upsert` já grava; **não** criar caminho alternativo que pule o histórico |
| Lote gigante travar o banco | Baixa | Limite 2000 |

## ROLLBACK
| Nível | Ação | Perda |
|---|---|---|
| Código | `git revert` → endpoint some; entitlements criados permanecem (dados válidos) | Nenhuma |
| Dados | Se um lote errado foi aplicado: o **histórico** (`meal_entitlement_events`) permite reconstruir os valores anteriores manualmente | — |
⚠️ É por isso que o histórico é obrigatório em todo upsert: ele **é** o mecanismo de recuperação de uma importação equivocada.

## AO TERMINAR
1. Compile. 2. Checklist. 3. Confirmar: "transação por linha — uma falha não desfaz as linhas boas". 4. **NÃO commitar.**
