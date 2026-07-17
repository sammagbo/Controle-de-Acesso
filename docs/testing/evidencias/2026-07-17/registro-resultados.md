# Registro de Resultados — Bateria V01–V14 (validação estrutural, Fases A–K)

**Data:** 2026-07-17 · **Executor:** Sam (bancada) + Claude Code (verificação/orquestração)
**Plano normativo:** `docs/testing/plano-validacao-estrutural.md` · **Modo:** interativo (gesto físico → confirmação → verificação)
**Código:** V01–V04(dados) em `e3499e2` · V04(UI) e V05+ em `f2169c1` (fix autorizado no meio da bateria, ver V04)
**Duração:** ~11:05–12:03 BRT (GATE A → backup pós) · **Terminal:** DS-K1T344MX `172.20.40.10` · **PC:** `172.20.40.9`

## Veredito geral: **V01–V14 TODOS PASSARAM** (V04 com correção autorizada; V06 com errata de plano)

---

## GATE A (PREP-01..10) — 100% antes de qualquer V

| PREP | Resultado |
|---|---|
| 01 | git limpo @ `e3499e2` · `mvn clean test` → **BUILD SUCCESS, 183 run / 0 falhas / 2 skipped** (os 2 `@Disabled` PostgreSQL-only → V13) — `prep-01-mvn-clean-test.txt` |
| 02 | `magbo-postgres` Up 22h; `magbo-db`/`meetingmanager_db` Exited |
| 03 | Backup pré: `backups/magbo-pre-bateria-20260717-1059.dump` (3.58 MB) |
| 04 | Backend prod: `Started MagboAccessApplication in 5.432s` + exatamente 2 WARN `SECURITY [prod]` — `prep-04-05-backend-health.txt` · Nota: java órfão na 8080 (TaskStop matou só o wrapper mvn) morto antes |
| 05 | `/api/health` → `"database":"CONNECTED"` |
| 06 | PC `172.20.40.9` (ipconfig) · terminal `172.20.40.10` (display, Sam) · Écoute HTTP conferida por Sam: `172.20.40.9:8080`, `?token=` presente, HTTP |
| 07 | Ping terminal: 4/4, **0% perda**, <2ms |
| 08 | Mapping bench id 15 = `.10`/REFEI1/ENTRADA ativo · órfão id 14 (`.17`): DELETE da API é **soft** → ficou `ativo=false` (fora do `findIpOnlyMatch`) |
| 09 | Políticas vigentes registradas (`prep-09-politicas-vigentes.txt`). **Nota confirmada por Sam:** a coluna Esperado do plano assume `meal-pending=OBSERVATION`; vigente é **`DENY`** (B.1, `e450cd3`). Nenhum V testa PENDING diretamente; impacto indireto no V03 tratado com entitlement temporário (decisão Sam) |
| 10 | `9999999` ativo + AUTHORIZED/2030-12-31 · `8888888` inexistente no MAGBO · `0001764` ativo (PENDING — sem linha) |

Baseline pré-V01: `access_logs` max id **440002** · `access_attempts` = 1 (id 1, histórica do smoke 16/07).

---

## Resultados V01–V14

| # | Status | Evidência (banco/UI) |
|---|:--:|---|
| **V01** | ✅ PASSOU | log **440003** `9999999` REFEI1/ENTRADA/FACE/sub 75 @ 11:19:59 · 0 attempts · não-fallback provado por `point_id=REFEI1` (nota: `access_logs` não tem coluna `fallback`; fallback legado gravaria PORT1) · `flag=null` esperado (turma então sem schedule) |
| **V02** | ✅ PASSOU | log **440004** mesmo `user_id` via **CARD/sub 1** @ 11:23:04 (ADR-002) · 0 attempts |
| **V03** | ✅ PASSOU | log **440005** `user_id='0001764'` **length 7 — zeros preservados** · CARD/sub 1 · Prep autorizada: entitlement AUTHORIZED temporário via API (upsert PUT 200 + evento de histórico `null→AUTHORIZED/admin/UI` na mesma transação — bônus Fase C) |
| **V04** | ✅ PASSOU¹ | Dados: attempt **6** `SUCCESS`+`DENIED`/`MEAL_NOT_ENTITLED` FACE/75 @ 11:26:52 · **0 logs** · UI: inicialmente ❌ — badges método/motivo **vazios** (`v04-ui-antes-badges-vazios.png`); bug pré-existente da Fase H, **3º da família do feed** (wire `f947373`, props `a846678`, agora nomes de campo DTO); corrigido em **`f2169c1`** durante a bateria por decisão do Sam (escopo travado em 2 linhas; inventário confirmou serem os únicos campos errados); UI re-verificada ✅ sem novo gesto: badges **Visage** + **Pas de droit au repas** (`v04-ui-depois-badges-ok.png`) |
| **V05 ★** | ✅ PASSOU | Terminal **negou por voz** antes do HTTP (Sam) · attempt **7** sub **8**/`DEVICE_DENIED` (`DENIED`+`DENIED`) @ 11:35:17 · **0 logs** — a refeição falsa do sub 8 está morta (2ª prova em hardware; CANT-09→smoke→bateria) · **validade restaurada no terminal na sequência (pendência do smoke quitada)** |
| **V06** | ✅ PASSOU² | 2 faces em 3.7s → logs **440006+440007** + attempt **8** `DUPLICATE_MEAL`/`OBSERVATION` @ 11:38:49 · ²**Errata de plano (decisão Sam):** o Esperado "1 log" contradizia a definição normativa de OBSERVATION (ADR-001 + application-prod.properties: "grava log real E attempt de auditoria"). Esperado corrigido: **2 logs + 1 attempt** — comportamento conforme docs e Fase I. Tabela do plano corrigida no commit desta bateria |
| **V07** | ✅ PASSOU | schedule `'N'` (sexta) inserido p/ TESTE_MESA → log **440008 `flag=FORA_HORARIO`** + attempt **9** `OUTSIDE_MEAL_TIME`/`OBSERVATION` @ 11:45:09 |
| **V08** | ✅ PASSOU | `8888888` cadastrado só no terminal (cartão) → attempt **10**: `user_id=NULL`, `employee_no_raw='8888888'`, `nome_snapshot` do payload, CARD/sub 1, `UNKNOWN_USER` · 0 logs |
| **V09** | ✅ PASSOU | `ativo=false` via API (DELETE /api/users = soft) → attempt **11** `USER_INACTIVE` (`SUCCESS`+`DENIED`) · **0 logs** · ⚠️ Observação: **não há rota de reativação na API** (DTO sem campo `ativo`) — restaurado via SQL UPDATE (lacuna anotada) |
| **V10** | ✅ PASSOU | mapping 15→PORT1/SAIDA · attempt **12** `EXIT_NOT_AUTHORIZED` (`SUCCESS`+`DENIED`) · 0 logs · presença **inalterada** (activeUsers 2, totalToday 6, authorizedToday 5 = baseline) |
| **V11** | ✅ PASSOU | permissão SINGLE id 1 criada via API (ACTIVE, motivo, createdBy) → 1ª saída: log **440009** PORT1/SAIDA + permissão **USED** `used_at=11:53:58` · 2ª tentativa: attempt **13** `EXIT_NOT_AUTHORIZED` · 0 logs novos · permissão segue USED (não reusa) |
| **V12** | ✅ PASSOU | `blockedToday`==`alertasHoje` (1=1) · `negadasHoje`=**8** (cross-check SQL: 8 attempts hoje, ids 6–13 — exato) · `divergenciaHoje`=**5** (cross-check SQL: 5 SUCCESS+DENIED, ids 6/10/11/12/13 — exato) · coerência: activeUsers 2→1 após a saída real do V11 |
| **V13** | ✅ PASSOU | **`currentOccupancyByPoint`** (DISTINCT ON): psql REFEI1=**2** == UI "Dans les secteurs: **2**" · **`countUnregisteredExits`** (interval '4 hours'): psql **6** == UI "Mouvements incomplets: **6**" · SQL exato em `sql/v13-queries-nativas.sql` · dashboards sem regressão (screenshots: `v13-rapport-general-hoje.png` + telas do V04) |
| **V14** | ✅ PASSOU | negadas **não** contam: `refectory/meals` hoje = **2** (1/aluno); nenhuma attempt virou refeição; ocupação inalterada (V10) · **Adendo D10(i):** log 440007 tem `flag=NULL` (duplicata não marcada no log; marca vive no attempt 8) · **Adendo D10(ii):** apesar de 5 ENTRADAs do `9999999` hoje, meals conta **1 refeição** — **o pareamento por dia absorve duplicatas; OBSERVATION não infla o KPI de refeições** |

---

## Decisões e pendências registradas

- **D10 (ABERTA, pós-bateria):** `duplicate-meal` em produção: OBSERVATION (atual) vs DENY. **Evidência do V14: OBSERVATION não infla a contagem de refeições** (pareamento por dia absorve); a diferença afeta só os access_logs crus. Decidir com calma.
- **Lacuna de API:** não existe rota de reativação de usuário (`ativo=true`) — só desativação. Anotar para eventual F futura.
- **Erratas de documentação embutidas no commit desta bateria:** linha V06 da tabela do plano corrigida (contradizia ADR-001).
- **Checklist do dia da VM (adicionado ao procedimento-hikcentral):** decidir se os fixtures de teste permanecem nos terminais de produção — credencial do `8888888` **abre o relé fisicamente** mesmo sendo UNKNOWN_USER no MAGBO (credencial órfã). Decisão da direção/Sam.

## Fixtures de teste permanentes (inventário — decisão Sam 17/07)

| ID | Existe em | Credencial | Propósito |
|---|---|---|---|
| `9999999` TESTE PILOTO MESA | terminal + MAGBO (turma TESTE_MESA) | FACE + CARTÃO | caminho feliz e negações lógicas (entitlement/inativo/saída); usuário de bench principal |
| `0001764` LUIS TESTE CARTAO | terminal + MAGBO (turma TESTE_MESA) | CARTÃO (real) | zeros à esquerda; estado padrão PENDING (sem linha de entitlement) |
| `8888888` TESTE INEXISTENTE | **só terminal** | CARTÃO | UNKNOWN_USER (par invertido do 9999999) — re-teste rápido no futuro ⚠️ ver checklist da VM |

## Limpeza executada (estado final = pré-bateria, exceto o combinado)

- Entitlement `9999999`: AUTHORIZED/2030-12-31 (= pré-bateria) ✓ · `ativo=true` ✓ · validade no terminal restaurada ✓
- Entitlement `0001764`: linha removida (volta a PENDING; **4 eventos de histórico preservados** — auditoria não se apaga; remoção sem evento = exceção de bench anotada, API não tem DELETE)
- Permissão SINGLE de teste: removida · `class_schedules` TESTE_MESA: removida · mapping 15: **REFEI1/ENTRADA ativo** restaurado · mapping 14 órfão: inativo (soft delete)
- **Registros de movimento MANTIDOS** (decisão Sam, precedente do smoke): logs 440003–440009 + attempts 6–13 — o banco reflete a bateria que este registro documenta
- Backups: pré `magbo-pre-bateria-20260717-1059.dump` · pós `magbo-pos-bateria-20260717-1203.dump`

## Ferramentas
Verificações de UI via skill `run-magbo-app` (driver E2E commitado em `e3499e2`): Electron real, modo kiosk (internet bloqueada via webRequest, LAN ok), login real, screenshots conferidos a olho. 0 requests externos e 0 erros de console em todas as rodadas.
