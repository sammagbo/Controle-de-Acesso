# MAGBO Access Control — Migrações SQL versionadas (VM)

SQL manual, idempotente, versionado no padrão de nomenclatura Flyway (`V00n__nome.sql`)
para conversão trivial numa fase futura. **Fonte da verdade do schema:** as entidades JPA
em `backend/src/main/java/com/magbo/access/models/`. Estes arquivos apenas transcrevem, de
forma controlada e auditável, o schema que o Hibernate gera sozinho.

---

## 1. Contexto — por que SQL manual e não Flyway (decisão registrada)

O projeto **não tem Flyway** (nem no `pom.xml`, nem pasta `db/migration`) e **esta fase não
o adota**. Adotar Flyway exigiria criar um *baseline* de um schema nascido do Hibernate com
~440 mil registros em `access_logs` — é um projeto próprio e não pode ser misturado com
mudança funcional.

Portanto, esta fase entrega **SQL versionado manual**, no formato `V00n__*.sql`, pronto para
conversão futura. **Não** foi adicionado Flyway ao `pom.xml`, **não** existe
`src/main/resources/db/migration`, e o `ddl-auto` **não** foi alterado.

## 2. Quando aplicar

- **PC de desenvolvimento** (`ddl-auto=update`, perfil `dev`/`prod` local): **não precisa**
  destes SQLs — o Hibernate cria o schema sozinho. Eles existem para **auditoria e controle**.
- **VM de produção** (Ubuntu 24.04, `deploy/docker-compose.yml`): **precisa**. A migração na
  VM deve ser controlada e revisável — é aqui que estes arquivos são aplicados, na ordem.

## 3. Ordem de aplicação

Aplicar **na ordem** V001 → V006. As migrations V001..V004 devem estar aplicadas **antes** de
subir o backend com as fases correspondentes (B/C/D). Comando por arquivo:

```bash
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V001__access_attempts.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V002__meal_entitlements.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V003__meal_entitlement_events.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V004__student_exit_permissions.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V005__system_users_permissoes.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V006__indexes.sql
```

| Arquivo | Cria/altera | Fase |
|---|---|---|
| `V001__access_attempts.sql` | tabela `access_attempts` + 5 CHECKs de enum | B |
| `V002__meal_entitlements.sql` | tabela `meal_entitlements` + CHECK de status | C |
| `V003__meal_entitlement_events.sql` | tabela `meal_entitlement_events` + CHECKs | C |
| `V004__student_exit_permissions.sql` | tabela `student_exit_permissions` + CHECKs | D |
| `V005__system_users_permissoes.sql` | `ALTER TABLE system_users ADD COLUMN permissoes` (nullable) | F |
| `V006__indexes.sql` | índices das tabelas acima (nenhum em `access_logs`) | — |

## 4. Procedimento completo na VM

```
1. BACKUP primeiro:
   docker exec magbo-postgres pg_dump -U magbo -d magbodb -F c -f /tmp/pre-migracao.dump
   (copiar o dump para fora do container: docker cp magbo-postgres:/tmp/pre-migracao.dump ./)

2. Aplicar V001..V006 na ordem (comandos da secao 3), conferindo o \d de cada tabela:
   docker exec magbo-postgres psql -U magbo -d magbodb -c "\d access_attempts"
   docker exec magbo-postgres psql -U magbo -d magbodb -c "\d meal_entitlements"
   docker exec magbo-postgres psql -U magbo -d magbodb -c "\d meal_entitlement_events"
   docker exec magbo-postgres psql -U magbo -d magbodb -c "\d student_exit_permissions"
   docker exec magbo-postgres psql -U magbo -d magbodb -c "\d system_users"

3. Subir o backend novo; conferir startup SEM erro de schema (nenhum ALTER inesperado do
   Hibernate nos logs; os 2 WARN de SECURITY [prod] sao normais).

4. Smoke:
   - /api/health  -> "database":"CONNECTED"
   - 1 evento de face real no terminal  -> AccessLog OU access_attempts conforme a classificacao
   - /api/stats/global
   - dashboards (Admin / Cantine)

5. Se falhar -> rollback (secao 5).
```

## 5. Rollback — 4 níveis (do mais leve ao mais pesado)

Prefira sempre o nível mais alto (menos destrutivo) que resolve o problema.

1. **Comportamento (properties):** desligar a funcionalidade por configuração/feature-flag e
   reiniciar. As tabelas ficam inertes; nada é apagado. **Primeira opção.**
2. **Código (revert):** reverter o commit da fase problemática e reimplantar o jar anterior.
   As tabelas novas continuam existindo, ociosas e inofensivas — o backend antigo não as usa.
3. **Schema (`rollback/R00n__*.sql`):** **raro.** Só quando a tabela/coluna precisa realmente
   sumir. **É destrutivo** (`DROP`) — apaga a tabela e todos os dados nela. Um arquivo por
   migração:
   ```bash
   docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/rollback/R001__drop_access_attempts.sql
   ```
   (`R005` remove apenas a coluna `permissoes` de `system_users`, sem apagar operadores.)
4. **Dados (pg_restore do backup):** último recurso, restaura o estado pré-migração:
   ```bash
   docker exec -i magbo-postgres pg_restore -U magbo -d magbodb --clean --if-exists /tmp/pre-migracao.dump
   ```

## 6. Aviso — `ddl-auto=update` continua ativo na VM (rede de segurança)

O `ddl-auto=update` **permanece ligado** na VM. Ele é idempotente e **só adiciona** (nunca
remove coluna nem relaxa constraint). Os SQLs manuais **não** existem porque o Hibernate
falharia — existem para **auditoria, revisão e controle** da migração. Se você aplicar os
`V00n__` primeiro e depois subir o backend, o Hibernate encontra tudo pronto e não altera
nada.

> Precedente conhecido: `door_mappings.door_no` exigiu `ALTER ... DROP NOT NULL` manual no PC.
> A VM nasce correta justamente porque o schema é transcrito aqui a partir das entidades.

## 7. Regra de manutenção (obrigatória)

- **Ao adicionar um valor a um enum Java**, atualizar o CHECK correspondente **na mesma
  entrega**. Enums e seus CHECKs:
  - `AccessAction` → `access_attempts_action_check`
  - `AuthMethod` → `access_attempts_auth_method_check`
  - `AuthResult` → `access_attempts_auth_result_check`
  - `AuthorizationResult` → `access_attempts_authorization_result_check`
  - `DenialReason` → `access_attempts_denial_reason_check`
  - `EntitlementStatus` → `meal_entitlements_status_check`,
    `meal_entitlement_events_old_status_check`, `meal_entitlement_events_new_status_check`
  - `ExitPermissionType` → `student_exit_permissions_permission_type_check`
  - `ExitPermissionStatus` → `student_exit_permissions_status_check`
- **`meal_entitlement_events.source`** é `String` livre no Java (não é enum) — o CHECK
  `('UI','BULK','API')` é uma **guarda manual**, não gerada pelo Hibernate. Ao introduzir um
  novo valor de `source` no código, **adicioná-lo a este CHECK** (`V003`) na mesma entrega,
  senão o INSERT falha **só na VM**.

---

## Notas de fidelidade (conferir no `\d` real da VM)

Estes arquivos foram transcritos das entidades JPA. Dois pontos que **o Sam deve conferir**
comparando com o `\d` real quando o banco estiver de pé (idealmente no teste em banco limpo):

- **Tipo do `id`:** escrito como `BIGSERIAL` (padrão histórico do Hibernate para
  `GenerationType.IDENTITY` no PostgreSQL). Se o `\d` do PC mostrar `bigint ... generated ...
  as identity`, é apenas outra forma de coluna auto-incremento — funcionalmente equivalente e
  não impede o `ddl-auto`. Sinalizar se quiser alinhamento byte a byte.
- **Nomes dos CHECKs de enum:** aqui seguem o padrão `<tabela>_<coluna>_check`. Os CHECKs
  auto-gerados pelo Hibernate 6 podem ter nomes diferentes, mas **os valores permitidos são os
  mesmos** (listam todos os constantes do enum). Como os CHECKs manuais nunca são **mais**
  restritivos que o enum, não há risco de rejeitar valor válido.
