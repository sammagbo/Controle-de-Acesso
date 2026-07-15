# PROMPT — FASE H: Frontend (Telas de Gestão e Painéis)

## CONTEXTO DO PROJETO
**MAGBO Access Control** — Lycée Molière (Rio de Janeiro). Backend Spring Boot + frontend **Electron + React 18**.
**Documento normativo:** `docs/architecture/ESPECIFICACAO-TECNICA-v1.md` — **leia a seção 11**.

### ★ RESTRIÇÃO ESTRUTURAL CRÍTICA — LEIA COM ATENÇÃO
**Este frontend NÃO TEM BUNDLER.** Não há webpack, vite, rollup, nem build step.
- React 18 vem de **CDN** (UMD), Babel **standalone** transpila no navegador, Tailwind via **CDN**.
- Componentes são **arquivos `.js` planos** carregados por `<script src="...">` no `index.html`. **A ordem importa** — dependências antes dos consumidores.
- **NÃO** use `import`/`export` ES modules. **NÃO** crie `package.json` de frontend. **NÃO** instale nada com npm para a UI.
- Componentes são expostos globalmente (`window.X` ou variável global), como os existentes.
- **Leia 2 ou 3 componentes existentes antes de escrever qualquer linha** e copie o padrão exato: `js/components/CantineMonitor.js`, `js/components/UserManagement.js`, `js/components/AdminDashboard.js`.

### CONTEXTO FUNCIONAL
As Fases C–G criaram: direito à refeição, autorização de saída, tentativas negadas e KPIs. Agora a equipe da escola precisa **operar** isso:
- Equipe da cantina: consultar alunos, marcar quem tem direito à refeição, ver tentativas negadas.
- Portaria: cadastrar/revogar autorizações de saída, ver tentativas negadas.
- Direção: ver os KPIs.

### REGRAS INVIOLÁVEIS
- ❌ **NUNCA** `git commit`/`push`.
- ❌ **NUNCA** introduzir bundler, ES modules, npm para UI, ou framework novo.
- ❌ **NUNCA** criar lista local de usuários. **Fonte única = `js/utils/userCache.js`** (GET /api/users + eventos `user-cache-updated` / `user-cache-error`).
- ❌ **NUNCA** usar dados mock/placeholder.
- ❌ **NUNCA** criar uma terceira camada HTTP. Já existem duas (`js/api.js` e `js/utils/api.js` — dívida D1); use a que os componentes vizinhos usam.
- ❌ **NUNCA** refatorar `GeneralReport.js` (1.172 linhas, dívida D3). **Adicionar seção, não reestruturar.**
- ❌ **NUNCA** quebrar os dashboards atuais.
- ✅ Contradição com o código → **PARE e reporte**.

---

## OBJETIVO DA FASE H
1. Tela de gestão do direito à refeição (com histórico e importação).
2. Tela de gestão de autorizações de saída.
3. Feed de tentativas negadas reutilizável (cantina + portaria).
4. Atualizar dashboards com os KPIs novos.

## DEPENDÊNCIAS
**Fases A–G concluídas** (a API precisa existir e responder).

---

## ARQUIVOS
### Novos (4)
```
js/components/MealEntitlementManagement.js
js/components/ExitPermissionManagement.js
js/components/DeniedAttemptsFeed.js
js/components/MealEntitlementHistoryModal.js
```
### Alterados (6)
```
index.html                            (+<script src> na ordem correta)
js/utils/api.js                       (+chamadas dos endpoints novos)
js/data/constants.js                  (+labels/traduções)
js/components/CantineMonitor.js       (+feed de negadas)
js/components/AdminDashboard.js       (KPIs: alertasHoje, negadasHoje, divergenciaHoje)
js/components/GeneralReport.js        (+seção de negadas e método — SEM refatorar)
```
### Ler antes (obrigatório)
```
js/components/CantineMonitor.js   ← padrão de polling (3s) e cleanup do useEffect
js/components/UserManagement.js   ← padrão de tabela, busca, modal, estados
js/components/AdminDashboard.js   ← padrão de KPI cards e polling 5s
js/utils/userCache.js             ← API do cache (search, eventos)
js/utils/api.js                   ← padrão de chamadas e normalizers
js/data/constants.js              ← ACCESS_POINTS e labels
index.html                        ← ordem dos <script src>
js/components/Toast.js            ← feedback ao usuário
```

---

## ORDEM DE IMPLEMENTAÇÃO

### Passo 1 — `js/data/constants.js`: labels
Adicionar (seguindo o estilo do arquivo, mantendo o idioma da UI — **verifique se a UI está em francês ou português e siga**):
```js
DENIAL_REASON_LABELS = {
  MEAL_NOT_ENTITLED:   "Sem direito à refeição",
  OUTSIDE_MEAL_TIME:   "Fora do horário",
  DUPLICATE_MEAL:      "Refeição duplicada",
  EXIT_NOT_AUTHORIZED: "Saída não autorizada",
  OUTSIDE_EXIT_WINDOW: "Fora da validade da autorização",
  USER_INACTIVE:       "Usuário inativo",
  UNKNOWN_USER:        "Pessoa desconhecida",
  MISSING_DOOR_MAPPING:"Terminal sem mapeamento",
  DEVICE_DENIED:       "Negado pelo terminal",
  NORMAL:              "Normal"
}
AUTH_METHOD_LABELS = { FACE: "Rosto", CARD: "Cartão", UNKNOWN: "Desconhecido" }
ENTITLEMENT_STATUS_LABELS = { AUTHORIZED:"Autorizado", NOT_AUTHORIZED:"Sem direito", PENDING:"Pendente" }
EXIT_PERMISSION_TYPE_LABELS = { PERMANENT:"Permanente", RECURRING:"Recorrente", DATE_RANGE:"Período", SINGLE:"Pontual" }
EXIT_PERMISSION_STATUS_LABELS = { ACTIVE:"Ativa", REVOKED:"Revogada", USED:"Utilizada", EXPIRED:"Expirada" }
```
⚠️ **Traduzir para o idioma real da UI.** Se a interface está em francês, use francês. Não misturar idiomas.
⚠️ Este arquivo espelha conscientemente o backend (inconsistência conhecida I3): ao mudar um enum no backend, mude aqui **junto**.

### Passo 2 — `js/utils/api.js`: chamadas novas
Seguindo **exatamente** o padrão do arquivo (auth header, tratamento de erro, normalizers camelCase→snake_case quando aplicável):
```
getMealEntitlements({q, turma, status, page, size})
getMealEntitlementSummary()
getMealEntitlement(userId)
putMealEntitlement(userId, {status, validFrom, validUntil, note})
getMealEntitlementHistory(userId)
postMealEntitlementBulk(items, overwrite)
getExitPermissions({userId, status, type, from, to, page, size})
getActiveExitPermissions()
getExitPermissionsByUser(userId)
postExitPermission(payload)
revokeExitPermission(id, note)
getAttempts({from, to, pointId, userId, reason, method, page, size})
getAttemptStats({from, to})
getRefectoryAttempts()
getGateAttempts()
```
⚠️ Tratar **403** com mensagem clara ("Você não tem permissão para alterar este dado") em vez de erro genérico.

### Passo 3 — `DeniedAttemptsFeed.js` (reutilizável) — fazer PRIMEIRO
Componente genérico usado pela cantina e pela portaria.
**Props:** `fetchFn` (função que retorna a lista), `pollingMs` (default 5000), `title`, `emptyMessage`.
**Colunas obrigatórias** (exigência explícita do cliente para o painel da cantina): **aluno · turma · horário · método (badge FACE/CARD) · ponto de acesso · motivo (badge colorido)**.
Detalhes:
- Quando `userId` é null (pessoa desconhecida) → mostrar `employeeNoRaw` no lugar do nome, com indicação visual de "não cadastrado".
- Badges de motivo com cores distintas: `MEAL_NOT_ENTITLED` (vermelho), `DEVICE_DENIED` (laranja), `OUTSIDE_MEAL_TIME` (amarelo), `UNKNOWN_USER` (cinza), `EXIT_NOT_AUTHORIZED` (vermelho), `OUTSIDE_EXIT_WINDOW` (amarelo).
- Estados: carregando, vazio, erro (não quebrar a tela; mostrar mensagem).
- **Cleanup obrigatório** do `setInterval` no return do `useEffect` (padrão do projeto).

### Passo 4 — `MealEntitlementHistoryModal.js`
Modal (padrão dos modais existentes — ver `AccessModals.js` / `StudentManagerModal.js`). Timeline desc: **quando · quem · de → para · validade antiga → nova · nota · origem (UI/BULK/API)**.

### Passo 5 — `MealEntitlementManagement.js` ★ tela principal da cantina
Funcionalidades (todas exigidas pelo cliente):
- **Pesquisar aluno** (nome ou ID) — usar `userCache.search` com debounce 250ms **ou** o parâmetro `q` da API. Preferir o `q` da API aqui, porque a listagem já traz o status (evita cruzar dados no cliente).
- **Filtrar por turma** e por **status**.
- **Tabela**: ID, nome, turma, status (badge), validade, atualizado por/quando.
- **Alterar status** inline (select AUTHORIZED / NOT_AUTHORIZED / PENDING) + datas de validade + nota → salva via PUT.
- **Histórico** por aluno (abre o modal do passo 4).
- **Importar** planilha (`libs/xlsx.min.js`, já local): colunas `id | status | valid_from | valid_until | note`. **Preview antes de enviar**; após enviar, exibir o relatório (`totalRecebido/Criado/Atualizado/Ignorado/Falhas` + tabela de erros por linha). Oferecer checkbox "sobrescrever existentes" → `overwrite=true`.
- **Exportar** a listagem atual (xlsx ou csv, seguindo o padrão de export do projeto).
- **Resumo** no topo: autorizados / sem direito / pendentes / total (via `/summary`).
- ⚠️ **Alunos sem linha aparecem como PENDING** (a API já faz isso). Deixar claro na UI que **pendente ≠ sem direito** — é dado não preenchido. Sugestão: badge cinza com tooltip.
- ⚠️ Se o usuário logado **não** tem `MEAL_ENTITLEMENT_WRITE` (nem é ADMIN) → campos de escrita **desabilitados** (não escondidos) + aviso discreto. Usar `/api/auth/me`.

### Passo 6 — `ExitPermissionManagement.js` ★ tela da portaria
- **Formulário de criação**: aluno (busca via `userCache`), tipo (PERMANENT/RECURRING/DATE_RANGE/SINGLE), validade (datas), horário (start/end), dias da semana (checkboxes seg–dom → CSV ISO 1..7), **motivo (obrigatório)**, nota.
  - Campos **condicionais por tipo**: `DATE_RANGE` exige datas; `RECURRING` exige dias; `PERMANENT`/`SINGLE` não exigem. **Validar no cliente** antes de enviar (a API valida também).
- **Lista de ativas** com: aluno, turma, tipo, validade, horário, dias, **quem autorizou**, **motivo**, criado em.
- **Revogar** (botão + modal pedindo nota) → mostra **quem revogou** e **quando**.
- **Histórico por aluno**: todas as permissões (ACTIVE/REVOKED/USED/EXPIRED).
- **Feed de tentativas negadas** da portaria (`DeniedAttemptsFeed` com `getGateAttempts`).
- ⚠️ Escrita desabilitada sem `EXIT_PERMISSION_WRITE`/ADMIN.

### Passo 7 — `CantineMonitor.js`: adicionar o feed
**Não alterar a lógica existente de logs.** Adicionar o `DeniedAttemptsFeed` (com `getRefectoryAttempts`, polling **3s** — mesmo intervalo já usado no componente) numa seção própria, claramente separada dos acessos válidos.
⚠️ **Distinção visual obrigatória:** acessos válidos e tentativas negadas **nunca** podem se confundir na tela. Seção separada, título claro, cor distinta.

### Passo 8 — `AdminDashboard.js`: KPIs
- Trocar a leitura de `blockedToday` → **`alertasHoje`** (o backend mantém os dois; usar o nome correto).
- Adicionar cards: **`negadasHoje`** ("Tentativas negadas") e **`divergenciaHoje`**.
- ⚠️ **`divergenciaHoje` precisa de tooltip/legenda explicando**: *"O terminal liberou a passagem, mas o MAGBO não considerou acesso válido (ex.: aluno sem direito à refeição entrou mesmo assim). Mede o que o bloqueio físico via HikCentral vai resolver."* — sem essa explicação o número não significa nada para a direção.
- Manter o polling de 5s e todos os cards atuais.

### Passo 9 — `GeneralReport.js`: seção nova
**NÃO refatorar.** Adicionar ao final uma seção "Tentativas negadas": totais por motivo, por turma, por ponto; e um breakdown de método (FACE vs CARD) usando `/api/access/attempts/stats`. Seguir o padrão de seção já existente no arquivo (mesma estrutura de card/tabela/export).

### Passo 10 — `index.html`: scripts
Adicionar os 4 componentes novos **na ordem correta**:
```
DeniedAttemptsFeed.js            ← antes de quem o usa
MealEntitlementHistoryModal.js   ← antes de MealEntitlementManagement
MealEntitlementManagement.js
ExitPermissionManagement.js
```
Colocar **depois** de `constants.js`, `api.js`, `userCache.js` e `Toast.js`, e **antes** do `app.js`/root. Seguir a convenção de versionamento de query string se o arquivo usar (`?v=1`).

### Passo 11 — Navegação
Adicionar as duas telas ao menu administrativo existente, com visibilidade conforme setor/role (mesma lógica já usada pelos itens atuais). **Não redesenhar a navegação.**

---

## REGRAS QUE NÃO PODEM SER QUEBRADAS
1. Sem bundler, sem ES modules, sem npm para UI.
2. `userCache` como fonte única de pessoas.
3. Cleanup de todo `setInterval`/`setTimeout` no `useEffect`.
4. Acessos válidos e tentativas negadas **visualmente separados**.
5. `PENDING` apresentado como "dado não preenchido", **não** como negação.
6. Sem permissão → campos **desabilitados**, não escondidos.
7. `GeneralReport.js` não é refatorado.
8. Dashboards atuais sem regressão.
9. Labels espelhados com o backend.
10. Zeros à esquerda: nunca formatar ID como número (`0001764` **não** pode virar `1764`). ⚠️ Cuidado especial na **importação xlsx**: o SheetJS pode ler `0001764` como número → forçar leitura como texto (`{raw: false}` ou `cellText`) e validar.

## CRITÉRIOS DE ACEITE
- [ ] App Electron abre sem erro no console.
- [ ] Tela de gestão da cantina: busca, filtro por turma/status, listagem com alunos sem linha aparecendo como PENDING.
- [ ] Alterar status → salva, toast de sucesso, lista atualiza.
- [ ] Histórico abre e mostra de→para, quem, quando, origem.
- [ ] Importação: preview → envio → relatório com os 5 contadores e erros por linha.
- [ ] ★ Importação de planilha com ID `0001764` → enviado como **String com zeros**, não `1764`.
- [ ] Tela de saídas: criar (campos condicionais por tipo), listar ativas, revogar com nota, ver quem autorizou/revogou.
- [ ] Criar permissão sem motivo → bloqueado no cliente.
- [ ] Feed de negadas na cantina: aluno, turma, horário, método, ponto, motivo — atualizando a cada 3s.
- [ ] Feed na portaria idem.
- [ ] Pessoa desconhecida no feed → mostra `employeeNoRaw` com indicação de não cadastrada.
- [ ] AdminDashboard: `alertasHoje`, `negadasHoje`, `divergenciaHoje` com tooltip explicativo.
- [ ] ★ Todos os dashboards e relatórios existentes **sem regressão**.
- [ ] Operador sem permissão de escrita: vê os dados, campos desabilitados, 403 tratado com mensagem clara.

## VALIDAÇÕES (o Sam faz manualmente na UI)
1. Abrir o app; console sem erro.
2. Gestão da cantina: buscar "9999999", trocar status para NOT_AUTHORIZED, salvar, abrir histórico.
3. Passar o rosto no terminal → conferir a tentativa aparecendo no feed em ≤3s com todos os 6 campos.
4. Importar uma planilha de teste com 3 linhas (uma com ID `0001764`) → conferir zeros preservados no banco.
5. Criar permissão SINGLE, revogar, conferir quem autorizou/revogou.
6. AdminDashboard: conferir os 3 KPIs e o tooltip da divergência.
7. Abrir todas as telas antigas (CantineMonitor, GeneralReport, SectorView, CDI) → nenhuma regressão.

## CHECKLIST DE CONCLUSÃO
- [ ] 4 componentes novos, sem ES modules, seguindo o padrão dos vizinhos
- [ ] `constants.js` com labels no idioma correto da UI
- [ ] `api.js` com as 14 chamadas + tratamento de 403
- [ ] `DeniedAttemptsFeed` reutilizável com as 6 colunas
- [ ] `CantineMonitor` com feed separado visualmente
- [ ] `AdminDashboard` com os 3 KPIs + tooltip da divergência
- [ ] `GeneralReport` com seção nova, **sem refatoração**
- [ ] `index.html` com scripts na ordem correta
- [ ] Navegação atualizada
- [ ] Leitura de xlsx preservando zeros à esquerda
- [ ] **Nenhum commit**

## RISCOS
| Risco | Severidade | Mitigação |
|---|---|---|
| ★ xlsx transformar `0001764` em número | **Alta** (corrompe dados) | Forçar leitura como texto; validar no preview; testar explicitamente |
| Usar ES modules/import por hábito | **Alta** (quebra tudo, sem bundler) | Ler os componentes existentes antes; copiar o padrão |
| Ordem errada no `index.html` → componente undefined | Alta | Dependências primeiro; testar abrindo o app |
| Vazamento de memória por `setInterval` sem cleanup | Média | Cleanup no return do `useEffect` |
| Confundir tentativa negada com acesso válido na tela | **Alta** (operacional) | Seção separada, cor distinta, título claro |
| Refatorar `GeneralReport.js` e quebrar relatórios | Alta | **Proibido** refatorar; só adicionar |
| Idioma misturado | Média | Verificar o idioma real da UI antes |

## ROLLBACK
| Nível | Ação | Perda |
|---|---|---|
| Código | `git revert` → componentes somem, backend continua funcionando normalmente | Nenhuma |
| Parcial | Remover os `<script src>` do `index.html` desabilita as telas novas sem tocar no resto | Nenhuma |
⚠️ O frontend é a camada mais segura para rollback: nenhum dado depende dele.

## AO TERMINAR
1. Abrir o app e confirmar console limpo. 2. Checklist. 3. Confirmar: "nenhum ES module foi usado; zeros à esquerda preservados na importação; dashboards antigos sem regressão". 4. **NÃO commitar.**
