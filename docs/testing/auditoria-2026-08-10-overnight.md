# Auditoria noturna — 10→11/08/2026

Sessão de verificação sobre a `main` **8fef0f9** (pós-merge #28), executada com
backend e Postgres **locais e descartáveis** (container próprio `magbo-verify-pg`
na 5433; a VM, as câmeras e o HikCentral **não foram tocados**). Missão:
ACHADOS, não refatoração. Correções só quando pequenas, seguras e prováveis,
cada uma em branch própria.

Os sete eixos, na ordem pedida. Status parcial commitado ao fim de cada eixo.

---

## Eixo 1 — Suíte limpa (do zero) ✅

`backend/target` **apagado inteiro** (não só `test-classes`), compilação e
suíte completas do zero, sem rede (`mvn -o test`):

| suíte | resultado |
|---|---|
| `mvn test` (do zero) | **603 testes, 0 falhas, 0 erros, 2 `@Disabled`** |
| `npm test` | **279 testes, 0 falhas** |

**Nenhum teste falha só a partir do build limpo** — os números batem com os do
build incremental. O risco documentado do `test-compile` incremental (BUILD
SUCCESS falso com assinatura de construtor mudada) não deixou resíduo na `main`
atual. Os 2 `@Disabled` são os dois de sempre (`LegacyRegressionIT`,
PostgreSQL-only) — tratados no eixo 2.

## Eixo 2 — Queries nativas contra verdade conhecida ✅ (com 1 achado sério)

**Enumeração do ponto cego:** a suíte tem exatamente **2** testes `@Disabled`
(`LegacyRegressionIT`: `currentOccupancyByPoint`, `DISTINCT ON`;
`countUnregisteredExits`, `interval '4 hours'`). O repositório tem **14**
consultas `nativeQuery=true` (12 em `AccessLogRepository`, 1 em
`AccessAttemptRepository`, 1 em `MealEntitlementRepository`); as demais rodam
em H2, que **não é** PostgreSQL — por isso todas foram executadas em PG 16
real, com o SQL **extraído do próprio `.java`** (nunca redigitado) sobre um
cenário de 23 linhas com verdade calculada à mão (8 pessoas, 4 postos fixos,
o incidente `JA_PRESENTE` do aluno 0003053, par de 45 min na enfermaria,
FORA_HORARIO, 3 attempts).

| consulta | resultado | veredito |
|---|---|---|
| countMovements (crua) | 23 | ✅ exata |
| countMovementsInternal | 12 | ✅ exata |
| countUniqueStudents | 8 | ✅ exata |
| countByHour | h8:2 h9:2 h11:3 h12:2 h13:1 h14:1 h16:1 | ✅ exata |
| statsByPoint | 5 pontos, todos os trios corretos | ✅ exata |
| countOffScheduleMeals | 1 | ✅ exata |
| countPresentToday | 1 | ✅ exata |
| countLongInfirmaryStays *(nunca roda na suíte)* | 1 | ✅ exata |
| countUnregisteredExits *(nunca roda na suíte)* | 3 | ✅ exata |
| currentOccupancyByPoint *(nunca roda na suíte)* | BIBLIO 1 · ENFERM 1 · REFEI1 1 · REFEI2 1 · PORT1 ausente | ✅ exata (assimetria confirmada) |
| countUniqueStudentsByPoints | REFEI 3 · BIBLIO 3 | ✅ exata |
| avgStayMinutesByPoints | REFEI 20.0 · BIBLIO 21.0 | ✅ exata |
| attempts.countByTurmaSince | 3B→2 (user nulo fora, pelo JOIN) | ✅ exata |
| mealEntitlements.findEntitlementsWithUsers | exercitada no eixo 4 (tela) | — |

Contadores JPQL pela API (`/api/stats/global`): totalToday 13 · alertas 1 ·
ativos 3 · negadas 3 · divergência 3 — **todos exatos**.

### ⚠️ ACHADO (severidade b): o emparelhamento de visitas ignora as flags de repetição

`VisitStatsService.visits()` **empareia os logs crus** — não exclui
`JA_PRESENTE` nem `POSTO_FIXO`. Provado ponta a ponta pelo
`/api/access/overview`, card do CDI, com o incidente real semeado
(E12:49 · E12:51 `JA_PRESENTE` · E12:54 `JA_PRESENTE` · S13:10):

| | visitas | duração média |
|---|---|---|
| **verdade** | 2 (aluno C fechada 21 min + aluna D aberta) | 21 min |
| **observado** | **4** | **16 min** |

Cada ENTRADA marcada vira uma "visita aberta" fantasma no pareamento por
pilha, e a visita fechada mede 12:54→13:10 em vez de 12:49→13:10. **O gêmeo do
frontend (`js/utils/reportFilters.js#pairVisits`, que calcula o Rapport CDI no
cliente) tem exatamente a mesma lacuna.** As flags foram ligadas às consultas
e às telas, mas as duas camadas de PAREAMENTO ficaram de fora — e
`JA_PRESENTE` marca ALUNO, que é a visão padrão do CDI.

Correção proposta (pequena e assimétrica, espelhando as consultas): o pareador
**pula ENTRADA marcada como repetição, nunca uma SAÍDA** — ver branch de fix
listada no relatório final.

## Eixo 3 — Drift de schema (migrations × Hibernate × produção) ✅

Comparação a três em PG 16.14 local: **A** = Hibernate `ddl-auto` sobre banco
vazio · **B** = A + `V001..V011` na ordem · **C** = `schema-producao.sql`
(dump schema-only da produção real, 11 tabelas). Fingerprint por
`information_schema` (colunas/tipos/nulidade) + `pg_constraint` (CHECKs) +
`pg_indexes`.

### O resultado central: produção está EM DIA

- **Colunas: os três IDÊNTICOS** — 113 colunas, tipos e nulidade iguais,
  incluindo `posto_fixo_point_id` (V010) e a tabela `user_photos` (V011).
- **A armadilha da V009 NÃO tem irmãos novos:** o CHECK de `denial_reason` na
  produção já contém os 12 valores (`UNKNOWN_FACE`/`AMBIGUOUS_NAME` inclusos) e
  `meal_entitlement_events.source` existe lá — as duas armadilhas conhecidas
  estão aplicadas.
- Diferenças de CHECK entre A e C são de **formato** (`x IS NULL OR x = ANY`
  vs `x = ANY` — para coluna nullable, semanticamente equivalentes: CHECK com
  NULL passa). Única diferença **real** A×C: o CHECK de `source`, que o
  Hibernate não gera — exatamente o que `database.md` já documenta.

### Achados

1. **(c) As migrations NÃO são autossuficientes.** Sobre banco vazio,
   V005/V007/V008/V010 falham (`relation does not exist`): elas pressupõem o
   schema-base nascido do Hibernate/dump. Uma VM reconstruída do zero **não**
   nasce de `deploy/migrations/` sozinha — precisa do dump antes. O README
   implica a ordem mas não afirma isso; vale uma frase explícita.
2. **(c) Índice UNIQUE duplicado se as migrations rodarem DEPOIS do
   Hibernate.** Em B, `app_users.camera_person_id` fica com DOIS índices únicos
   (`uk_5iw58k…` do Hibernate + `app_users_camera_person_id_key` da V008 — o
   `DO $$` da V008 só engole a exceção do próprio nome). A produção está limpa
   (só o da V008 ⇒ lá a V008 rodou antes do boot). Efeito: custo de escrita
   redundante, sem risco funcional.
3. **(c) O PC (só `ddl-auto`, sem migrations) roda SEM os índices de
   performance da V006** (`idx_attempts_*`, `idx_ment_events_user_ts`,
   `idx_exitperm_*`). O README diz que o PC "não precisa dos SQLs", o que é
   verdade para o schema — mas não para esses índices. Impacto contido (nenhum
   deles é em `access_logs`), porém real em `access_attempts` à medida que a
   portaria cresce.

## Eixo 4 — Percurso completo com cliques ✅ (1 seção do checklist está errada; 3 passos não retestados)

Electron real via driver, `MAGBO_API_URL` **explícito** para a instância local
(confirmado de dentro da página antes do primeiro clique), backend = `main` +
o fix do pareamento. `externos: []` no percurso inteiro (modo kiosk).

| seção do checklist | veredito |
|---|---|
| 1. Login e sessão | ✅ senha errada não entra; login ok. **1.5 (reload) — o CHECKLIST está errado**, ver achado abaixo |
| 2. Dashboard e setores | ✅ sem NaN; busca; registro manual por clique aparece na lista; enfermaria abre |
| 3. CDI | ✅ abre; toggle "Inclure le personnel" presente. 3.7/3.8 (scan de entrada/saída no CDI) não exercitados por clique |
| 3.9 Rapport CDI | ✅ indireto: os números do CDI no overview vêm do mesmo serviço, sem duração negativa |
| 4.1 Vue d'ensemble | ✅ toggle CDI presente; **nenhuma duração negativa**; card CDI = 2 visitas/21 min (o fix do pareamento em tela) |
| 4.2 Par élève | ✅ busca acha |
| 4.3 Journal | ✅ 27 mouvements; lente Répétitions; 10 etiquetas; fechamento das 17:00 listado. CSV (download) não assertado |
| 5.0 Layout Configurações | ✅ tela cheia, X visível |
| 5.2 HikCentral | ✅ aba abre com instruções. **Drop do arquivo não retestado** (a lib xlsx local é UMD de navegador e não gera fixture em Node; fluxo tem E2E anterior com arquivo real de 1198 linhas, 17/07) |
| 5.3 Servidores | ✅ lista carrega; coluna Posto fixo com rótulos; **reclassificação: busca + prévia lado a lado ("ALUNO RECEBE A FACE"/"SERVIDOR SERÁ INATIVADO") provadas em tela, nada confirmado** (screenshot; o painel aberto foi o da 1ª linha) |
| 5.x Fotos | ✅ dry-run (selo "nada gravado", 1 Nova + 1 Sem dono, banco em 0) → aplicar → "Gravado", banco com a foto (74 bytes, `por admin`) |
| 5.x Droits Repas (xlsx) | **não retestado** (mesma limitação de fixture; E2E anterior com XLSX real, D5, 17/07) |
| 6. Fechamento automático | ✅ observado ao vivo DUAS vezes na sessão (17:00 disparou e fechou presenças abertas; linhas no Journal) |
| 6-bis. Ocupação em SQL | ✅ coberto pelo eixo 2 (verbatim, PG real) |
| 7. Regressões | ✅ console limpo exceto: 1×401 (a própria tentativa de senha errada) e 404s do endpoint de foto (fallback de iniciais — comportamento desenhado) |

### ⚠️ ACHADO (severidade c, mas derrubou metade do percurso até ser isolado):
**o passo 1.5 do checklist afirma o contrário do código.** "Recarregar (Ctrl+R)
→ continua logado (token persistido)" — o token **nunca** foi persistido:
`js/utils/auth.js` o guarda em memória, com comentário explícito ("não
localStorage por segurança em Electron"), e `git log -S localStorage.setItem`
sobre o arquivo volta vazio em toda a história. Um F5 no kiosk = login de novo,
**por design**. Corrigir o checklist (e decidir, se quiser, se o design muda —
mas isso é decisão de segurança, não da auditoria).

## Eixo 5 — Passada de segurança

_Pendente._

## Eixo 6 — Docs × código

_Pendente._

## Eixo 7 — Pacote de release

_Pendente._

## Relatório final por severidade

_Pendente._
