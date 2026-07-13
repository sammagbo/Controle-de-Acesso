# Fluxos ponta a ponta

## 1. Evento Hikvision (VALIDADO com hardware em 10/07)
Terminal autentica rosto localmente → POST multipart em `/api/hikvision/webhook?token=…` → `parsePayload` (F6b: extrai JSON da part `AccessControllerEvent`; JSON puro p/ câmeras) → token header OU query via `MessageDigest.isEqual` (401 se inválido; 503 se não configurado) → sem `employeeNoString`? ignora com 200 (heartbeat, porta 21/22) → `findByHikvisionEmployeeId`: sem match = F5b ignora (warn) → `DoorMappingService.resolve(doorNo, readerNo, remoteAddr)`: match exato → IP-only (`door_no IS NULL`) → fallback legado PORT1+ENTRADA (`fallback=true`) → flags: REFEI*+ENTRADA→`validateEntryWindow` (Lycée 11-15h fixo; demais via class_schedules; 'N'=FORA_HORARIO; janela = hora+LUNCH_WINDOW) · SAIDA→`validateExitTime` (>1h desde última ENTRADA = EXCEDEU_TEMPO) → `AccessLog` salvo (timestamp do SERVIDOR) → 200. Aparelho reenvia fila se destino cair.

## 2. Acesso manual (IMPLEMENTADO; regra de janela NÃO se aplica — I1)
Operador logado → UI SectorView/CDI → POST `/api/access {userId, pointId, action}` → `canOperateSector(pointId)` (403 se setor não permitido) → AccessLog com `created_by_user` = operador, **sem flag**.

## 3. Frontend → banco
Login (`/api/auth/login` → JWT) → `userCache` GET `/api/users` (dispara `user-cache-updated`) → dashboards: AdminDashboard KPIs `/api/stats/global` + polling 5s · CantineMonitor `/api/access/logs/refectory` polling 3s · SectorView busca remota `/api/users/search` (debounce 250ms) + registro manual · Relatórios: `/refectory/meals` (pareia 1ª ENTRADA + 1ª SAIDA por usuário/dia; `onTime = flag==null`), `/infirmary/visits` (longStay>30min), `/api/access/overview` (KPIs, tendência vs período anterior, por hora, por área com únicos + permanência média, ocupação atual) → GeneralReport renderiza; export jsPDF/xlsx.
