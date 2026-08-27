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

### ⚠️⚠️ `psql` SAI COM 0 MESMO QUANDO O SQL FALHA — use `ON_ERROR_STOP=1`

**Medido no container `magbo-postgres` em 25/08/2026**, com um ficheiro que
contém um `SELECT` sobre uma tabela inexistente entre dois `SELECT` válidos:

```
docker exec -i magbo-postgres psql -U magbo -d magbodb < erro.sql
  → ERROR: relation "tabela_que_nao_existe" does not exist
  → exit code 0        ← o script continuou e o shell diz que correu bem

docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb < erro.sql
  → exit code 3        ← para na primeira falha e diz que falhou
```

⚠️ Sem a opção, `psql` **continua depois do erro** e devolve 0. Numa sessão de
deploy em que se aplicam vários ficheiros seguidos, isso significa que uma
migração pode falhar por inteiro, o terminal não acusar nada, o `&&` do comando
seguinte passar, e o backend subir contra um schema que não é o que se pensa —
que é exactamente a classe de falha adiada que a V015 e a V017 documentam.

⚠️ **Os comandos das secções 3 e 4 abaixo são históricos e NÃO trazem a
opção.** Ela não foi acrescentada retroactivamente para não reescrever um
procedimento já executado nesta forma; a partir da **V020**, todo comando novo
deste README a inclui. Ao repetir um comando antigo, acrescente-a.

⚠️ `ON_ERROR_STOP` **não** substitui a transação: ele para o *script*, não
desfaz o que já foi aplicado. Os ficheiros com `BEGIN/COMMIT` (todos excepto
V016/V018/V019) desfazem-se sozinhos; nos três `CONCURRENTLY` a paragem é tudo
o que há, e a conferência do índice inválido continua obrigatória.

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

### ⚠️ A V019 é a TERCEIRA sem transação, e a outra metade dela é Java

`access_logs` nunca teve índice em `user_id` — a `V006` indexou as tabelas da
camada de decisão e diz isso por extenso, a `V016` fez `(point_id, timestamp)` e a
`V018` fez `(timestamp)`. Nenhum alcança uma busca **por pessoa**.

Quem pagava era a aba **Personnels**: `listStaff` perguntava
`SELECT count(*) ... WHERE user_id = ?` uma vez **por servidor** (~194 por
abertura da aba), cada uma varrendo a tabela inteira, cada uma na sua própria
transação (o método não tinha `@Transactional`).

Medido em 20/08/2026, 439.993 registros reais, 194 identificadores reais:

| | plano | buffers | tempo |
|---|---|---|---|
| antes — 194 contagens separadas | Parallel Seq Scan | ~715.000 | **3.775 ms** |
| depois — 1 consulta agrupada, sem índice | Parallel Seq Scan | 3.707 | **359 ms** |
| depois — 1 consulta agrupada, com o índice | Index Only Scan | 660 | **16,6 ms** |

⚠️ **O salto grande é do Java, não do índice.** `countByUserIdIn` + o
`@Transactional` levam de 3.775 ms a 359 ms; o índice leva de 359 ms a 16,6 ms.
Aplicar só o índice deixaria as ~194 idas e voltas de rede no lugar — cada uma
rápida, a forma inalterada. Por isso as duas metades viajam no mesmo commit, e
por isso o `R019` avisa que derrubar o índice **não** ressuscita o N+1.

O segundo beneficiário é só do índice: a guarda de remoção de cadastro
(`deleteStaff`) conta as passagens de UMA pessoa e passou de **3.685 buffers
(~29 MB) / ~20 ms** para **3 buffers / ~0,02 ms**. Custo do índice: **3 MB**.

### ⚠️ A V018 é a SEGUNDA sem transação, e vem com metade da correção no Java

Índice `(timestamp)` para as quatro consultas do tique de 5 s do Painel
Administrativo; a outra metade é a correção do anti-join em
`countActiveUsersSince`. A medição completa — incluindo a nota honesta de que o
anti-join **quase não melhora num dia cheio** — vive no cabeçalho do próprio
`V018__access_logs_indice_hora.sql`.

### ⚠️ A V017 fecha a ÚNICA divergência de schema conhecida entre duas instalações

Cria os **6 CHECK de enum** que a `V014` não criou em `student_regimes` e
`student_regime_events`. Detalhes no cabeçalho de
`V017__student_regimes_enum_checks.sql`.

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
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V018__access_logs_indice_hora.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V017__student_regimes_enum_checks.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V019__access_logs_indice_user_id.sql
```

Conferência: `\d student_exit_permissions` mostra `authorized_by_family` e
`authorized_by_school`, e **não** mostra `reason`.

Por que a exceção foi aceita: a tabela tinha **uma** linha em produção, com `reason = 'teste'`
(conferido em 12/08/2026) — a funcionalidade nunca foi usada. E a coluna nunca significou
"motivo": o formulário gravava nela o nome de quem autorizou. Detalhe do raciocínio no
cabeçalho do próprio V012.

### ⚠️ A V020 tem de ser aplicada À MÃO na VM — o `ddl-auto` **não** a faz por si

A **V020** cria `cantine_removals` (a retirada manual de uma linha do Moniteur
Cantine). Ela é **aditiva**, e a regra geral deste README diria que o
`ddl-auto=update` a resolve sozinho. **Não vale aqui**, e a razão não é que o
Hibernate falhe — é que ele **conseguiria**:

Quem cria a tabela escreve o schema naquele ambiente, e o `ddl-auto=update`
**nunca corrige depois** (acrescenta coluna e tabela, jamais altera constraint
já existente). Se o backend novo subir primeiro, a VM fica com a tabela escrita
pelo Hibernate e este ficheiro deixa de ter efeito — as duas instalações passam
a ter autores diferentes, que é exactamente a divergência que a **V017** existiu
para fechar, e o sintoma aparece semanas depois.

**Aplicar ANTES de subir o backend novo.** Comando exacto, com a opção que faz
`psql` falhar quando o SQL falha:

```bash
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
  < deploy/migrations/V020__cantine_removals.sql
echo "exit=$?"    # 0 = aplicada · qualquer outro valor = NÃO aplicada, não subir o backend
```

Conferência (as três, e a terceira é a que ninguém pensa em fazer):

```bash
# 1. a tabela e a UNIQUE existem
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d cantine_removals"

# 2. as 9 colunas, com os tamanhos deste ficheiro e não outros
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns \
    WHERE table_name = 'cantine_removals' ORDER BY ordinal_position;"

# 3. NENHUM CHECK — a tabela não tem coluna de enum, e é isso que se confere.
#    Um CHECK aqui significa que alguém acrescentou um enum ao modelo sem a
#    migração correspondente, e a VM e o PC já divergem.
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT conname, contype FROM pg_constraint WHERE conrelid = 'cantine_removals'::regclass;"
#    Esperado: só 'p' (primary key) e 'u' (unique).
```

⚠️ **A permissão nova não vem com a migração.** `CANTINE_REMOVAL_WRITE` vive na
coluna `system_users.permissoes` (V005) e é concedida na tela de operadores.
Ninguém a tem no dia do deploy — nem é preciso: o ADMIN passa sempre. Sem a
conceder, o × simplesmente não aparece para os operadores, e o monitor continua
a funcionar como antes.

Rollback: `rollback/R020__drop_cantine_removals.sql`. ⚠️ Ele **apaga** o registo
das retiradas (não há cópia noutro sítio) e **não é seguro com o jar novo no
ar** — voltar o backend primeiro. Nenhuma passagem se perde: a retirada nunca
tocou em `access_logs`.

### ⚠️ V021 / V022 / V023 — le planning de cantine devient une configuration

Trois fichiers, dans cet ordre, **avant** de monter le backend :

| | Rôle |
|---|---|
| `V021__meal_slots.sql` | les 3 tables (`meal_slots`, `meal_slot_classes`, `meal_slot_students`) |
| `V022__denial_reason_meal_slot.sql` | élargit le CHECK de `denial_reason` avec `MEAL_SLOT_NOT_CONFIGURED` |
| `V023__meal_slots_seed.sql` | l'affiche de la Vie Scolaire + la reprise de `class_schedules` |

```bash
cd /opt/magbo   # racine du dépôt sur la VM
for f in V021__meal_slots V022__denial_reason_meal_slot V023__meal_slots_seed; do
  echo "== $f"
  docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
    < deploy/migrations/$f.sql || { echo "ÉCHEC sur $f — NE PAS monter le backend"; break; }
done
```

⚠️ **`ON_ERROR_STOP=1` n'est pas décoratif** : sans lui `psql` continue après
l'erreur et sort avec 0 (voir la section 2). Ici, une V022 qui échoue en
silence produit un backend qui plante à la première passage d'un élève sans
créneau — **dans la transaction**, en emportant l'`access_log` d'un passage
réel.

⚠️ **La V022 avant le backend, pas après.** Contrairement à la V015 (dont la
bombe attendait le premier régime saisi), celle-ci part le jour même, au
premier service.

Vérifications (les trois, la dernière est celle qu'on oublie) :

```bash
# 1. les créneaux existent, deux passages par jour + les 11h repris
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT dia_semana, hora, rotulo FROM meal_slots ORDER BY dia_semana, hora;"

# 2. ⚠️ le fait qui a dicté le modèle : une turma dans DEUX créneaux le même
#    jour (mardi, 1E2 et 1E3). Si cette requête est vide, le seed est incomplet.
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT mc.turma, count(*) FROM meal_slot_classes mc JOIN meal_slots ms ON ms.id=mc.slot_id \
    WHERE ms.dia_semana=2 GROUP BY 1 HAVING count(*)>1;"

# 3. aucune turma d'élèves sans créneau (hors turmas de test)
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT DISTINCT u.turma FROM app_users u WHERE u.tipo='ALUNO' AND u.ativo AND u.turma<>'' \
     AND NOT EXISTS (SELECT 1 FROM meal_slot_classes mc WHERE mc.turma=u.turma);"
```

⚠️ **Deux turmas de l'affiche n'ont aucun élève en base** — `5E3` et `3E3`,
vérifié et non deviné. Elles sont semées quand même (la table transcrit
l'affiche) et l'écran d'administration les signale. Elles ne changent le verdict
de personne : aucun élève n'y est rattaché.

⚠️ **`V023` n'a pas de rollback propre**, et c'est assumé : ses lignes vivent
dans les tables de la V021 et partent avec `R021`. Un `R023` qui n'effacerait
« que ce que le seed a mis » est impossible à écrire honnêtement — dès le
premier clic dans l'écran d'administration, les lignes semées et celles
éditées par la Vie Scolaire sont indiscernables.

### ⚠️ V024 — le magasin des réglages modifiables à l'écran

`system_settings` : la **surcouche** des properties `magbo.*`. Une ligne
n'existe que quand quelqu'un a modifié un réglage depuis l'écran de
configuration, et elle porte QUI et QUAND.

⚠️ **Le contrat, et il est structurel :** une base **sans aucune ligne** se
comporte **exactement** comme avant la migration. Les properties restent les
valeurs par défaut ; cette table ne fait que les couvrir. Il n'y a donc rien à
semer, et la table naît vide.

⚠️ **Aucun secret ici.** Tokens, mots de passe et PIN restent dans le `.env` :
une table lisible depuis un écran d'administration est exactement l'endroit où
un secret ne doit pas vivre. `SettingsService` ne les accepte pas.

```bash
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
  < deploy/migrations/V024__system_settings.sql
echo "exit=$?"    # 0 = appliquée
```

Vérifications :

```bash
# 1. quatre colonnes, PK sur chave, AUCUN check
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d system_settings"

# 2. la table doit être VIDE à la naissance — c'est le contrat
docker exec magbo-postgres psql -U magbo -d magbodb -tAc \
  "SELECT count(*) FROM system_settings;"       # -> 0
```

Comme la V021, elle commence par une garde : si la table existe déjà sous une
autre forme (backend monté trop tôt, `ddl-auto` passé devant), elle **échoue
bruyamment** au lieu d'annoncer un succès sur un schéma qui n'est pas le sien.

Rollback : `rollback/R024__drop_system_settings.sql`. ⚠️ Il efface les réglages
**et le comportement revient aux défauts du code, en silence** — prévenir qui
opère avant de le lancer.

### ⚠️ V025 — les exclusions du CDI (donnée sensible sur mineur)

`cdi_exclusions` : qui ne doit pas entrer au CDI, et jusqu'à quand.

⚠️ **Elle n'empêche personne d'entrer.** Le terminal ouvre de toute façon
(ADR-003) ; la table sert à PRÉVENIR l'adulte présent au badge. Il n'est pas
question de transformer une exclusion pédagogique en verrou physique.

⚠️ **Chaque ligne nomme un enfant et raconte une sanction.** Lecture par
`CDI_EXCLUSION_WRITE` uniquement — jamais par secteur. L'écran du CDI reçoit
les cibles actives *sans motif ni auteur* : il doit reconnaître, pas raconter.

⚠️ **Lever n'efface pas** : `revogado_em`/`revogado_por` sont remplis et la
ligne reste. Même doctrine que `student_exit_permissions`.

```bash
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb \
  < deploy/migrations/V025__cdi_exclusions.sql
echo "exit=$?"
```

Vérifications — la deuxième est celle qui compte :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d cdi_exclusions"

# ⚠️ Le CHECK doit MORDRE dans les deux sens (les deux doivent ÉCHOUER) :
docker exec magbo-postgres psql -U magbo -d magbodb -c \
  "INSERT INTO cdi_exclusions (criado_por) VALUES ('t');"                        # ni l'un ni l'autre
docker exec magbo-postgres psql -U magbo -d magbodb -c \
  "INSERT INTO cdi_exclusions (user_id,turma,criado_por) VALUES ('1','6E1','t');" # les deux
```

Rollback : `rollback/R025__drop_cdi_exclusions.sql`. ⚠️ Il efface les
exclusions **et leur historique** — des décisions pédagogiques prises sur des
mineurs. Confirmer avec la direction avant.

### ⚠️ V026 — le registre des alertes du CDI

`cdi_alert_events` : chaque alerte MONTRÉE à l'écran du CDI laisse une trace —
type (`EXCLUSION` / `CAPACITE` / `FERME`), personne le cas échéant, heure du
**badge** (jamais celle du traitement), et ce que l'écran affichait.

⚠️ **C'est la réponse à une famille six semaines plus tard** (« pourquoi mon
enfant a-t-il été signalé, et combien de fois ») — la réserve n°1 de la nuit
du 26→27/08, actée par Sam. Lecture par `CDI_EXCLUSION_WRITE` uniquement ;
l'écriture (POST de l'écran du CDI) est par aire `cdi`.

⚠️ **Pas d'enum en base** : `tipo` est VARCHAR + CHECK manuel
(`ck_cdi_alert_events_tipo`). Un type nouveau dans `CdiAlertService.TIPOS` =
élargir ce CHECK **dans la même livraison**, sinon l'INSERT échoue só na VM
(a armadilha V009/V015, pela terceira vez).

```bash
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb   < deploy/migrations/V026__cdi_alert_events.sql
echo "exit=$?"
```

Vérifications :

```bash
docker exec magbo-postgres psql -U magbo -d magbodb -c "\d cdi_alert_events"

# ⚠️ Le CHECK doit MORDRE (doit ÉCHOUER) :
docker exec magbo-postgres psql -U magbo -d magbodb -c   "INSERT INTO cdi_alert_events (tipo,point_id,event_time) VALUES ('AUTRE','BIBLIO',now());"

# La table naît vide :
docker exec magbo-postgres psql -U magbo -d magbodb -tAc "SELECT count(*) FROM cdi_alert_events;"
```

⚠️ **La limite structurelle, à connaître avant de répondre à une famille :
le registre n'écrit que lorsque l'écran du CDI est OUVERT** (le POST part du
poste, au moment où l'alerte s'affiche). Poste éteint, écran fermé, réseau
coupé : le badge a eu lieu, l'alerte n'a pas sonné, et il n'y a PAS de ligne.
**L'absence de ligne ne prouve jamais l'absence de badge** — pour ça il y a
`access_logs`, qui ne dépend d'aucun écran. L'onglet Historique montre les
500 dernières lignes et le dit.

Rollback : `rollback/R026__drop_cdi_alert_events.sql`. ⚠️ **Il efface un
registre de signalements concernant des enfants** — sans le dump antérieur,
ces lignes ne reviennent pas. Un pg_dump AVANT, toujours.

## 3. Ordem de aplicação

Aplicar **na ordem** V001 → V026. As migrations V001..V004 devem estar aplicadas **antes** de
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
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V018__access_logs_indice_hora.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V017__student_regimes_enum_checks.sql
docker exec -i magbo-postgres psql -U magbo -d magbodb < deploy/migrations/V019__access_logs_indice_user_id.sql
# ⚠️ A partir daqui, com ON_ERROR_STOP=1 — ver a secção 2. `psql` sai com 0
# mesmo quando o SQL falha, e uma migração que falha em silêncio é um backend
# a subir contra um schema que ninguém verificou.
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb < deploy/migrations/V020__cantine_removals.sql
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb < deploy/migrations/V021__meal_slots.sql
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb < deploy/migrations/V022__denial_reason_meal_slot.sql
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb < deploy/migrations/V023__meal_slots_seed.sql
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb < deploy/migrations/V024__system_settings.sql
docker exec -i magbo-postgres psql -v ON_ERROR_STOP=1 -U magbo -d magbodb < deploy/migrations/V025__cdi_exclusions.sql
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
| `V018__access_logs_indice_hora.sql` | índice `(timestamp)` em `access_logs` — o tique de 5s do painel | Painel administrativo |
| `V019__access_logs_indice_user_id.sql` | índice `(user_id)` em `access_logs` — a aba Personnels e a guarda de remoção | Personnels |
| `V017__student_regimes_enum_checks.sql` | os **6 CHECK de enum** que a `V014` não criou em `student_regimes` / `student_regime_events` | Uma verdade de schema |
| `V020__cantine_removals.sql` | tabela `cantine_removals` — a retirada manual de uma linha do Moniteur Cantine (**sem coluna de enum, logo sem CHECK, de propósito**) | Moniteur Cantine |
| `V021__meal_slots.sql` | tabelas `meal_slots` / `meal_slot_classes` / `meal_slot_students` — o planning da cantina vira configuração (**ADR-005**; `class_schedules` deixa de ser lido pela cantina) | Créneaux |
| `V022__denial_reason_meal_slot.sql` | amplia o CHECK de `denial_reason` com `MEAL_SLOT_NOT_CONFIGURED` | Créneaux |
| `V023__meal_slots_seed.sql` | **seed**: a afixação da Vie Scolaire 2026 + a reprise de `class_schedules` para o que ela não nomeia | Créneaux |
| `V024__system_settings.sql` | tabela `system_settings` — a **surcouche** dos reglages modificáveis a ecrã (**nasce vazia**; sem linha = default do código) | Configuração |
| `V025__cdi_exclusions.sql` | tabela `cdi_exclusions` — quem não deve entrar no CDI (**avisa, nunca impede**; dado sensível sobre menor) | CDI |
| `V026__cdi_alert_events.sql` | tabela `cdi_alert_events` — o registro de cada alerta MOSTRADA no ecrã do CDI (hora do **badge**; dado sensível sobre menor; leitura só por `CDI_EXCLUSION_WRITE`) | CDI |

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
