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

## Eixo 3 — Drift de schema (migrations × Hibernate × produção)

_Pendente._

## Eixo 4 — Percurso completo com cliques

_Pendente._

## Eixo 5 — Passada de segurança

_Pendente._

## Eixo 6 — Docs × código

_Pendente._

## Eixo 7 — Pacote de release

_Pendente._

## Relatório final por severidade

_Pendente._
