# Handoff — estado real do sistema

**Para quem:** quem assumir o MAGBO depois do Sam, ou o próprio Sam voltando
depois de um tempo longe.
**Data de corte:** **2026-08-05** (último merge em `main`: `2902e74`).

Este documento descreve o sistema **como ele está**, não como foi planejado.
Onde há diferença entre a intenção e o que roda hoje, vale o que roda hoje.

> **Nada aqui contém senha, token ou segredo.** Os segredos vivem no `setx` do
> PC e no `deploy/.env` da VM, e não saem de lá. Se você encontrar um segredo
> neste arquivo ou em qualquer outro `.md` do repositório, isso é um incidente:
> rotacione e remova.

---

## 1. A semana de 29/07 a 05/08 em uma página

Foram **cinco deploys** nesta semana — o sistema saiu de "validado em bancada"
para "rodando com dado real e sendo corrigido em produção". As dez PRs mergeadas
estão em `git log --since=2026-07-29`.

| # | O que entrou | Commits principais |
|---|---|---|
| 1 | Pronote preenche `hikvision_employee_id`; token do webhook aceito na URL | `4bfb46a`, `d13a93d` |
| 2 | Telas de setor e CDI se atualizam ao vivo (antes só na montagem) | `3a96bce`, `a984fee`, `de97bdd` |
| 3 | Endurecimento da ingestão do webhook: descarte de tipos desconhecidos, dedup por aparelho+serial, IP na linha de log | `fd07b77`, `c7e65aa` |
| 4 | **Hora do evento** em vez da hora de recepção; Journal ao vivo com filtro no servidor | `8d78f41`, `4f7d49c` |
| 5 | Mesma passagem em 30s; fechamento automático de presença; cadastro, importação e ferramentas de servidor | `b20091b`, `687e360`, `63211d9`, `eac03f2` |
| — | Configurações em tela cheia; CDI conta alunos por padrão; reclassificação servidor→aluno | `c16b2d5`, `23ce665`, `f442db9` |

**Suíte:** `mvn test` → **350 testes, 0 falhas, 2 `@Disabled`** (as duas queries
nativas que só rodam em PostgreSQL). `npm test` → **58 testes, 0 falhas**.

---

## 2. As sete coisas que mudaram de comportamento

Se você só ler uma seção, leia esta. São as mudanças que alteram **como o dado
deve ser lido** — quem não souber delas vai interpretar os números errado.

### 2.1 O timestamp é a hora do EVENTO, não a da recepção

**Antes de 03/08 o backend gravava `LocalDateTime.now()` da recepção.** Um
terminal esvaziou a fila offline — 33 eventos em 2 minutos, às 14:51, de
passagens ocorridas horas antes — e os 33 acessos entraram no banco como se
tivessem acontecido às 14:51. Os relatórios mostraram **durações médias
negativas** e alunos na hora e no ponto errados.

Enfileirar e reenviar é comportamento **normal** dos terminais MinMoe quando o
destino cai (observado 2× em bancada). A hora de recepção nunca foi uma
aproximação segura.

Hoje, `EventTimeResolver` usa o `dateTime` do envelope do payload (ISO 8601 com
offset — os terminais ainda saem de fábrica em `+08:00`, então o que importa é o
**instante**, convertido para `America/Sao_Paulo`).

**Três guardas derrubam para a hora de recepção:**

| Guarda | Limite | Por quê |
|---|---|---|
| `dateTime` ausente ou ilegível | — | Não há hora para usar |
| Relógio do aparelho adiantado | > **5 min** no futuro | Evento "do futuro" corrompe relatório e presença |
| Hora antiga demais | > **30 dias** no passado | Aparelho que voltou ao relógio de fábrica (1970) |

**Todo fallback deixa uma linha INFO** com o IP e o motivo:

```
Hora do evento nao utilizavel, gravando a hora de recepcao (ip=..., motivo=..., dateTime=...)
```

> ⚠️ **O que NÃO mudou:** as **regras** (janela da cantina, dedup de refeição,
> permissão de saída) continuam avaliadas contra a **hora da decisão**. Só o
> timestamp gravado passou a ser o do evento. Uma fila reentregue às 14:51 grava
> as horas certas, mas foi julgada às 14:51. Ver §5.1 — é uma dívida aberta.

### 2.2 Três camadas de deduplicação, e elas NÃO são a mesma coisa

Esta é a confusão mais cara do sistema. As três existem, as três estão ligadas,
e cada uma resolve um problema diferente:

| Camada | Property | Janela | O que atrapalha | Chave |
|---|---|---|---|---|
| **Ingestão** | `magbo.ingestion-dedup.*` | **60 s** | O aparelho **reenviou o mesmo pacote** | IP de origem + `serialNo` |
| **Mesma passagem** | `magbo.same-passage-window-seconds` | **30 s** | O terminal reconheceu **duas vezes a mesma pessoa**, gerando eventos **diferentes** | pessoa + ponto + ação |
| **Refeição duplicada** | `magbo.dedup.window-seconds` | **90 s** | **Regra de negócio**: segunda refeição no dia | pessoa + ponto (cantina) |

Por que a do meio precisou existir: em 03/08, o mesmo aluno gerou ENTRADA às
`10:06:50` e de novo às `10:06:51`. `serialNo` novo, então o dedup de ingestão
deixou passar — **e deve mesmo**, são eventos distintos. A janela é por
`(pessoa + ponto + ação)`, então **ENTRADA seguida de SAIDA continua valendo**.

> **Todo descarte de ingestão deixa uma linha INFO com `ip` + `serialNo`.** Em
> produção o nível é INFO, então o descarte fica visível no arquivo de log.
> Um evento que some em silêncio é a pior falha possível aqui.

### 2.3 Fechamento automático de presença

A presença deriva do **último evento**. Quem entra no CDI e não passa o rosto na
saída ficaria "dentro" para sempre, e no dia seguinte a tela abre com gente de
ontem.

`PresenceAutoCloseService` roda **a cada 5 minutos** e fecha todo ponto cuja hora
de fechamento já passou no dia:

```properties
magbo.presence.auto-close.enabled=true
magbo.presence.auto-close.cron=0 */5 * * * *
magbo.presence.auto-close.times[BIBLIO]=17:00
```

A SAIDA sintética é **declarada, nunca disfarçada de crachá**:
`flag=FECHAMENTO_AUTO` · `created_by_user=system`.

Três propriedades que importam:
- **Carimba a hora de FECHAMENTO (17:00), não a hora em que o job rodou.** Se o
  backend estiver parado às 17:00, o fechamento acontece quando ele voltar, com
  a hora certa.
- **É idempotente por duas vias.** A segunda existe porque quem entra às 17:30
  volta a ser candidato — sem ela, cada execução seguinte gravaria outra SAIDA
  das 17:00.
- **Não entra em média de duração.** 17:00 não é hora de saída de ninguém.

> **Hoje só o `BIBLIO` fecha automaticamente.** A cantina não. Ver §5.2.

### 2.4 Os relatórios contam ALUNO por padrão

Desde que os servidores existem em `app_users` (**152 FUNCIONARIO + 49
PROFESSOR**), eles poluíam os números do CDI: entram por segundos, quase nunca
passam o rosto na saída, e o fechamento das 17:00 transformava isso em
"permanência de um dia inteiro" — cerca de 15 `FUNC-###` foram fechados assim
num único dia.

Hoje o filtro por tipo está em três lugares, todos com o mesmo padrão
(`incluirFuncionarios = false`):
- backend: `VisitStatsService` (parâmetro do serviço) e `filtrarPorTipo` no
  `AccessController` (parâmetro `tipo` dos endpoints de log);
- frontend: `MagboReport.filterPeopleByTipo` / `filterLogsByTipo`
  (`js/utils/reportFilters.js`), consumidos pelo `CdiBackend`;
- UI: a caixa **"Inclure le personnel (CDI)"** no Rapport Général e a linha
  cinza "Élèves seulement" nas estatísticas do CDI.

> ⚠️ **É filtro de EXIBIÇÃO.** `access_logs` recebe tudo, o Journal mostra tudo.
> Nada é apagado. Quando dois relatórios discordam, **esta caixa é a primeira
> coisa a conferir.**

### 2.5 Passagem rápida não é permanência

Uma visita fechada (ENTRADA→SAIDA, mesma pessoa, mesmo ponto) mais curta que
`magbo.report.min-visit-seconds` (**60 s**) não conta como visita nem entra na
média. Quem entra para dar um recado e sai não teve permanência.

O emparelhamento é **por pilha**, não posicional. O anterior casava de dois em
dois sobre uma lista que chega em ordem **decrescente**, e casava a saída de uma
visita com a entrada de outra — foi o que produziu **durações negativas** no
relatório do CDI. Hoje vive em `js/utils/reportFilters.js` (`pairVisits`), com
teste.

> ⚠️ **Não confundir com `magbo.same-passage-window-seconds` (30 s).** Aquela é
> regra de **ingestão** e descarta a segunda leitura. Esta **não descarta linha
> nenhuma** — só não conta na estatística.

### 2.6 O piso de visita tem fonte única

O Rapport CDI é calculado **no cliente**, mas o piso mora no **backend**.
Enquanto o JS tinha a própria constante, mudar a property sem mudar o JS fazia a
**mesma tela mostrar dois números para o mesmo dia**, e nada acusava a
divergência.

Hoje: `GET /api/access/report-config` → `{ "minVisitSeconds": 60 }`.
Autenticado, **não admin** (quem opera o CDI precisa do valor e não é admin).
O `App.js` busca uma vez depois do login e entrega ao `MagboReport.configure()`.

O `FALLBACK_MIN_VISIT_SECONDS = 60` do JS é **fallback, não configuração**: só
entra em cena se o backend não responder. **Mexer nele não muda o sistema —
mexa na property.**

### 2.7 Ferramentas de servidor (professores e funcionários)

Cadastro de aluno continua vindo do Pronote. O que nasceu esta semana é o
tratamento dos **servidores**:

| Ferramenta | Onde | O que faz |
|---|---|---|
| Cadastro manual | Paramètres → *Cadastro Manual* | Matrícula (`FUNC-###` automática), identificador Hikvision, departamento (texto livre) |
| Importação em lote | Paramètres → *Importar Servidores* | `.xlsx` com `nome, hikvision_employee_id, tipo, departamento, matricula` |
| Importação do HikCentral | Paramètres → *HikCentral* | Lê o export "Renseignements personnels" (**cabeçalho na linha 9**), simula, e só grava depois da confirmação |
| Manutenção | Paramètres → *Servidores* | Editar, inativar, reativar, remover (**só sem passagens**) |
| **Reclassificação** | *Servidores* → **"É um aluno"** | Transfere a face para o aluno certo e inativa o registro falso |

**Por que a reclassificação existe:** 74 alunos estavam fora do departamento
ALUNOS no HikCentral, com id de 10 dígitos. A importação criou `FUNC-###`
segurando a face deles, e as passagens entravam como de servidor. A correção em
massa foi feita **por SQL**; a ferramenta é para o próximo caso.

Regras que a ferramenta respeita e que você não deve afrouxar:
- as **passagens ficam no registro antigo** — o passado não é reescrito;
- se o aluno já tem outra face, exige **confirmação explícita** (a face antiga
  deixa de reconhecê-lo);
- aluno que não está no MAGBO **não se cadastra por aqui** — entra pelo Pronote;
- casamento automático por nome **nunca** — trocaria a face de um aluno pela de
  outro.

---

## 3. Assinaturas de leitura — como saber de onde veio um registro

Seis meses depois, alguém vai perguntar "esse acesso veio do rosto ou do
teclado?". Estas são as marcas que respondem:

| Origem | `created_by_user` | Microssegundos do `timestamp` | `flag` |
|---|---|---|---|
| **Terminal** (face/cartão) | `NULL` | **zero** — o `dateTime` do payload tem precisão de segundo | `NULL`, `FORA_HORARIO` ou `EXCEDEU_TEMPO` |
| **Lançamento manual** no app | **login do operador** | **≠ zero** — `LocalDateTime.now()` do `POST /api/access` | igual ao acima |
| **Fechamento automático** | `system` | zero (carimbo `17:00:00`) | `FECHAMENTO_AUTO` |

Ou seja: **microssegundos ≠ 0 combinado com `created_by_user` preenchido = quase
certamente lançamento manual.** As duas marcas juntas, porque nenhuma sozinha é
prova: um dia o backend pode truncar o `now()`, e `created_by_user` também é
usado pelo `system`.

```sql
-- Lançamentos manuais de hoje, com o autor
SELECT id, user_id, point_id, action, timestamp, created_by_user
  FROM access_logs
 WHERE timestamp::date = CURRENT_DATE
   AND created_by_user IS NOT NULL
 ORDER BY timestamp DESC;
```

> **`access_logs` = acesso efetivo/autorizado · `access_attempts` = tudo tentado
> e negado.** Esta separação (ADR-001) é estrutural: `access_logs` **nunca**
> recebe evento negado, e nenhuma query legada mudou de resultado por causa dela.
> Se você precisar dos dois juntos, faça `UNION` na consulta — não misture na
> gravação.

---

## 4. Operação

### 4.1 Deploy de atualização na VM

> ⚠️ **Confirme os caminhos antes de usar.** Este procedimento é o que foi usado
> nos cinco deploys da semana, mas **o host, o caminho e o nome do serviço não
> estão versionados em lugar nenhum** — não pude confirmá-los a partir do
> repositório. Antes do primeiro deploy, valide cada um e **volte aqui para
> preencher**. Um handoff com um caminho inventado é pior que um handoff
> incompleto.

O deploy inicial (containers, banco, migrations) está em
[`deploy/README.md`](../../deploy/README.md) e na skill `deploy-vm`. O que segue
é a **atualização** de um sistema já no ar:

1. **Buildar no PC** (a VM não tem Maven nem precisa ter):
   ```powershell
   mvn -f backend/pom.xml clean package
   ```
   Produz `backend/target/access-control-1.0.0.jar`.

2. **Copiar o jar para a VM** por `scp`.

3. **Reiniciar o backend.**

**Não é mais preciso `sudo`** — o usuário do deploy foi colocado no grupo
`docker`, então `docker compose restart` roda direto. Se pedir senha, a
permissão do usuário na VM regrediu (ou você está com outro usuário).

4. **Conferir a saúde**, sempre, antes de sair:
   ```bash
   curl -s http://localhost:8080/api/health
   ```
   Tem que responder `"database":"CONNECTED"`.

5. **Smoke com CLIQUES, não só com `curl`.** Esta é a lição mais cara do
   projeto: em 17/07 três espécies diferentes de bug de fiação de UI passaram por
   toda a bateria de `curl` e só apareceram quando alguém percorreu as telas.
   O roteiro está em [`docs/frontend-smoke-checklist.md`](../frontend-smoke-checklist.md).

### 4.2 Backups — o que existe, e o que precisa ser verificado

**No PC (manual):** skill `backup-restauracao`.
```powershell
docker exec magbo-postgres pg_dump -U magbo -d magbodb -F c -f /tmp/magbo.dump
docker cp magbo-postgres:/tmp/magbo.dump .\backups\magbo-$(Get-Date -Format yyyyMMdd-HHmm).dump
```
Os dumps ficam em `backups/` — **diretório ignorado pelo git**, junto com
`backup_*.sql`. Nunca commitar dump: contém 923 alunos reais.

**Na VM:** existe [`deploy/backup.sh`](../../deploy/backup.sh) — dump comprimido
diário, retenção de 30 dias, `rsync` opcional para destino remoto, cron sugerido
`0 3 * * *`.

> 🔴 **VERIFIQUE ISTO ANTES DE CONFIAR NELE.** Lendo o script no repositório,
> duas coisas não batem com a instalação real:
>
> 1. `DB_NAME` tem valor padrão **`magbo_db`**, e o banco chama-se **`magbodb`**;
> 2. ele chama `pg_dump` **direto no host**, mas o PostgreSQL roda **em
>    container** — o host pode nem ter o cliente instalado.
>
> Nas duas hipóteses o script sai com erro (tem `set -euo pipefail`), mas o erro
> vai para `backup.log`, que ninguém lê. **Se o cron estiver ativo com os
> padrões, é possível que nunca tenha existido um backup automático.**
>
> Como confirmar, em um minuto na VM:
> ```bash
> crontab -l | grep -i backup          # o cron está mesmo ativo?
> ls -lh /var/backups/magbo/           # existe algum arquivo, e de quando?
> tail -30 /var/backups/magbo/backup.log
> ```
> Se a pasta estiver vazia: **faça um dump manual hoje** e só depois conserte o
> script (passar `DB_NAME=magbodb` e envolver em `docker exec`).

**Antes de qualquer bateria de testes ou migração: backup primeiro.** Sem
exceção.

### 4.3 Coisas que quebram em silêncio

| O quê | Como se manifesta | Como conferir |
|---|---|---|
| **IP mudou por DHCP** | Eventos simplesmente param de chegar. Nenhum erro. | `ipconfig` no PC, IP no display do terminal, URL da *Écoute HTTP*, e o `terminal_ip` em `door_mappings` |
| **`magbo-db` legado subiu** | Backend conecta no banco errado (vazio) | `docker ps` → se `magbo-db` estiver rodando: `docker stop magbo-db; docker start magbo-postgres` |
| **Surefire pulando os ITs** | `mvn test` passa com menos testes que o esperado | O `pom.xml` precisa do `<include>**/*IT.java`. Sem isso, os ITs são pulados **em silêncio** |
| **Backend sem as 4 env vars** | Conecta no banco errado (os fallbacks do perfil `prod` apontam para outro lugar) | `MAGBO_WEBHOOK_TOKEN`, `MAGBO_DB_URL`, `MAGBO_DB_USERNAME`, `MAGBO_DB_PASSWORD` na **mesma sessão** |
| **App aberto pelo `.exe` direto** | Tela vazia, sem erro | Abrir pelo `Abrir-MAGBO.bat` (§4.4) |

### 4.4 O aplicativo nos PCs

**Estado em 06/08: os PCs ainda rodam a v2.0.0**, e a v2.1.0 está preparada mas
não publicada. Procedimento completo em
[`release-portable.md`](release-portable.md).

O executável **não guarda configuração**: lê variáveis de ambiente e cai em
`http://localhost:8080` se não achar nada. Abrir o `.exe` direto abre o app
**vazio**, sem erro. O modelo do lançador está em
[`deploy/portable/Abrir-MAGBO.bat`](../../deploy/portable/Abrir-MAGBO.bat).

---

## 5. Dívidas abertas — o que NÃO corrigir sem decisão

Ordenadas por consequência.

### 5.1 As regras são avaliadas na hora da decisão, não na do evento

O timestamp gravado passou a ser o do evento (§2.1), mas a janela da cantina, o
dedup de refeição e a permissão de saída continuam olhando a **hora da decisão**.

**Consequência:** uma fila offline reentregue fora do horário de almoço pode
gerar `FORA_HORARIO` ou `EXCEDEU_TEMPO` para passagens que estavam perfeitamente
dentro da janela. Não é hipótese — é o mesmo mecanismo do incidente de 03/08,
sobrevivendo na camada de regras.

**Por que não foi corrigido junto:** mudar isso muda **decisão**, não
apresentação. Merece entrega própria, com teste de fila reentregue.

### 5.2 A cantina não tem fechamento automático

`magbo.presence.auto-close.times[]` só tem `BIBLIO`. Quem entra na cantina e não
passa o rosto na saída fica "dentro" indefinidamente. Enquanto a cantina não
entrou no ar, é inofensivo — **no dia 1 do piloto, deixa de ser.**

### 5.3 `DEVICE_DENIED` para subtipo desconhecido

Falta `UNKNOWN_EVENT` no enum, então subtipo desconhecido entra como
`DEVICE_DENIED` e **polui `divergenciaHoje`**. Congelado desde a Fase I.
Acrescentar valor ao enum exige atualizar o CHECK correspondente **na mesma
entrega** (ver §6).

### 5.4 Endpoints protegidos devolvem 403, não 401

`@PreAuthorize` sem token responde **403**. Só o webhook devolve 401. Cosmético
para a API, confuso para quem depura.

### 5.5 Duas camadas HTTP no frontend

`js/api.js` (`window.api`) e `js/utils/api.js` (normalisers) coexistem — dívida
D1. **Não criar uma terceira.** Consolidar só como tarefa própria.

### 5.6 Card "Barrados" == "Alertas Hoje"

Os dois leem o mesmo número. **Aceito por decisão do Sam** — redundância
consciente, sem campo livre para repontar sem duplicar outro card. Revisar o
layout do painel pós-piloto, com feedback da direção. **Não é pendência.**

### 5.7 `magbo.policy.meal-pending=DENY` em produção

Decisão D5 (16/07, ADR-004). **Pré-requisito operacional:** o bulk dos alunos
autorizados tem de ser feito **antes do dia 1** — sem ele, todo aluno fica
`PENDING` e **nenhuma refeição é registrada**. Dev mantém `OBSERVATION`.

---

## 6. Armadilhas de banco

- **`ddl-auto=update` só adiciona.** Nunca remove coluna nem relaxa constraint.
  Mudanças de schema: **sempre aditivas**, coluna nullable.
- **SQL versionado** em `deploy/migrations/` (V001..V007 + `rollback/`),
  idempotente. **Flyway não foi adotado** (baseline de schema Hibernate com
  ~440k registros seria projeto próprio — decisão registrada no README de lá).
  O PC usa `ddl-auto` e não precisa dos SQLs; **a VM precisa**, na ordem, antes
  de subir o backend.
- **Os CHECK constraints espelham os enums Java.** O Hibernate gera
  automaticamente para `@Enumerated(STRING)`. **Ao adicionar valor a um enum,
  atualize o CHECK na mesma entrega.**
- ⚠️ **`meal_entitlement_events.source` (`UI`|`BULK`|`API`) é guarda MANUAL.**
  No Java é String livre; o Hibernate **não** gera esse CHECK. Ele existe **só na
  VM** (via `V003`) — nem o PC (`ddl-auto`) nem os testes (H2 `create-drop`) o
  têm. Um valor novo de `source` no código faz o INSERT falhar **só na VM**.
- **Nunca setar `hibernate.jdbc.time_zone`.** As colunas são
  `timestamp without time zone` em hora local (BRT).

---

## 7. Onde procurar o resto

| Assunto | Arquivo |
|---|---|
| Contexto permanente do projeto | `CLAUDE.md` |
| Padrões por área | `.claude/rules/` |
| Arquitetura e fluxos | `docs/architecture/` |
| Decisões com justificativa | `docs/architecture/decisoes/` (ADR-001 a 004) |
| Endpoints | `docs/architecture/endpoints.md` |
| Plano e evidências de teste | `docs/testing/` |
| Auditoria independente A–K | `docs/testing/auditoria-fases-A-K-2026-07.md` |
| Manual do usuário final (FR) | `docs/manual-utilisateur.md` |
| Guia do operador da cantina | `docs/operacional/guia-operador-cantina.md` |
| Publicação do app | `docs/operacional/release-portable.md` |
| Procedimento HikCentral | `docs/operacional/procedimento-hikcentral.md` |
| Smoke de frontend (com cliques) | `docs/frontend-smoke-checklist.md` |

---

## 8. Regras de trabalho herdadas

Não são preferências de estilo — cada uma tem uma cicatriz atrás.

1. **Nunca commitar ou dar push sem confirmação explícita do Sam.** Regra
   violada 4× no passado.
2. **Patches cirúrgicos.** Âncora ausente ou duplicada → **pare e reporte**.
3. **Um passo → validar → commit → próximo.** Uma decisão por vez.
4. Português no chat, **inglês nos commits**.
5. **Nada de dado mock ou placeholder.** Em nenhuma tela, em nenhum teste que
   valide comportamento real.
6. Mudanças de banco: **só aditivas**.
7. **Smoke pós-deploy inclui cliques.** Ver §4.1, passo 5.

---

*Última revisão: 2026-08-06. Se algo aqui divergir do código, o código vence —
e este arquivo está errado e precisa ser corrigido.*
