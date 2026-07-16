# Arquitetura — Visão geral (2026-07-10)

**Camadas:** Aparelhos Hikvision (terminais MinMoe / câmeras DeepinView) → Webhook HTTP → Backend Spring Boot (regras + persistência) → PostgreSQL → Frontend Electron (dashboards, relatórios, operação manual). O backend é **observacional**: nunca decide a porta — o aparelho autentica localmente e notifica depois. Se o backend cair, o fluxo físico continua (decisão arquitetural, não lacuna).

**Áreas funcionais** (`AreaMapping`, espelhado em `js/data/constants.js`): cantine (REFEI1/REFEI2), cdi (BIBLIO), infirmerie (ENFERM), portail (PORT1/2/3). Pontos virtuais de UI: CANTINA_MONITOR/REPORT, INFIRMARY_REPORT, GENERAL_REPORT.

**Identidade:** app_users.id = matrícula Pronote (String, zeros preservados) = hikvision_employee_id. 923 alunos reais no PC. Importação: CSV Pronote (drop em ftp_drop/, cron 03:00, POST /api/pronote/sync) + POST /api/users/bulk (xlsx via frontend). Fonte API Pronote: stub aguardando credenciais.

**Perfis:** dev = H2 memória + seed data.sql (QA A001..F001). prod = PostgreSQL; no PC exige 4 env vars (fallbacks apontam pro banco errado desde c145d54).

**Autorização:** JWT (8h) + roles ADMIN/OPERATOR; operadores restritos por `setoresPermitidos` (lista ou `*`), checagem `AreaSecurity.can(area)` + `canOperateSector` no acesso manual. PIN admin (ações sensíveis de UI) com lockout.

**Módulo CDI (Biblioteca):** UI própria (js/cdi/) em cima do backend — presença = último log BIBLIO por usuário; scan registra ENTRADA/SAIDA via POST /api/access; cadastro read-only; localStorage só para preferências/backup local.

**Deploy:** PC (mvn run, bench) hoje; VM Ubuntu 24.04 + deploy/docker-compose.yml (canônico) no piloto. Compose da raiz = legado, não usar.

**Camada de decisão (Fases A–K, 2026-07):** entre o webhook e a persistência entra o `AccessDecisionService` (orquestrador `@Transactional`) apoiado por `HikvisionEventClassifier`, `MealEntitlementService`, `ExitPermissionService`, `DeduplicationService` e `AccessAttemptService`. Ele separa **`access_logs`** (acesso efetivo/autorizado) de **`access_attempts`** (tentativa negada) — ver `decisoes/ADR-001-attempts-vs-logs.md`. A **observacionalidade** é decisão de arquitetura: o terminal decide e notifica depois; o MAGBO classifica, audita e **mede a divergência** física×lógica (`divergenciaHoje`), mas **não fecha porta** — bloqueio físico só via HikCentral (`decisoes/ADR-003-webhook-pos-evento.md`; procedimento em `docs/operacional/procedimento-hikcentral.md`), **exceto refeição**: decidido em 16/07 como **bloqueio operacional assistido** (operador + feed), **sem** bloqueio físico via HikCentral nem no roadmap — o HCP vira provisionamento puro de pessoas (`decisoes/ADR-004-bloqueio-operacional-assistido.md`). Método de autenticação (face 75 / cartão 1) grava `auth_method`; o número de cartão **não** é armazenado (`decisoes/ADR-002-cartao-nao-persistido.md`). Políticas de negação/observação são **configuráveis por properties** (`magbo.policy.*`), sem recompilar.
