# PROMPT — FASE I: Testes Automatizados ★ FASE OBRIGATÓRIA E BLOQUEANTE

## ⚠️ POR QUE ESTA FASE EXISTE

O projeto MAGBO tem **zero testes automatizados** hoje. Até 14/07/2026, cada mudança era validada manualmente com hardware real, uma de cada vez. A partir da Fase A, essa validação incremental foi substituída por um ciclo grande de implementação.

**Esta fase é a rede de proteção que substitui aquela validação.** Sem ela, não há como saber se a refatoração da Fase B preservou o comportamento validado com hardware ao longo de 4 dias de testes.

**Ela não é opcional. Não é "se der tempo". É bloqueante para a entrega.**

Se você chegou aqui e as fases anteriores estão implementadas mas os testes não, a entrega **não está pronta**.

---

## CONTEXTO DO PROJETO
**MAGBO Access Control** — Lycée Molière (Rio). Spring Boot 3.2.5 / Java 17 / Maven. `backend/` = Spring Boot (`com.magbo.access`). Perfis: `dev` (H2) e `prod` (PostgreSQL).
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia a seção 13 inteira**.

### FATOS DE HARDWARE QUE OS TESTES DEVEM CONGELAR
| subEventType | Significado | Comportamento esperado |
|---|---|---|
| **75** | Face aprovada | → `access_log`, `auth_method=FACE` |
| **1** | Cartão aprovado | → `access_log`, `auth_method=CARD` |
| **8** | **NEGADO** pelo terminal (traz identidade!) | → `access_attempt` `DEVICE_DENIED`, **0 access_logs** |
| 9, 21, 22, boot | Dispositivo/porta | → ignorado, 200 OK, **0 attempts** |

- Face e cartão trazem o **mesmo** `employeeNoString`. `cardNo` não existe no payload.
- IDs String com zeros à esquerda (`0001764`) — **nunca** truncar.
- Payload: `multipart/form-data` (terminais MinMoe) ou JSON puro (câmeras DeepinView).
- `dateTime` do payload vem em **GMT+8** → o backend **ignora** e usa a hora do servidor.
- Regras validadas com hardware: janela da cantina (Lycée 11h–15h fixo; outras turmas via `class_schedules`; `'N'` = dia sem refeição → `FORA_HORARIO`), `EXCEDEU_TEMPO` (>1h desde a última ENTRADA).

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`.
- ❌ ★ **NUNCA** apontar teste para o PostgreSQL de desenvolvimento. Testes usam **H2 em memória**.
- ❌ **NUNCA** carregar `data.sql` nos testes (é seed de QA com sintaxe H2 — poluiria as asserções).
- ❌ **NUNCA** "ajustar o teste para passar" quando ele revela um bug. Teste vermelho = **reportar**, não maquiar.
- ❌ **NUNCA** alterar código de produção nesta fase, **exceto** se um teste revelar um bug real — e nesse caso **reporte antes de corrigir**.
- ✅ Contradição com o código → **PARE e reporte**.

---

## OBJETIVO DA FASE I
1. Infraestrutura de testes (perfil `test`, H2, payloads reais).
2. Testes unitários das regras de decisão.
3. Testes de integração do webhook ponta a ponta.
4. ★ **Testes de blindagem (regressão)** que congelam o comportamento validado com hardware.

## DEPENDÊNCIAS
**Fases A–H concluídas.**

---

## ARQUIVOS
### Novos — infraestrutura
```
backend/src/test/resources/application-test.properties
backend/src/test/resources/payloads/face-75.txt
backend/src/test/resources/payloads/card-1.txt
backend/src/test/resources/payloads/denied-8.txt
backend/src/test/resources/payloads/door-21.txt
backend/src/test/resources/payloads/heartbeat.txt
backend/src/test/resources/payloads/camera-json.json
backend/src/test/java/com/magbo/access/TestFixtures.java          (helpers: cria User, DoorMapping, entitlement etc.)
```
### Novos — unitários (7)
```
backend/src/test/java/com/magbo/access/services/HikvisionEventClassifierTest.java
backend/src/test/java/com/magbo/access/services/MealEntitlementServiceTest.java
backend/src/test/java/com/magbo/access/services/ExitPermissionServiceTest.java
backend/src/test/java/com/magbo/access/services/DeduplicationServiceTest.java
backend/src/test/java/com/magbo/access/services/AccessDecisionServiceTest.java
backend/src/test/java/com/magbo/access/services/EntryWindowRegressionTest.java   ★ blindagem
backend/src/test/java/com/magbo/access/services/ExitTimeRegressionTest.java      ★ blindagem
```
### Novos — integração (16)
```
backend/src/test/java/com/magbo/access/integration/WebhookFaceIT.java
backend/src/test/java/com/magbo/access/integration/WebhookCardIT.java
backend/src/test/java/com/magbo/access/integration/WebhookDeniedIT.java          ★ o mais importante
backend/src/test/java/com/magbo/access/integration/WebhookUnknownUserIT.java
backend/src/test/java/com/magbo/access/integration/WebhookInactiveUserIT.java
backend/src/test/java/com/magbo/access/integration/WebhookHeartbeatIT.java
backend/src/test/java/com/magbo/access/integration/WebhookJsonCameraIT.java
backend/src/test/java/com/magbo/access/integration/WebhookTokenIT.java
backend/src/test/java/com/magbo/access/integration/WebhookMultipartPictureIT.java
backend/src/test/java/com/magbo/access/integration/MealEntitlementFlowIT.java
backend/src/test/java/com/magbo/access/integration/ExitPermissionFlowIT.java
backend/src/test/java/com/magbo/access/integration/ExitSinglePermissionIT.java
backend/src/test/java/com/magbo/access/integration/ZeroPaddingIT.java            ★
backend/src/test/java/com/magbo/access/integration/StatsCompatIT.java
backend/src/test/java/com/magbo/access/integration/PermissionsIT.java
backend/src/test/java/com/magbo/access/integration/BulkEntitlementIT.java
backend/src/test/java/com/magbo/access/integration/LegacyRegressionIT.java       ★ blindagem
```
### Possivelmente alterado (1)
```
backend/pom.xml   ← APENAS se spring-boot-starter-test e H2 não estiverem presentes
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — Infraestrutura
**1.1** Conferir o `pom.xml`: `spring-boot-starter-test` (scope test) e `com.h2database:h2` (scope test/runtime). **Se faltarem, adicionar — e só isso.** Não adicionar nenhuma outra dependência.

**1.2** `src/test/resources/application-test.properties`:
```properties
spring.datasource.url=jdbc:h2:mem:magbotest;DB_CLOSE_DELAY=-1;MODE=PostgreSQL
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=
spring.jpa.hibernate.ddl-auto=create-drop
spring.sql.init.mode=never
magbo.webhook.token=test-token-fixo-para-integracao
magbo.jwt.secret=<base64 de teste, >=48 bytes>
# políticas explícitas — os testes não devem depender de defaults
magbo.policy.meal-not-entitled=DENY
magbo.policy.meal-pending=OBSERVATION
magbo.policy.outside-meal-time=OBSERVATION
magbo.policy.duplicate-meal=OBSERVATION
magbo.policy.exit-not-authorized=DENY
magbo.policy.user-inactive=DENY
magbo.policy.missing-door-mapping=FALLBACK
magbo.dedup.enabled=true
magbo.dedup.window-seconds=90
```
⚠️ `spring.sql.init.mode=never` é **obrigatório** — o `data.sql` do projeto é seed de QA com sintaxe H2 (`MERGE ... KEY`) e poluiria as asserções.
⚠️ Testes que precisam de política diferente usam `@TestPropertySource(properties = {"magbo.policy.X=OBSERVATION"})`.

**1.3** Payloads em `src/test/resources/payloads/` — **usar o formato real capturado do hardware**:
```
multipart/form-data; boundary=MIME_boundary
part "AccessControllerEvent" (application/json):
{"ipAddress":"172.20.40.12","portNo":80,"protocol":"HTTP","macAddress":"a4:d5:c2:2f:ea:d2",
 "channelID":1,"dateTime":"2026-07-14T11:33:19+08:00","activePostCount":1,
 "eventType":"AccessControllerEvent","eventState":"active",
 "eventDescription":"Access Controller Event",
 "AccessControllerEvent":{"deviceName":"Access Controller","majorEventType":5,
   "subEventType":75,"cardReaderKind":1,"cardReaderNo":1,"verifyNo":0,
   "employeeNoString":"9999999","name":"Teste Piloto","userType":"normal",
   "currentVerifyMode":"cardOrFaceOrFp","attendanceStatus":"undefined",
   "label":"","statusValue":0,"mask":"no","purePwdVerifyEnable":true,"serialNo":123}}
part "Picture" (image/jpeg): <alguns bytes fake>
```
Variações: `subEventType` **75 / 1 / 8 / 21**; `employeeNoString` **9999999 / 0001764 / 8888888**; e um JSON puro `{"EventNotificationAlert":{"ipAddress":"192.168.1.167","AccessControllerEvent":{...}}}` para o ramo câmera.
⚠️ Note o `dateTime` em **+08:00** — os testes devem provar que o backend **ignora** isso.

**1.4** `TestFixtures.java`: helpers estáticos para criar `User` (ativo/inativo, com turma), `DoorMapping` (IP-only → REFEI1/ENTRADA e PORT1/SAIDA), `ClassSchedule`, `MealEntitlement`, `StudentExitPermission`, e montar requisições multipart.

### Passo 2 — Unitários (`@ExtendWith(MockitoExtension.class)`, sem contexto Spring)
Implementar **exatamente** os casos da tabela 13.2 da spec. Destaques obrigatórios:

**`HikvisionEventClassifierTest`:** 75→(FACE,SUCCESS,true) · 1→(CARD,SUCCESS,true) · 8→(UNKNOWN,DENIED,false) · 21→(UNKNOWN,UNKNOWN,false) · null→(UNKNOWN,UNKNOWN,false) · 999→(UNKNOWN,UNKNOWN,false).

**`MealEntitlementServiceTest`:** sem linha→PENDING · AUTHORIZED vigente→entitled · `validUntil` no passado→MEAL_NOT_ENTITLED · `validFrom` no futuro→MEAL_NOT_ENTITLED · NOT_AUTHORIZED→MEAL_NOT_ENTITLED · upsert grava histórico · ★ **`daysOfWeek`/`mealType` preenchidos são IGNORADOS** (prova que os campos reservados não afetam a regra).

**`ExitPermissionServiceTest`:** PERMANENT ACTIVE→válida · REVOKED→inválida · DATE_RANGE dentro/fora · RECURRING dia certo/errado · janela horária dentro/fora/**limites exatos** · SINGLE não usada→válida, USED→inválida · sem permissão→**EXIT_NOT_AUTHORIZED** · com permissão fora de validade→**OUTSIDE_EXIT_WINDOW** (★ a distinção é exigência do cliente).

**`DeduplicationServiceTest`:** dentro da janela→duplicata · fora→não · `enabled=false`→nunca · `window=0`→nunca · ponto diferente→não · ação diferente→não.

**`AccessDecisionServiceTest`** (mock dos colaboradores): ★ **ordem das regras** — aluno NOT_AUTHORIZED **e** fora de horário → motivo `MEAL_NOT_ENTITLED` (entitlement vence horário) · política OBSERVATION vs DENY com a mesma entrada → decisões diferentes · SAIDA na cantina **não** avalia entitlement · BIBLIO/ENFERM sem regra.

**★ `EntryWindowRegressionTest` — BLINDAGEM:** congela a lógica movida na Fase B. Turma Lycée (`T1`,`2E1`…) dentro de 11h–15h→null · antes das 11h→FORA_HORARIO · depois das 15h→FORA_HORARIO · turma com `class_schedule` `'N'` no dia→FORA_HORARIO · turma **sem** schedule→null (não alerta) · `parseHour("11H00")`→11:00 · `parseHour("12H30")`→12:30 · hora inválida→null (não lança) · janela = hora+1h, testando os **limites exatos** (exatamente na hora, exatamente no fim).

**★ `ExitTimeRegressionTest` — BLINDAGEM:** sem entrada anterior→null · 30min→null · 2h→EXCEDEU_TEMPO · **exatamente 1h**→null (limite, `compareTo > 0`).

### Passo 3 — Integração (`@SpringBootTest` + `@AutoConfigureMockMvc` + `@ActiveProfiles("test")`)
Implementar a tabela 13.3 da spec. Padrão: `@Transactional` ou limpeza entre testes; sempre asseverar **os dois lados** (o que foi criado **e** o que **não** foi criado).

Destaques obrigatórios:

**★ `WebhookDeniedIT`** — o teste mais importante do projeto:
```
POST multipart com subEventType=8, employeeNoString de usuário existente
→ status 200
→ accessLogRepository.count() == 0        ★ NENHUM access_log
→ accessAttemptRepository.count() == 1
→ attempt.denialReason == DEVICE_DENIED
→ attempt.authResult == DENIED
→ attempt.authorizationResult == DENIED
→ attempt.hikvisionSubEventType == 8
```
Javadoc obrigatório: *"Congela a correção do bug descoberto em 13/07/2026 (teste CANT-09): o terminal nega o acesso mas envia subEventType=8 COM employeeNoString, e o sistema gravava isso como refeição válida. Se este teste falhar, a refeição falsa voltou."*

**★ `ZeroPaddingIT`:** payload com `employeeNoString="0001764"` → `access_log.userId` == `"0001764"` (**não** `"1764"`); e o mesmo para `access_attempt.employeeNoRaw` num evento negado.

**★ `LegacyRegressionIT`:** inserir `access_logs` "históricos" (com `auth_method=null`, `hikvision_sub_event_type=null`) e executar **todas** as queries de `AccessLogRepository` (`countMovements`, `countByHour`, `statsByPoint`, `countUniqueStudents`, `currentOccupancyByPoint`, `avgStayMinutesByPoints`, `countLongInfirmaryStays`, `countUnregisteredExits`, `countPresentToday`, `countOffScheduleMeals`, `countActiveUsersSince`, `countBlockedSince`, `findFilteredLogs`…) → nenhuma exceção, resultados coerentes. Prova que registros antigos continuam válidos.
⚠️ Algumas queries são **nativas PostgreSQL** (`DISTINCT ON`, `FILTER`, `EXTRACT`, `LAG ... WINDOW`). Em H2 com `MODE=PostgreSQL` várias funcionam, mas **`DISTINCT ON` e `FILTER` podem não**. **Se alguma query nativa não rodar em H2: NÃO altere a query de produção.** Marque o teste com `@Disabled("nativeQuery PostgreSQL-only — validar em banco real")` e **reporte a lista** ao Sam, que valida essas manualmente.

**`WebhookHeartbeatIT`:** heartbeat, 21 e 22 → 200 · 0 logs · **0 attempts** (não poluir a tabela de tentativas com ruído de dispositivo).

**`WebhookTokenIT`:** sem token→401 · errado→401 · header correto→200 · `?token=` correto→200.

**`MealEntitlementFlowIT`:** NOT_AUTHORIZED + face → 0 logs, 1 attempt `MEAL_NOT_ENTITLED`, e **`/api/access/refectory/meals` não retorna refeição** para o aluno.

**`ExitPermissionFlowIT`:** sem permissão + face em PORT1/SAIDA → 0 logs, 1 attempt `EXIT_NOT_AUTHORIZED`, e ★ **`countPresentToday` inalterado** (asseverar antes/depois).

**`StatsCompatIT`:** `/api/stats/global` → `blockedToday` presente **e igual** a `alertasHoje`; `negadasHoje` correto; `divergenciaHoje` conta o caso SUCCESS+DENIED.

**`BulkEntitlementIT`:** lote com válida + inexistente + status inválido + duplicada → contadores corretos, erros por linha, ★ **a linha válida persiste** (prova da transação por linha), e sem `overwrite` não sobrescreve.

### Passo 4 — Rodar e reportar
```bash
cd backend && mvn clean test
```
- **Verde** → reportar o resumo (total, por classe).
- **Vermelho** → ★ **NÃO ajuste o teste para passar.** Analise: é bug do teste ou do código de produção? **Reporte ao Sam** com o diagnóstico. Se for bug de produção, é um **achado valioso** — foi exatamente para isso que esta fase existe.

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. Testes em H2, perfil `test`, **nunca** no PostgreSQL de dev.
2. `spring.sql.init.mode=never`.
3. Teste vermelho por bug real → **reportar**, nunca maquiar.
4. Não alterar código de produção sem reportar antes.
5. Não adicionar dependências além de `spring-boot-starter-test` e `h2` (se faltarem).
6. Payloads = formato **real** do hardware, incluindo `dateTime` em GMT+8.
7. Asseverar sempre os **dois lados** (criado **e** não-criado).
8. Query nativa PostgreSQL que não roda em H2 → `@Disabled` + reportar; **jamais** alterar a query de produção para "passar no teste".

## CRITÉRIOS DE ACEITE
- [ ] `mvn clean test` **verde** (exceto `@Disabled` justificados e reportados).
- [ ] 7 classes de teste unitário implementadas com todos os casos da tabela 13.2.
- [ ] 16 classes de integração implementadas com os casos da tabela 13.3.
- [ ] ★ `WebhookDeniedIT` passa: subtipo 8 → 0 logs, 1 attempt.
- [ ] ★ `ZeroPaddingIT` passa: `0001764` preservado.
- [ ] ★ `EntryWindowRegressionTest` e `ExitTimeRegressionTest` passam (comportamento validado com hardware congelado).
- [ ] ★ `LegacyRegressionIT` passa (ou lista `@Disabled` reportada).
- [ ] `ExitPermissionFlowIT` prova que presença não muda em tentativa negada.
- [ ] `StatsCompatIT` prova a compatibilidade de `blockedToday`.
- [ ] `BulkEntitlementIT` prova a transação por linha.
- [ ] Nenhum teste depende de `data.sql`, do PostgreSQL de dev, ou de hardware.
- [ ] Tempo total da suíte < 2 minutos (senão, reportar).

## CHECKLIST DE CONCLUSÃO
- [ ] `application-test.properties` com H2 + políticas explícitas + `sql.init.mode=never`
- [ ] 6 payloads reais (75, 1, 8, 21, heartbeat, camera-json)
- [ ] `TestFixtures` com helpers
- [ ] 7 testes unitários · 16 de integração
- [ ] `mvn clean test` verde
- [ ] **Reportar:** total de testes, tempo, `@Disabled` (com motivo), e **qualquer bug de produção encontrado**
- [ ] **Nenhum commit**

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| Query nativa PostgreSQL não rodar em H2 | **Alta** | `MODE=PostgreSQL`; se ainda falhar → `@Disabled` + reportar. **NUNCA** alterar a query de produção |
| Teste apontar para o Postgres de dev e poluir/apagar dados reais | **CRÍTICA** | `application-test.properties` com H2; conferir que `@ActiveProfiles("test")` está em **todos** os ITs |
| `data.sql` poluir asserções | Média | `spring.sql.init.mode=never` |
| Multipart no MockMvc não reproduzir o formato do terminal | Média | Usar `MockMvcRequestBuilders.multipart(...)` com as duas parts; validar contra o payload real |
| Teste de tempo (`LocalDateTime.now()`) instável | Média | Injetar/mockar o tempo onde possível; usar margens generosas; evitar asserções de segundo exato |
| "Ajustar o teste para passar" e mascarar um bug real | **CRÍTICA** | Regra explícita: reportar, nunca maquiar |

## ROLLBACK
| Nível | Ação | Perda |
|---|---|---|
| Código | `git revert` → testes somem; produção intacta (testes não afetam runtime) | Nenhuma |
⚠️ Esta é a fase mais segura para rollback — mas também a que **você menos deveria querer reverter**.

## AO TERMINAR
1. `mvn clean test` e cole a saída resumida.
2. Checklist preenchido.
3. **Reporte explicitamente:** quantos testes, quais `@Disabled` e por quê, e **se algum teste revelou um bug no código de produção** (isso é sucesso da fase, não fracasso).
4. **NÃO commitar.**
