# Fluxos ponta a ponta

## 1. Evento Hikvision (VALIDADO com hardware em 10/07)
Terminal autentica rosto localmente → POST multipart em `/api/hikvision/webhook?token=…` → `parsePayload` (F6b: extrai JSON da part `AccessControllerEvent`; JSON puro p/ câmeras) → token header OU query via `MessageDigest.isEqual` (401 se inválido; 503 se não configurado) → sem `employeeNoString`? ignora com 200 (heartbeat, porta 21/22) → `findByHikvisionEmployeeId`: sem match = F5b ignora (warn) → `DoorMappingService.resolve(doorNo, readerNo, remoteAddr)`: match exato → IP-only (`door_no IS NULL`) → fallback legado PORT1+ENTRADA (`fallback=true`) → flags: REFEI*+ENTRADA→`validateEntryWindow` (Lycée 11-15h fixo; demais via class_schedules; 'N'=FORA_HORARIO; janela = hora+LUNCH_WINDOW) · SAIDA→`validateExitTime` (>1h desde última ENTRADA = EXCEDEU_TEMPO) → `AccessLog` salvo (timestamp do SERVIDOR) → 200. Aparelho reenvia fila se destino cair.

## 2. Acesso manual (IMPLEMENTADO; regra de janela NÃO se aplica — I1)
Operador logado → UI SectorView/CDI → POST `/api/access {userId, pointId, action}` → `canOperateSector(pointId)` (403 se setor não permitido) → AccessLog com `created_by_user` = operador, **sem flag**.

## 3. Frontend → banco
Login (`/api/auth/login` → JWT) → `userCache` GET `/api/users` (dispara `user-cache-updated`) → dashboards: AdminDashboard KPIs `/api/stats/global` + polling 5s · CantineMonitor `/api/access/logs/refectory` polling 3s · SectorView busca remota `/api/users/search` (debounce 250ms) + registro manual · Relatórios: `/refectory/meals` (pareia 1ª ENTRADA + 1ª SAIDA por usuário/dia; `onTime = flag==null`), `/infirmary/visits` (longStay>30min), `/api/access/overview` (KPIs, tendência vs período anterior, por hora, por área com únicos + permanência média, ocupação atual) → GeneralReport renderiza; export jsPDF/xlsx.

## 4. Webhook — classificação e decisão (Fases B–D; estende a seção 1)
Após parse+token+terminalIp (seção 1, INALTERADO): sem `employeeNoString`? → 200 e fim. Senão → `HikvisionEventClassifier.classify(subEventType)` → resolve `DoorMapping` → **decisão** (`AccessDecisionService`, `@Transactional`):
1. `result==DENIED` (sub 8) → `access_attempts` `DEVICE_DENIED` · 200. ★ estanca a refeição falsa.
2. não-candidato (subtipo desconhecido) → attempt `DEVICE_DENIED`/`NOT_APPLICABLE` · 200.
3. usuário ausente (`findByHikvisionEmployeeId`) → attempt `UNKNOWN_USER` (`user_id`=null, `employee_no_raw` bruto com zeros) · 200.
4. `ativo=false` → política `user-inactive` (DENY→attempt `USER_INACTIVE`).
5. dedup + regras por área (4.4/4.5) → decisão final: **AUTHORIZED** → `access_log` (auth_method, subtype, flag) · **OBSERVATION** → `access_log` + attempt(OBSERVATION) · **DENIED** → só attempt. **HTTP 200 SEMPRE.** `access_logs` **nunca** recebe evento negado.

## 5. Regra da CANTINA (REFEI*/CANTINA*, só ENTRADA) — ordem obrigatória
`dedup` (existe log do mesmo user/ponto/ENTRADA na janela? → `DUPLICATE_MEAL`) → `entitlement` (`meal_entitlements[user_id]`: ausente/PENDING→política meal-pending; NOT_AUTHORIZED→`MEAL_NOT_ENTITLED`; AUTHORIZED→checar vigência `valid_from`/`valid_until`; `days_of_week`/`meal_type` IGNORADOS) → `janela de horário` (`validateEntryWindow` → `FORA_HORARIO`→`OUTSIDE_MEAL_TIME`). A 1ª que decidir DENY encerra. **SAIDA na cantina:** lógica atual intacta (`validateExitTime`→`EXCEDEU_TEMPO`), sempre AUTHORIZED. Contagem de refeições continua derivada de `access_logs` (negadas não entram → contagem correta por construção).

## 6. Regra do PORTÃO (PORT*, só SAIDA)
`student_exit_permissions[user_id] WHERE status=ACTIVE` → existe válida agora? PERMANENT (sempre) · DATE_RANGE (data no intervalo) · RECURRING (dia da semana ∈ days_of_week, + janela de datas/hora se houver) · SINGLE (ainda não usada) → nenhuma ACTIVE = `EXIT_NOT_AUTHORIZED`; existe mas fora de data/dia/hora = `OUTSIDE_EXIT_WINDOW` (nunca agrupar os dois) → válida → `access_log` SAIDA; se a permissão usada é SINGLE → `status=USED`/`used_at` **na mesma transação**, só em saída efetiva. Tentativa negada **não** grava `access_logs` → presença/ocupação inalteradas. ENTRADA no portão: registra normal, sem regra nova.
