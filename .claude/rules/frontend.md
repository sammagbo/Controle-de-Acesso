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
