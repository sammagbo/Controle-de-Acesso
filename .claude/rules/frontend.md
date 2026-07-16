# Regras — Frontend (Electron + React/Babel)

- Sem bundler: scripts carregados no `index.html` (ordem importa). React 18 UMD + Babel standalone + Tailwind CDN.
- Config vem do preload (`window.magboConfig`): `MAGBO_API_URL`, `MAGBO_SECTOR`, `MAGBO_KIOSK_PIN`; `NODE_ENV=production` liga kiosk.
- **Fonte de verdade de usuários:** `js/utils/userCache.js` (GET /api/users). Componentes escutam `user-cache-updated`/`user-cache-error`. NÃO reintroduzir listas locais/mock.
- Busca de pessoas: sempre remota via `userCache.search` (debounce 250ms) — padrão adotado (decisão fechada).
- Duas camadas HTTP coexistem: `js/api.js` (window.api) e `js/utils/api.js` (normalisers). Dívida D1 — ao mexer, não criar terceira; consolidar só como tarefa própria.
- Normalização camelCase(back)→snake_case(front) nos normalisers; `action`(back) = `status`(front) em logs.
- Polling: AdminDashboard 5s, CantineMonitor 3s, relógios 1s. Novos pollings: limpar no cleanup do useEffect.
- CDI/Biblioteca: presença e scan passam pelo backend (ponto `BIBLIO`); localStorage só p/ preferências/backup local. Cadastro de alunos é read-only no CDI.
- Constantes físicas da escola: `js/data/constants.js` (`ACCESS_POINTS`) — espelho consciente do `AreaMapping` do backend; alterar os DOIS juntos.
- Ícones lucide; paleta navy/gold MAGBO (tokens em styles.css/Tailwind config inline).

## Componentes da camada de decisão (Fase H)
- **Novos:** `MealEntitlementManagement` (gestão da cantina: busca via userCache, filtro turma/status, edição inline, importação xlsx, histórico) · `ExitPermissionManagement` (gestão de saídas: formulário com motivo obrigatório, ativas, revogar, mostra quem autorizou/revogou) · `DeniedAttemptsFeed` (**reutilizável**: props `endpoint`/`pollingMs`/`title`; usado na cantina e na portaria) · `MealEntitlementHistoryModal` (timeline quando/quem/de→para/origem).
- **Alterados:** `CantineMonitor` (+DeniedAttemptsFeed, polling 3s) · `AdminDashboard` (trocar `blockedToday`→`alertasHoje` + cards `negadasHoje`/`divergenciaHoje`) · `GeneralReport` (seção "tentativas negadas" — **adicionar seção, não refatorar**, dívida D3) · `constants.js` (labels de `DenialReason`/`AuthMethod`/`EntitlementStatus`) · `index.html` (ordem dos `<script>`) · `js/utils/api.js` (endpoints novos, **não** criar 3ª camada HTTP — D1).
- **Acessos válidos e tentativas negadas SEMPRE visualmente separados** (`access_logs` ≠ `access_attempts`) — nunca misturar numa mesma lista.
- **Labels de enums espelhados** em `js/data/constants.js` — mudar **junto** com o backend (mesmo padrão de `ACCESS_POINTS`/`AreaMapping`).
- **`PENDING`** = dado **não preenchido** (aluno sem linha de entitlement), apresentar como tal — **não** como "negado".
- **Sem permissão granular** (`MEAL_ENTITLEMENT_WRITE`/`EXIT_PERMISSION_WRITE`): campos **desabilitados**, **não escondidos** (leitura continua liberada por área).
- ⚠️ **xlsx e zeros à esquerda:** IDs Pronote têm zeros à esquerda; ao importar/exportar entitlements, tratar como **texto** (o xlsx tende a virar número e comer o zero).
- Dívida congelada: o card de resumo da cantina (`/meal-entitlements/summary`) hoje responde **500** (bug de tipo no backend) — não é falha do front.
