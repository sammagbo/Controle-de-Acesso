# ADR-001 — Tentativas negadas em tabela própria (`access_attempts`), separadas de `access_logs`

## Contexto
`access_logs` é a fonte de verdade de **presença, refeições, ocupação e tendências** — mais de
15 consultas do sistema derivam dela (`countPresentToday`, ocupação por ponto, pareamento de
refeições, KPIs do dashboard, relatórios). Até a Fase A, **tudo** que o terminal enviava com
`employeeNoString` virava `access_log`, inclusive autenticações **negadas** pelo próprio
aparelho (subtipo 8) — o que gerava refeição falsa e contaminava a presença.

Era preciso passar a registrar as **tentativas negadas** (sem direito à refeição, sem
autorização de saída, usuário inativo, ID desconhecido, negação do dispositivo…) sem contaminar
nenhuma dessas consultas.

## Decisão
Criar a tabela **`access_attempts`** separada. `access_logs` passa a conter **apenas acesso
efetivo e autorizado**; `access_attempts` contém **tudo que foi tentado e não virou acesso**,
com os 4 eixos (método / resultado físico / decisão MAGBO / motivo).

## Alternativas consideradas
- **(A) Flags em `access_logs`** (`granted`, `authorization_result`, `denial_reason`…) e filtrar
  `granted=true` em todas as consultas. **Rejeitada:** exigiria alterar as 15+ queries
  existentes; **um único** esquecimento passaria a contar uma negada como presença/refeição —
  e corromperia a estatística **em silêncio**, sem erro visível. Fraga de disciplina de filtro,
  para sempre, em toda query nova.
- **(B) Tabela `access_attempts` separada.** **Escolhida.**

## Consequências
- As restrições do cliente ("uma tentativa negada **nunca** vira acesso, refeição ou
  localização") tornam-se **propriedade estrutural** do schema, não disciplina de quem escreve
  a query. Nenhuma consulta legada de `access_logs` muda de resultado.
- `access_logs` permanece **sem** as colunas `auth_result`/`granted`/`authorization_result`/
  `denial_reason` — estar nessa tabela já significa acesso bem-sucedido (decisão do Sam).
- Custo aceito: uma **linha do tempo unificada** (efetivos + negadas juntos) exige UNION ou um
  endpoint composto — não sai de graça de uma tabela só.
- O caso `OBSERVATION` grava **nos dois lugares** (log real + attempt de auditoria) de forma
  intencional, para medir sem impacto operacional durante o piloto.

## Evidência
- Contaminação real observada: subtipo 8 (negação do terminal) gravado como `access_log`
  válido antes desta separação — ver `.claude/rules/hikvision.md` (tabela de subtipos,
  confirmada com hardware em 2026-07-13) e o teste `WebhookDeniedIT`.
- Invariante coberta por testes: `LegacyRegressionIT` (nenhuma query de `access_logs` muda) +
  `WebhookFaceIT`/`WebhookCardIT` (caminho 75/1 intacto) + `WebhookDeniedIT` (sub 8 → 1
  `access_attempt` `DEVICE_DENIED`, 0 logs).

## Status
**Aceita** — 2026-07-14, por Sam. Implementada nas Fases B–E.
