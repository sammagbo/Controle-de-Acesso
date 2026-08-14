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
  ⚠️ **Exceção: a V012.** Ver abaixo.
- **VM de produção** (Ubuntu 24.04, `deploy/docker-compose.yml`): **precisa**. A migração na
  VM deve ser controlada e revisável — é aqui que estes arquivos são aplicados, na ordem.

### ⚠️ Como saber que este README está completo

`npm test -- tests/migrations.test.js` reprova quando uma migração existe em
`deploy/migrations/` e **não é citada neste arquivo**, quando ela não tem
rollback, e quando o CHECK de `access_attempts.denial_reason` deixa de fora um
valor do enum `DenialReason.java`. Não substitui aplicar o SQL num Postgres —
substitui a lembrança de que ele existe.

### ⚠️ A V016 é a única SEM transação (CONCURRENTLY)

`CREATE INDEX CONCURRENTLY` não pode rodar dentro de `BEGIN/COMMIT`, e é por
isso que aquele arquivo não os tem. Em troca, ele não trava as escritas: num dia
letivo, um segundo de webhook bloqueado é uma passagem que o terminal reenvia ou
perde.

⚠️ Se o comando falhar no meio, fica um índice **inválido** — não usado pelo
planejador e ocupando espaço. Conferir depois de aplicar:

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -tAc   "SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_access_logs_ponto_hora'::regclass;"
# t = válido · f = derrubar com rollback/R016 e repetir
```

Medição que justifica o índice (Postgres local, 439.993 registros reais,
14/08/2026): a consulta do portão passou de **Seq Scan, 3687 buffers, ~14,5 ms**
para **Index Scan, 5 buffers, ~0,05 ms**.

### ⚠️ A V015 arma uma falha ADIADA se ficar de fora

A **V014** cria `student_regimes` e `student_regime_events` (régime de sortie) — é
aditiva e o `ddl-auto` do PC a resolve sozinho. A **V015** amplia o CHECK de
`access_attempts.denial_reason` com `REGIME_NOT_ALLOWED`, `REGIME_UNKNOWN` e `REGIME_TO_VERIFY`, e
esta **precisa ser aplicada à mão na VM**: o Hibernate gera o CHECK ao *criar* a
tabela e o `ddl-auto=update` **nunca altera** um CHECK existente (mesma armadilha
da V009).

⚠️ **A falha é adiada e silenciosa.** Sem a V015 nada quebra no dia do deploy:
ela só arma quando a Vie Scolaire cadastrar o primeiro regime e um aluno de
regime 1 passar no portão — aí o INSERT da tentativa estoura **dentro da
transação** e derruba junto o `access_log` de uma passagem real. Aplicar
**antes** de ligar `magbo.regime.habilitado`.

### ⚠️ A V012 é obrigatória NO PC TAMBÉM — a primeira que é

A regra acima vale porque toda migração até aqui foi **aditiva**, e `ddl-auto=update` entrega
o que é aditivo sozinho. A **V012 remove** a coluna `student_exit_permissions.reason`, e
`ddl-auto` **nunca remove**.

Consequência mecânica: ao tirar o campo `reason` da entidade Java, o Hibernate para de
incluí-lo no INSERT — e a coluna continua `NOT NULL` em qualquer banco que não tenha recebido
o arquivo. **Todo INSERT em `student_exit_permissions` passa a falhar**, no PC e na VM, com
erro de driver e não com mensagem de validação.

```bash
# PC (container magbo-postgres), ANTES de subir o backend novo:
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V012__exit_permission_two_authorities.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V013__password_reset_requests.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V014__student_regimes.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V015__denial_reason_regime.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V016__access_logs_indice_ponto_hora.sql
```

Conferência: `\d student_exit_permissions` mostra `authorized_by_family` e
`authorized_by_school`, e **não** mostra `reason`.

Por que a exceção foi aceita: a tabela tinha **uma** linha em produção, com `reason = 'teste'`
(conferido em 12/08/2026) — a funcionalidade nunca foi usada. E a coluna nunca significou
"motivo": o formulário gravava nela o nome de quem autorizou. Detalhe do raciocínio no
cabeçalho do próprio V012.

## 3. Ordem de aplicação

Aplicar **na ordem** V001 → V016. As migrations V001..V004 devem estar aplicadas **antes** de
subir o backend com as fases correspondentes (B/C/D); a V007, antes de subir o backend com o
cadastro de servidores; a V008/V009, antes das câmeras da portaria; a V010, antes do posto
fixo. Comando por arquivo:

```bash
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V001__access_attempts.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V002__meal_entitlements.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V003__meal_entitlement_events.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V004__student_exit_permissions.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V005__system_users_permissoes.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V006__indexes.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V007__app_users_departamento.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V008__app_users_camera_person_id.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V009__denial_reason_camera.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V010__app_users_posto_fixo.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V011__user_photos.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V012__exit_permission_two_authorities.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V013__password_reset_requests.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V014__student_regimes.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V015__denial_reason_regime.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V016__access_logs_indice_ponto_hora.sql
```

| Arquivo | Cria/altera | Fase |
|---|---|---|
| `V001__access_attempts.sql` | tabela `access_attempts` + 5 CHECKs de enum | B |
| `V002__meal_entitlements.sql` | tabela `meal_entitlements` + CHECK de status | C |
| `V003__meal_entitlement_events.sql` | tabela `meal_entitlement_events` + CHECKs | C |
| `V004__student_exit_permissions.sql` | tabela `student_exit_permissions` + CHECKs | D |
| `V005__system_users_permissoes.sql` | `ALTER TABLE system_users ADD COLUMN permissoes` (nullable) | F |
| `V006__indexes.sql` | índices das tabelas acima (nenhum em `access_logs`) | — |
| `V007__app_users_departamento.sql` | `ALTER TABLE app_users ADD COLUMN departamento` (nullable) | Servidores |
| `V008__app_users_camera_person_id.sql` | `ALTER TABLE app_users ADD COLUMN camera_person_id` (nullable, UNIQUE) | Câmeras da portaria |
| `V009__denial_reason_camera.sql` | amplia o CHECK de `access_attempts.denial_reason` (`UNKNOWN_FACE`, `AMBIGUOUS_NAME`) | Câmeras da portaria |
| `V010__app_users_posto_fixo.sql` | `ALTER TABLE app_users ADD COLUMN posto_fixo_point_id` (nullable) | Posto fixo |
| `V011__user_photos.sql` | tabela `user_photos` (`bytea`) — fotos de identificação | Fotos |
| `V012__exit_permission_two_authorities.sql` | `student_exit_permissions`: +`authorized_by_family`, +`authorized_by_school`, **−`reason`** | Duas autoridades |
| `V013__password_reset_requests.sql` | tabela `password_reset_requests` + CHECK de status | Esqueci a senha |

> ⚠️ **`V011` é a primeira migration que guarda dado que não existe em mais lugar nenhum.**
> As fotos vivem **só** no banco (o container do backend não tem volume onde escrevê-las —
> ver o cabeçalho do arquivo). Isso é uma vantagem: elas entram no `pg_dump` como qualquer
> coluna. Mas o rollback `R011` **apaga as imagens**, e restaurá-las exige o dump anterior
> ou reimportar os arquivos de origem. Backup antes, sempre.

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

---

## 8. LIMITAÇÕES CONHECIDAS

Três coisas medidas em PostgreSQL 16 local na auditoria de 10–11/08/2026
(`docs/testing/auditoria-2026-08-10-overnight.md`, eixo 3). Nenhuma quebra a
produção atual — todas mordem **na próxima instalação do zero**.

### 8.1 As migrations NÃO são autossuficientes num banco vazio

Aplicadas em ordem sobre um banco **vazio**, quatro delas falham:

```
V005__system_users_permissoes.sql   ERROR: relation "system_users" does not exist
V007__app_users_departamento.sql    ERROR: relation "app_users"    does not exist
V008__app_users_camera_person_id.sql ERROR: relation "app_users"   does not exist
V010__app_users_posto_fixo.sql      ERROR: relation "app_users"    does not exist
```

Elas são `ALTER TABLE` sobre tabelas que **nunca são criadas por SQL neste
diretório**: `app_users`, `system_users`, `access_logs`, `door_mappings`,
`class_schedules` e `responsaveis` nasceram do `ddl-auto` do Hibernate, antes
de este diretório existir. Só V001–V004, V006, V009 e V011 são autônomas.

**Consequência prática:** `psql < V001..V011` **não** reconstrói o banco. Quem
tentar montar um ambiente novo só com este diretório terá metade do schema.

**Para reconstruir do zero, em ordem:**

1. **Se houver dump da produção** (caminho preferido — é o que o
   `deploy/backup.sh` produz):
   `pg_restore -U magbo -d magbodb <dump>` e **pronto** — o dump já traz tudo,
   as migrations não são necessárias.
2. **Se não houver dump** (base nova, escola nova):
   a. subir o backend com `ddl-auto=update` contra o banco vazio e **deixá-lo
      criar o schema-base** (ele cria todas as tabelas e os CHECKs de enum);
   b. derrubar o backend;
   c. aplicar V001..V011 na ordem — aqui elas só **acrescentam** o que o
      Hibernate não gera (índices da V006, CHECK de `source` da V003, o CHECK
      ampliado da V009);
   d. subir o backend de novo.

**Reverificar:** criar um banco vazio e rodar as 11 na ordem; as quatro linhas
de erro acima têm de aparecer. Se **não** aparecerem, alguém tornou as
migrations autônomas — ótimo, e então esta seção é que está velha.

### 8.2 Índice UNIQUE duplicado se as migrations rodarem DEPOIS do Hibernate

No caminho 2 acima (Hibernate primeiro, migrations depois),
`app_users.camera_person_id` termina com **dois** índices únicos:

```
uk_5iw58kgrgk932dsp7gkphkp8k        ← gerado pelo Hibernate (@Column(unique=true))
app_users_camera_person_id_key      ← criado pela V008
```

O bloco `DO $$ … EXCEPTION WHEN duplicate_object` da V008 só engole a exceção
de **um constraint com o mesmo nome** — ele não enxerga o índice do Hibernate,
que tem nome gerado. **A produção está limpa** (só o da V008), o que indica que
lá a V008 rodou antes do primeiro boot.

**Efeito:** custo de escrita redundante em `app_users` e um índice a mais no
`\d`. Sem risco funcional — os dois impõem a mesma regra.

**Reverificar:** `\d app_users` e contar os índices únicos sobre
`camera_person_id`. Se houver dois, remover o do Hibernate é seguro
(`DROP INDEX uk_…`), mas é decisão do Sam: o `ddl-auto` pode recriá-lo no boot
seguinte, e aí a limpeza precisa virar rotina, não gesto único.

### 8.3 O PC de desenvolvimento roda SEM os índices da V006

A seção 2 diz que o PC "não precisa destes SQLs" — verdade para o **schema**,
mas não para os **índices**. Um PC que só usou `ddl-auto` não tem nenhum dos
sete da V006:

```
idx_attempts_timestamp · idx_attempts_user_ts · idx_attempts_reason_ts
idx_attempts_point_ts  · idx_ment_events_user_ts
idx_exitperm_user_status · idx_exitperm_validity
```

**Efeito:** consultas de `access_attempts` (feeds de negadas, agregados do
Rapport) fazem seq scan no PC e index scan na VM. Medições de desempenho feitas
no PC **não representam** a VM — para pior, o que é o lado seguro do engano.
Nenhum deles é sobre `access_logs` (deliberado: a tabela tem ~440 mil linhas e
criar índice nela é operação à parte).

**Reverificar no PC:** `\di idx_*` — se vier vazio, é este o caso.
**Para igualar ao da VM:** aplicar só a V006 (`IF NOT EXISTS`, idempotente e
segura de repetir).
