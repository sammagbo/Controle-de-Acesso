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

## Eixo 2 — Queries PG-only contra verdade conhecida

_Pendente._

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
