# PROMPT — FASE J: SQL Versionado e Estratégia de Migração

## CONTEXTO DO PROJETO
**MAGBO Access Control** — Lycée Molière (Rio). Spring Boot 3.2.5 / PostgreSQL 16.
- **PC de desenvolvimento:** container `magbo-postgres`, banco `magbodb`, usuário `magbo`. Usa `ddl-auto=update` — o Hibernate cria o schema sozinho.
- **VM de produção (futura):** Ubuntu 24.04 na VLAN 192.168.1.x. Deploy canônico: `deploy/docker-compose.yml`. **Lá a migração precisa ser controlada e auditável.**
- Banco atual: **~440.000 registros** em `access_logs`, **923 alunos** reais.

**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia a seção 14 inteira**.

### ★ DECISÃO ARQUITETURAL JÁ TOMADA — NÃO ADOTAR FLYWAY AGORA
O projeto **não tem Flyway** (nem no `pom.xml`, nem pasta `db/migration`). Adotar Flyway exigiria criar um baseline de um schema nascido do Hibernate com 440k registros — **é um projeto próprio** e não pode ser misturado com mudança funcional.

**Portanto:** esta fase entrega **SQL versionado manual**, idempotente, já no formato de nomenclatura do Flyway (`V00n__nome.sql`) para conversão trivial numa fase futura.
❌ **NÃO adicione Flyway ao `pom.xml`.** ❌ **NÃO crie `src/main/resources/db/migration`.** ❌ **NÃO altere `ddl-auto`.**

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`.
- ❌ **NUNCA** SQL destrutivo nos arquivos de migração (`DROP`, `TRUNCATE`, `DELETE`, `ALTER ... TYPE`). Só `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- ❌ **NUNCA** executar SQL no banco do Sam. Você **escreve** os arquivos; **o Sam executa**.
- ❌ **NUNCA** adicionar `NOT NULL` a coluna de tabela existente.
- ✅ Todo arquivo deve ser **idempotente**: rodar 2x não pode dar erro.
- ✅ Contradição com o código → **PARE e reporte**.

---

## OBJETIVO DA FASE J
Produzir os SQLs que criam, na VM, exatamente o mesmo schema que o Hibernate cria no PC — de forma controlada, revisável e reversível.

## DEPENDÊNCIAS
**Fases A–I concluídas.** O schema final precisa estar estável para ser transcrito.

---

## ARQUIVOS
### Novos
```
deploy/migrations/V001__access_attempts.sql
deploy/migrations/V002__meal_entitlements.sql
deploy/migrations/V003__meal_entitlement_events.sql
deploy/migrations/V004__student_exit_permissions.sql
deploy/migrations/V005__system_users_permissoes.sql
deploy/migrations/V006__indexes.sql
deploy/migrations/README.md
deploy/migrations/rollback/R001__drop_access_attempts.sql
deploy/migrations/rollback/R002__drop_meal_entitlements.sql
deploy/migrations/rollback/R003__drop_meal_entitlement_events.sql
deploy/migrations/rollback/R004__drop_student_exit_permissions.sql
deploy/migrations/rollback/R005__drop_system_users_permissoes.sql
```
### Ler antes (fonte da verdade do schema)
```
backend/src/main/java/com/magbo/access/models/AccessAttempt.java
backend/src/main/java/com/magbo/access/models/MealEntitlement.java
backend/src/main/java/com/magbo/access/models/MealEntitlementEvent.java
backend/src/main/java/com/magbo/access/models/StudentExitPermission.java
backend/src/main/java/com/magbo/access/models/SystemUser.java
+ TODOS os enums (AuthMethod, AuthResult, AuthorizationResult, DenialReason,
  EntitlementStatus, ExitPermissionType, ExitPermissionStatus)
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — Extrair o schema REAL do banco (fonte de verdade)
Antes de escrever qualquer SQL, peça ao Sam a saída de:
```powershell
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d access_attempts"
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d meal_entitlements"
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d meal_entitlement_events"
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d student_exit_permissions"
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d system_users"
```
⚠️ **Os SQLs devem reproduzir exatamente o que o Hibernate criou** — tipos, tamanhos, nullability e os CHECK constraints dos enums. Se você "melhorar" algo, o schema da VM diverge do PC e você cria um bug fantasma que só aparece em produção.

### Passo 2 — `V001__access_attempts.sql` (modelo normativo — seguir este padrão)
```sql
-- MAGBO Access Control — V001: tentativas de acesso negadas
-- Aplicar ANTES de subir o backend com a Fase B.
-- Idempotente: pode ser executado mais de uma vez sem erro.
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
-- ... um bloco DO $$ por CHECK (auth_method, auth_result, authorization_result, denial_reason)
```
★ **Os CHECKs devem listar EXATAMENTE os mesmos valores dos enums Java.** Divergência = erro em runtime na VM. Confira enum por enum.

### Passo 3 — V002 a V005
Mesmo padrão. Pontos de atenção:
- **V002 `meal_entitlements`:** PK = `user_id VARCHAR(255)`. Incluir `days_of_week VARCHAR(16)` e `meal_type VARCHAR(16)` (campos reservados). CHECK de `status`. Comentário SQL: `-- days_of_week e meal_type: reservados para evolução futura; a regra atual os ignora.`
- **V003 `meal_entitlement_events`:** histórico imutável. CHECK de `old_status`/`new_status` e de `source IN ('UI','BULK','API')`.
- **V004 `student_exit_permissions`:** `reason` e `created_by` **NOT NULL**. CHECKs de `permission_type` e `status`.
- **V005 `system_users_permissoes`:**
```sql
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS permissoes VARCHAR(255);
```
★ **Nullable.** Nunca NOT NULL — operadores existentes têm `null` e isso **não pode** removê-los do sistema.

### Passo 4 — `V006__indexes.sql`
```sql
CREATE INDEX IF NOT EXISTS idx_attempts_timestamp   ON access_attempts (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_user_ts     ON access_attempts (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_reason_ts   ON access_attempts (denial_reason, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_point_ts    ON access_attempts (point_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ment_events_user_ts  ON meal_entitlement_events (user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_exitperm_user_status ON student_exit_permissions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_exitperm_validity    ON student_exit_permissions (valid_from, valid_until);
```
⚠️ **Não** criar índices em `access_logs` nesta fase (tabela de 440k registros em uso; criação de índice é operação pesada e não faz parte deste escopo).

### Passo 5 — `rollback/R00n__*.sql`
Um por migração, com aviso no topo:
```sql
-- ⚠️ EMERGÊNCIA APENAS. Apaga a tabela e todos os dados nela.
-- Só use se a fase foi revertida no código E a tabela precisa sumir.
-- Na maioria dos casos NÃO é necessário: a tabela fica inerte e inofensiva.
DROP TABLE IF EXISTS access_attempts;
```
Para o V005: `ALTER TABLE system_users DROP COLUMN IF EXISTS permissoes;`

### Passo 6 — `README.md`
Conteúdo obrigatório:
1. **Contexto:** por que SQL manual e não Flyway (decisão registrada; Flyway = fase futura).
2. **Quando aplicar:** o PC usa `ddl-auto=update` e **não** precisa destes SQLs. **A VM precisa.**
3. **Ordem de aplicação** (V001→V006) e comando:
```bash
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V001__access_attempts.sql
```
4. **Procedimento completo na VM:**
```
1. BACKUP primeiro:  docker exec magbo-postgres pg_dump -U magbo -d magbodb -F c -f /tmp/pre-migracao.dump
2. Aplicar V001..V006 na ordem, conferindo \d de cada tabela
3. Subir o backend novo; conferir startup sem erro de schema
4. Smoke: /api/health · 1 evento de face real · /api/stats/global · dashboards
5. Se falhar → rollback (seção abaixo)
```
5. **Rollback em 4 níveis** (comportamento via properties → código via revert → schema via R00n → dados via pg_restore).
6. **Aviso:** `ddl-auto=update` continua ativo na VM como rede de segurança — é idempotente e só adiciona. Os SQLs manuais existem para **auditoria e controle**, não porque o Hibernate falharia.
7. **Regra de manutenção:** ao adicionar valor a um enum Java, **atualizar o CHECK correspondente na mesma entrega**.

### Passo 7 — Teste em banco limpo (peça ao Sam)
```powershell
# Cria um banco temporário e aplica tudo do zero
docker exec magbo-postgres psql -U magbo -d postgres -c "CREATE DATABASE magbotest_migration;"
# aplicar V001..V006 nele
# conferir \d de cada tabela
# aplicar TUDO DE NOVO → não pode dar erro (idempotência)
docker exec magbo-postgres psql -U magbo -d postgres -c "DROP DATABASE magbotest_migration;"
```

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. Idempotência total (rodar 2x = sem erro).
2. Zero SQL destrutivo nos `V00n__`.
3. `permissoes` nullable.
4. CHECKs espelhando os enums Java **exatamente**.
5. Sem Flyway, sem `db/migration`, sem mexer em `ddl-auto`.
6. Sem índices em `access_logs`.
7. **Você não executa nada no banco.** Escreve os arquivos; o Sam executa.
8. Schema idêntico ao que o Hibernate gera — nada de "melhorias".

## CRITÉRIOS DE ACEITE
- [ ] 6 migrations + 5 rollbacks + README criados.
- [ ] Aplicados num banco **vazio**, criam o schema completo sem erro.
- [ ] Aplicados **duas vezes** → sem erro (idempotência).
- [ ] `\d` de cada tabela idêntico ao que o Hibernate gerou no PC (comparar coluna a coluna, tipo a tipo, CHECK a CHECK).
- [ ] Nenhum `DROP`/`DELETE`/`TRUNCATE` nos `V00n__`.
- [ ] `permissoes` criada como nullable.
- [ ] README com backup, ordem, smoke e os 4 níveis de rollback.
- [ ] Nenhuma dependência adicionada ao `pom.xml`.

## CHECKLIST DE CONCLUSÃO
- [ ] Schema real extraído do banco antes de escrever (não inventado)
- [ ] V001–V006 idempotentes, com CHECKs conferidos contra os enums
- [ ] R001–R005 com aviso de emergência
- [ ] README completo
- [ ] Testado em banco limpo, 2x
- [ ] **Nenhum commit** · **Nenhum SQL executado no banco de produção/dev do Sam**

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| CHECK divergir do enum Java → erro só na VM | **Alta** | Conferir enum por enum, valor por valor |
| Schema manual divergir do Hibernate → bug fantasma em produção | **Alta** | Extrair do `\d` real, não escrever de memória |
| SQL destrutivo entrar num `V00n__` | **CRÍTICA** | Revisar os 6 arquivos; só CREATE/ALTER ADD |
| `permissoes NOT NULL` derrubar operadores existentes | **Alta** | Nullable, explicitamente |
| Executar SQL no banco do Sam sem autorização | **CRÍTICA** | Você escreve, o Sam executa |

## ROLLBACK
Ver o próprio README entregue. Resumo: **comportamento** (properties) → **código** (revert) → **schema** (R00n, raro) → **dados** (pg_restore do backup pré-migração).

## AO TERMINAR
1. Listar os arquivos criados. 2. Confirmar: "os CHECKs foram conferidos contra os enums Java, um a um". 3. Confirmar: "nenhum SQL foi executado por mim". 4. Pedir ao Sam o teste em banco limpo. 5. **NÃO commitar.**
