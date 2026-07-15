# PROMPT — FASE F: Permissões Granulares de Operador

## CONTEXTO DO PROJETO
**MAGBO Access Control** — Lycée Molière (Rio). Hikvision → webhook → Spring Boot 3.2.5/Java 17 → PostgreSQL 16 → Electron/React. `backend/` = Spring Boot (`com.magbo.access`).
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia a seção 8**.

### CONTEXTO DE NEGÓCIO
Exigência do cliente: *"Precisamos de permissões de operador. Nem todo usuário administrativo deve alterar esses dados."* Hoje o sistema tem dois níveis: `Role` (ADMIN/OPERATOR) e `setoresPermitidos` (CSV de setores: quem pode operar a cantina, a portaria etc.). Isso governa **leitura e operação por setor** — mas não distingue "ver o direito à refeição" de "**alterar** o direito à refeição".

Esta fase adiciona um terceiro eixo: **permissões granulares de escrita**.

### MODELO ATUAL (ler e entender antes de tocar)
- `SystemUser.role` → `ADMIN` | `OPERATOR`.
- `SystemUser.setoresPermitidos` → CSV; `"*"` = todos. Ex.: `"BIBLIO"`, `"REFEI1,REFEI2"`.
- `SystemUser.canOperateSector(pointId)` → lógica de CSV com `*`.
- `AreaSecurity.can(area)` (bean `@Component("areaSecurity")`) → **ADMIN sempre passa** (bypass via authority, sem hit no banco); senão consulta o `SystemUser` e reusa `canOperateSector`.
- Uso: `@PreAuthorize("@areaSecurity.can('cantine')")`.
- **Fase A já adicionou** a coluna `permissoes` e o helper `SystemUser.hasPermission(String)`.

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`.
- ❌ ★ **NUNCA** remover acesso de um operador existente. Todos têm `permissoes = null` hoje — isso **não pode** quebrar nada que já funciona.
- ❌ **NUNCA** alterar a lógica de `canOperateSector` nem de `can(area)`.
- ❌ **NUNCA** exigir permissão granular para **leitura** — só para **escrita** de entitlements e permissões de saída.
- ✅ Contradição com o código → **PARE e reporte**.

---

## OBJETIVO DA FASE F
1. `AreaSecurity.hasPermission(String)`.
2. Trocar os `@PreAuthorize` provisórios (`hasRole('ADMIN')`) das Fases C, D e E pelas permissões granulares.
3. CRUD de operadores passa a aceitar/retornar `permissoes`.

## DEPENDÊNCIAS
**Fases A–E concluídas.** Requer `SystemUser.permissoes` + `hasPermission()` (Fase A) e os controllers com os comentários `// FASE F:` (Fases C, D, E).

---

## ARQUIVOS
### Alterados (5–6)
```
backend/src/main/java/com/magbo/access/security/AreaSecurity.java                    (+hasPermission)
backend/src/main/java/com/magbo/access/controllers/MealEntitlementController.java    (PUT)
backend/src/main/java/com/magbo/access/controllers/ExitPermissionController.java     (POST, revoke)
backend/src/main/java/com/magbo/access/controllers/AccessAttemptController.java      (GET, /stats)
backend/src/main/java/com/magbo/access/controllers/SystemUserController.java         (aceitar/retornar permissoes)
backend/src/main/java/com/magbo/access/dto/<DTO de SystemUser>                       (+campo permissoes)
```
⚠️ **Descubra o nome real** do controller/DTO de operadores (`grep -rn "system-users" backend/src/main/java`). Não presuma.

### Ler antes
```
security/AreaSecurity.java · models/SystemUser.java (canOperateSector + hasPermission)
controllers/<SystemUserController> + seus DTOs
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — `AreaSecurity.hasPermission(String)`
Adicionar o método **espelhando exatamente** a estrutura de `can(String area)`:
```java
/**
 * Verifica permissão granular de ESCRITA (ex.: MEAL_ENTITLEMENT_WRITE).
 * ADMIN sempre passa. Operadores precisam da permissão listada em SystemUser.permissoes ("*" = todas).
 * Permissões granulares NÃO governam leitura — leitura continua por setor (can(area)).
 */
public boolean hasPermission(String permission) {
    1. auth = SecurityContextHolder...; se null ou !isAuthenticated() → false
    2. se authorities contém "ROLE_ADMIN" → true          // bypass, sem hit no banco
    3. user = systemUserRepository.findByUsername(auth.getName()).orElse(null); se null → false
    4. return user.hasPermission(permission);              // reusa a lógica da entidade
}
```
⚠️ **Não** alterar `can(String area)`.

### Passo 2 — Constantes de permissão
Criar `com.magbo.access.security.Permissions` (classe final, construtor privado, só constantes):
```java
public static final String MEAL_ENTITLEMENT_WRITE = "MEAL_ENTITLEMENT_WRITE";
public static final String EXIT_PERMISSION_WRITE  = "EXIT_PERMISSION_WRITE";
public static final String ATTEMPTS_READ          = "ATTEMPTS_READ";
```
(Usar nas validações do CRUD; nas anotações `@PreAuthorize` o valor vai literal em string mesmo — SpEL não resolve constantes Java de forma limpa.)

### Passo 3 — Aplicar nos controllers (substituir os provisórios)
Procurar os comentários `// FASE F:` deixados nas fases anteriores e trocar:

| Arquivo | Rota | De | Para |
|---|---|---|---|
| `MealEntitlementController` | `PUT /{userId}` | `hasRole('ADMIN')` | `hasRole('ADMIN') or @areaSecurity.hasPermission('MEAL_ENTITLEMENT_WRITE')` |
| `ExitPermissionController` | `POST /` | `hasRole('ADMIN')` | `hasRole('ADMIN') or @areaSecurity.hasPermission('EXIT_PERMISSION_WRITE')` |
| `ExitPermissionController` | `POST /{id}/revoke` | `hasRole('ADMIN')` | `hasRole('ADMIN') or @areaSecurity.hasPermission('EXIT_PERMISSION_WRITE')` |
| `AccessAttemptController` | `GET /` | `hasRole('ADMIN')` | `hasRole('ADMIN') or @areaSecurity.hasPermission('ATTEMPTS_READ')` |
| `AccessAttemptController` | `GET /stats` | `hasRole('ADMIN')` | `hasRole('ADMIN') or @areaSecurity.hasPermission('ATTEMPTS_READ')` |

Remover os comentários `// FASE F:` após aplicar.
⚠️ **Não alterar** as rotas de **leitura** de entitlements/permissões (`GET` com `can('cantine')` / `can('portail')`) — leitura continua por setor. Nem os feeds `/refectory` e `/gate`.

### Passo 4 — CRUD de operadores aceita `permissoes`
No controller/DTO de `system-users`:
- DTO de entrada e de saída ganham `permissoes` (String CSV, opcional).
- Criação/edição gravam o campo.
- **Validação:** se preenchido, cada item do CSV deve ser um valor reconhecido (`MEAL_ENTITLEMENT_WRITE`, `EXIT_PERMISSION_WRITE`, `ATTEMPTS_READ`) ou `*` → senão 400 com mensagem clara listando os valores válidos.
- **Nunca** retornar `passwordHash` (conferir se o DTO atual já protege isso — se não protege, **reporte, não corrija nesta fase**).

### Passo 5 — Endpoint auxiliar (opcional, ajuda a UI da Fase H)
`GET /api/auth/me` já existe. Se ele **não** retornar `role`/`setoresPermitidos`/`permissoes`, adicionar esses campos **sem remover nenhum existente** — a UI da Fase H usa isso para desabilitar campos de escrita. Se já retornar, não mexer.

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. ★ **Nenhum operador existente perde acesso.** `permissoes = null` só afeta as rotas de escrita novas.
2. ADMIN passa em tudo (bypass mantido).
3. `can(area)` e `canOperateSector` **não** mudam.
4. Leitura nunca exige permissão granular.
5. Sintaxe `hasRole('ADMIN') or @areaSecurity.hasPermission('X')` — testar que compila e avalia (SpEL).
6. `passwordHash` nunca sai em resposta.

## CRITÉRIOS DE ACEITE
- [ ] `mvn clean compile` verde; backend sobe.
- [ ] ADMIN: `PUT /api/admin/meal-entitlements/{id}` → 200.
- [ ] Operador com `setoresPermitidos=REFEI1,REFEI2` e `permissoes=null`:
  - `GET /api/admin/meal-entitlements` → **200** (leitura por setor, inalterada)
  - `PUT /api/admin/meal-entitlements/{id}` → **403**
- [ ] Mesmo operador com `permissoes=MEAL_ENTITLEMENT_WRITE` → `PUT` → **200**.
- [ ] Operador com `permissoes=*` → todas as escritas → 200.
- [ ] Operador com `permissoes=EXIT_PERMISSION_WRITE` → `POST /exit-permissions` 200 · `PUT /meal-entitlements` **403**.
- [ ] `POST /api/system-users` com `permissoes=FOO_BAR` → **400** listando os valores válidos.
- [ ] ★ Regressão: todos os operadores existentes continuam operando seus setores exatamente como antes (registrar acesso manual, ver logs do setor, CDI).
- [ ] Nenhuma resposta expõe `passwordHash`.

## VALIDAÇÕES
```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login -ContentType "application/json" -Body '{"username":"admin","password":"admin1234"}'
$h = @{ Authorization = "Bearer $($login.token)" }

# 1. Criar operador de teste sem permissões granulares
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/system-users" -Headers $h -ContentType "application/json" -Body '{"username":"op_teste","password":"teste1234","nomeCompleto":"Operador Teste","role":"OPERATOR","setoresPermitidos":"REFEI1,REFEI2"}'

# 2. Logar como ele
$op = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login -ContentType "application/json" -Body '{"username":"op_teste","password":"teste1234"}'
$ho = @{ Authorization = "Bearer $($op.token)" }

# 3. Leitura deve funcionar (200)
Invoke-RestMethod -Uri "http://localhost:8080/api/admin/meal-entitlements?size=5" -Headers $ho

# 4. Escrita deve dar 403
try { Invoke-RestMethod -Method Put -Uri "http://localhost:8080/api/admin/meal-entitlements/9999999" -Headers $ho -ContentType "application/json" -Body '{"status":"AUTHORIZED"}' } catch { $_.Exception.Response.StatusCode }

# 5. Conceder a permissão e repetir → 200
# 6. LIMPEZA: remover/desativar op_teste ao final
```

## CHECKLIST DE CONCLUSÃO
- [ ] `AreaSecurity.hasPermission` criado espelhando `can()`
- [ ] `Permissions` (constantes) criada
- [ ] 5 `@PreAuthorize` trocados; comentários `// FASE F:` removidos
- [ ] Rotas de leitura **não** alteradas
- [ ] CRUD de operadores aceita/retorna/valida `permissoes`
- [ ] `passwordHash` não exposto
- [ ] `mvn clean compile` verde · **Nenhum commit**
- [ ] Reportar o nome real do controller/DTO de system-users

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| ★ Operador existente perder acesso | **CRÍTICA** | `permissoes=null` só afeta escrita nova; testar regressão explicitamente |
| SpEL com `or` mal formado → 500 em runtime, não em compilação | **Alta** | Testar cada rota manualmente; a Fase I adiciona `PermissionsIT` |
| Esquecer de trocar algum `// FASE F:` | Média | `grep -rn "FASE F" backend/src/main/java` deve retornar vazio ao fim |
| Validação de CSV rejeitar `*` | Média | Testar `permissoes=*` |

## ROLLBACK
| Nível | Ação | Perda |
|---|---|---|
| Código | `git revert` → volta a `hasRole('ADMIN')` nas escritas (mais restritivo, nunca menos) | Nenhuma |
| Dados | Coluna `permissoes` fica inerte | Nenhuma |
⚠️ Rollback desta fase é **seguro por natureza**: volta a exigir ADMIN, que é mais restritivo.

## AO TERMINAR
1. Compile. 2. `grep -rn "FASE F" backend/src/main/java` → vazio. 3. Checklist. 4. Confirmar: "nenhum operador existente perdeu acesso". 5. **NÃO commitar.**
