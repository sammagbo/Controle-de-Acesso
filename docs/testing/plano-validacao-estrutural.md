# Plano de Validação Estrutural — Fases A–K (bateria V01–V14)

**Base:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` §13.5 · **Ambiente:** PC-TRAB + terminal
DS-K1T344MX (bench) · **Executor:** Sam · **Status a preencher:**
PASSOU / FALHOU / BLOQUEADO / NÃO APLICÁVEL (consolidar em `registro-resultados.md`).

> ⚠️ **Pré-requisito absoluto:** esta bateria só faz sentido **depois de `mvn clean test` VERDE**
> (183 testes, 0 falhas na Fase I). Antes disso o sistema está em construção — testar no
> terminal não prova nada. Um `mvn test` verde valida a lógica em H2; esta bateria valida o
> **comportamento com hardware real e com o PostgreSQL de produção** (que os testes não cobrem
> inteiramente — ver V13).

## Bloco A — Preparação (todos P1) — herdado do plano de 2026-07-13
Rodar **antes** de qualquer teste; nada de teste sem GATE A 100%.
- **PREP-01 Git/build:** `git status` limpo; anotar hash do commit; `mvn clean test` → **verde**
  (183/0). Evid: trecho do BUILD SUCCESS + contagem.
- **PREP-02 Containers:** `docker ps -a` → parar `magbo-db`/`meetingmanager_db` se Up;
  `docker start magbo-postgres` → Up. Evid: print.
- **PREP-03 Backup pré-teste** (skill `backup-restauracao`) → arquivo em `backups/`. Evid:
  nome+tamanho.
- **PREP-04 Backend:** 4 env vars na MESMA sessão + `mvn spring-boot:run -Dspring-boot.run.profiles=prod`
  → `Started MagboAccessApplication` + 2 WARN `SECURITY [prod]` esperados. Evid: trecho log.
- **PREP-05 Health:** `/api/health` → `"database":"CONNECTED"`. Evid: JSON.
- **PREP-06 IPs:** `ipconfig` (PC) + IP no display do terminal; conferir/ajustar **Écoute HTTP**
  (IP:8080, URL com `?token=`, HTTP). Evid: prints.
- **PREP-07 Ping** do terminal 0% perda. Evid: print.
- **PREP-08 DoorMapping:** `GET /api/admin/door-mappings` → mapping de bench ativo com
  `terminal_ip` = IP atual (PUT se mudou). Evid: JSON.
- **PREP-09 Políticas:** conferir `application-prod.properties` — anotar `magbo.policy.*` e
  `magbo.dedup.*` vigentes (a coluna "Esperado" abaixo assume os **defaults do piloto**:
  meal-not-entitled=DENY, meal-pending/outside-meal-time/duplicate-meal=OBSERVATION,
  exit-not-authorized/user-inactive=DENY, missing-door-mapping=FALLBACK, dedup=90s on).
- **PREP-10 Usuário de teste** `9999999` ativo com entitlement conhecido; `8888888` inexistente.
- **GATE A:** tudo PASSOU → iniciar V01.

## Bateria V01–V14

| # | Teste | Esperado | Status | Evid. |
|---|---|---|:--:|:--:|
| **V01** | Face `9999999` com entitlement `AUTHORIZED`, dentro do horário | `access_log` REFEI1/ENTRADA/FACE/sub 75/`fallback=false` · **0** attempts | | |
| **V02** | Cartão `9999999` | `access_log` CARD/sub 1 (mesma pessoa; ver ADR-002) | | |
| **V03** | Cartão do Luis `0001764` | zeros à esquerda **preservados** em `employee`/log | | |
| **V04** | `9999999` → `NOT_AUTHORIZED` → face | **0 logs** · 1 attempt `MEAL_NOT_ENTITLED` · painel da cantina mostra aluno/turma/hora/método/ponto/motivo | | |
| **V05** ★ | Validade da pessoa no passado (no terminal) → face | terminal nega por voz · 1 attempt `DEVICE_DENIED` · **0 logs** (era a refeição falsa do sub 8) | | |
| **V06** | 2 faces em 10 s | 1 log + 1 attempt `DUPLICATE_MEAL` (política OBSERVATION) | | |
| **V07** | Turma com dia `'N'` (sem refeição) → face | log **com** `flag=FORA_HORARIO` + 1 attempt OBSERVATION `OUTSIDE_MEAL_TIME` | | |
| **V08** | Cartão/face de ID inexistente (`8888888`) | 1 attempt `UNKNOWN_USER` (`user_id`=null, `employee_no_raw` preenchido) · 0 logs | | |
| **V09** | `ativo=false` → face | 1 attempt `USER_INACTIVE` · **0 logs** (política user-inactive=DENY) | | |
| **V10** | Mapping bench → PORT1/SAIDA, aluno **sem** permissão de saída → face | 1 attempt `EXIT_NOT_AUTHORIZED` · presença (`countPresentToday`/ocupação) **inalterada** | | |
| **V11** | Criar permissão `SINGLE` → face na saída | log SAIDA · permissão vira `USED` (`used_at` preenchido) · 2ª tentativa → attempt (não reusa) | | |
| **V12** | `GET /api/stats/global` | `blockedToday`==`alertasHoje`; `negadasHoje`>0; `divergenciaHoje`>0 após V05 | | |
| **V13** | Dashboards e relatórios existentes + **queries nativas** | **sem regressão** visual/numérica **E** as 2 nativas PostgreSQL-only conferidas à mão (ver abaixo) | | |
| **V14** | Contagem de refeições após V04/V05/V06 | negadas **não** contam em `refectory/meals` nem na ocupação | | |

★ V05 é o coração da entrega: prova que o subtipo 8 deixou de virar refeição falsa.

## V13 — conferência manual OBRIGATÓRIA das queries nativas
`mvn test` roda em **H2** e **NÃO** cobre duas queries nativas PostgreSQL-only — que estão
`@Disabled` em `LegacyRegressionIT` justamente por usarem sintaxe que o H2 não entende. Elas são
o SQL **mais exótico** do sistema — onde uma regressão de Postgres é mais provável — e um
`mvn test` verde **não diz nada** sobre elas. Conferir manualmente contra o banco real:

1. **`currentOccupancyByPoint`** (usa `DISTINCT ON`) — ocupação atual por ponto.
   - Passo: abrir o Rapport Général / dashboard de ocupação **e** rodar a query equivalente no
     `psql`; os números têm de bater com a realidade (quem está dentro agora).
   - Referência do teste desabilitado: `LegacyRegressionIT` (`@Disabled` "DISTINCT ON").
2. **`countUnregisteredExits`** (usa literal `interval '4 hours'`) — entradas sem saída há +4h.
   - Passo: conferir o número exibido contra um `SELECT` manual no `psql`.
   - Referência: `LegacyRegressionIT` (`@Disabled` "interval '4 hours'").

> Registrar o SQL exato usado na conferência e o resultado em `evidencias/.../sql/`. Se qualquer
> uma divergir, é regressão de produção — **PARAR** e reportar antes do deploy na VM.

## Encerramento
Backup pós-teste · limpeza dos dados de teste (`9999999`/`8888888` e permissões/entitlements de
bench criados) · restaurar mapping de bench para o estado original · consolidar
`registro-resultados.md` · arquivar evidências em `docs/testing/evidencias/<data>/`.
