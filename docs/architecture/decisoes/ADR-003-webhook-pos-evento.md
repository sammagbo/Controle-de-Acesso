# ADR-003 — O MAGBO é observacional: o webhook é pós-evento, não bloqueia a porta

## Contexto
Uma leitura natural do sistema é imaginar que o MAGBO "libera" ou "nega" a porta em tempo real
respondendo ao webhook. Era preciso confirmar, com hardware, **quando** o terminal decide e se
a resposta HTTP do MAGBO tem qualquer efeito físico.

## Decisão
O webhook é **pós-evento**. `DENY` no MAGBO significa **classificação lógica + auditoria**,
**nunca** ação física. O MAGBO **não fecha porta**. Bloqueio físico real existe **somente** no
lado do dispositivo — via HikCentral distribuindo access levels/schedules (procedimento
operacional), não via código do backend. ❌ Não implementar "liberação em tempo real".

## Alternativas consideradas
- **(A) Bloqueio em tempo real pela resposta do webhook.** **Rejeitada** — tecnicamente
  impossível: quando o HTTP chega, a porta **já operou** (ver Evidência); o aparelho ignora a
  resposta do MAGBO.
- **(B) MAGBO observacional + bloqueio físico delegado ao HikCentral.** **Escolhida.**

## Consequências
- Enquanto o bloqueio via HikCentral não estiver configurado, um aluno **sem** direito à
  refeição / **sem** autorização de saída **entra/sai fisicamente**, e o MAGBO registra a
  tentativa (`MEAL_NOT_ENTITLED`, `EXIT_NOT_AUTHORIZED`…). **A direção da escola precisa saber
  disso.**
- Essa divergência é **dado de primeira classe**, medida pelo KPI **`divergenciaHoje`**
  (`auth_result=SUCCESS` **E** `authorization_result=DENIED` — "a porta abriu, mas o MAGBO não
  contou como acesso válido"). É o indicador que mede a eficácia do futuro bloqueio via
  HikCentral.
- **Efeito colateral positivo:** se a VM ou a rede cair, o almoço/portão **continuam
  funcionando** — o terminal autentica localmente com as credenciais já distribuídas. A
  observacionalidade é uma **propriedade desejada**, não uma lacuna.
- HTTP 200 é devolvido **sempre** nos caminhos normais, justamente porque a resposta não muda
  nada no aparelho e um erro só provocaria tempestade de retry.

## Evidência
- **2026-07-13, teste CANT-09:** validade da pessoa colocada no passado no terminal → o
  aparelho **negou por voz ANTES de qualquer HTTP**; o evento `subEventType=8` chegou **depois**.
- **Sequência observada:** `21` (porta abre) → `75`/`1` (autenticação) → `22` (porta fecha) — a
  porta **já operou** quando o webhook chega.
- A resposta HTTP do MAGBO é **ignorada** pelo aparelho.
- O terminal **enfileira e reenvia** eventos quando o destino cai (observado 2×) — mais uma
  prova de que a decisão é local e o MAGBO só recebe a notificação.

Referência: `§4.7` da especificação técnica. Coberto conceitualmente por `WebhookDeniedIT`
(sub 8 chega e é auditado como tentativa, sem virar acesso).

## Status
**Aceita** — 2026-07-15.
