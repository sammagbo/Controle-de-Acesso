# ADR-004 — Cantina: bloqueio operacional assistido (não físico via HikCentral)

## Contexto
O ADR-003 fixou que o MAGBO é **observacional**: o webhook é pós-evento e o backend **não fecha
porta**. Ficava em aberto **como a escola de fato aplica a regra de refeição** (direito /
horário / dedup) já que o MAGBO só classifica e mede a divergência (`divergenciaHoje`).

Três caminhos eram possíveis para "fazer valer" a negação de uma refeição: (A) espelhar os
direitos do MAGBO em *access levels* do HikCentral para o terminal recusar fisicamente;
(B) o MAGBO comandar o relé da porta; (C) manter o terminal validando só **identidade** e um
**operador** aplicar a regra com o MAGBO à frente. Era preciso escolher — e a escolha define o
papel do HikCentral e a criticidade do feed de tentativas negadas.

## Decisão
**Cantina = bloqueio operacional assistido.** Durante o serviço, um **operador** fica com o
MAGBO aberto (tablet/notebook). O **terminal valida IDENTIDADE**; o **MAGBO valida a REGRA**
(direito à refeição / janela de horário / deduplicação); o **operador aplica a EXCEÇÃO**. **Não
há bloqueio físico via HikCentral para refeição — nem agora nem no roadmap.** Os direitos de
refeição vivem **somente no MAGBO** (sem sincronização MAGBO↔HikCentral de direitos).

## Alternativas consideradas
- **(A) Sincronizar os direitos do MAGBO como *access levels* no HikCentral** (terminal recusa a
  refeição fisicamente). **Rejeitada:** a propagação HCP→terminal não é instantânea (lote com
  fotos leva minutos a dezenas de minutos), a aplicação pode **falhar parcialmente** por
  pessoa/dispositivo (`Failed`), e o **rollback** de um nível aplicado errado é caro e lento —
  incompatível com uma fila de almoço. Além disso duplicaria no HCP um dado que o MAGBO já
  mantém como fonte de verdade.
- **(B) O MAGBO comandar o relé da porta** em tempo real. **Rejeitada** — ver ADR-003: o webhook
  é pós-evento; quando o HTTP chega, a porta **já operou**; o aparelho ignora a resposta do MAGBO.
- **(C) Operador assistido** (terminal = identidade, MAGBO = regra, operador = exceção).
  **Escolhida.**

## Consequências
- O **HikCentral vira provisionamento puro**: cadastro e ciclo de vida de pessoas (importação
  em lote + *Apply to Device*), **não** guarda direitos de refeição nem faz bloqueio de cantina.
- O **feed de tentativas negadas é peça crítica de UX** (F7a): é por ele que o operador percebe,
  em tempo real, quem foi negado e por quê. Já existe no código — `CantineMonitor` (polling 3s)
  embute o `DeniedAttemptsFeed` (polling 5s) com *badges* por motivo (`DenialReason`).
- Exige **operador presente durante o serviço**. A exceção operacional é um **registro manual**
  (`POST /api/access`, `created_by_user`) — decisão consciente do operador, auditável.
- A **divergência física × lógica** da cantina deixa de ser "lacuna a fechar com o HCP" e passa
  a ser **propriedade permanente e desejada** do modelo. `divergenciaHoje` continua medindo, mas
  agora como métrica de carga do operador, não de cobertura de bloqueio pendente.
- Em **produção**, `magbo.policy.meal-pending=DENY` (pré-requisito operacional: a Direção importa
  a lista de autorizados **em lote** — Fase G — **antes** do dia 1 do piloto). Os direitos são
  administrados pela Direção/Vice-Direção; o operador da cantina **executa** as alterações de
  entitlement no MAGBO.

## Evidência
- **Decisão do Sam, 2026-07-16**, após o *smoke test* com hardware (3/3) e a reunião com o
  Fabiano (SI) sobre o papel do HikCentral.
- O **feed já existe no código**: `CantineMonitor` (polling 3s) + `DeniedAttemptsFeed` (polling
  5s, *badges* por motivo) — a UX que sustenta o modelo assistido não depende de nova
  implementação de bloqueio.
- Coerente com ADR-003 (webhook pós-evento) e ADR-002 (identidade por `employeeNoString`; o
  MAGBO não guarda cartão). Refina, para o caso **refeição**, a menção genérica do ADR-003 a
  "bloqueio físico via HikCentral".

## Status
**Aceita** — 2026-07-16, por Sam.
