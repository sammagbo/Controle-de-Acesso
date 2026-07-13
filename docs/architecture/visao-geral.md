# Arquitetura — Visão geral (2026-07-10)

**Camadas:** Aparelhos Hikvision (terminais MinMoe / câmeras DeepinView) → Webhook HTTP → Backend Spring Boot (regras + persistência) → PostgreSQL → Frontend Electron (dashboards, relatórios, operação manual). O backend é **observacional**: nunca decide a porta — o aparelho autentica localmente e notifica depois. Se o backend cair, o fluxo físico continua (decisão arquitetural, não lacuna).

**Áreas funcionais** (`AreaMapping`, espelhado em `js/data/constants.js`): cantine (REFEI1/REFEI2), cdi (BIBLIO), infirmerie (ENFERM), portail (PORT1/2/3). Pontos virtuais de UI: CANTINA_MONITOR/REPORT, INFIRMARY_REPORT, GENERAL_REPORT.

**Identidade:** app_users.id = matrícula Pronote (String, zeros preservados) = hikvision_employee_id. 923 alunos reais no PC. Importação: CSV Pronote (drop em ftp_drop/, cron 03:00, POST /api/pronote/sync) + POST /api/users/bulk (xlsx via frontend). Fonte API Pronote: stub aguardando credenciais.

**Perfis:** dev = H2 memória + seed data.sql (QA A001..F001). prod = PostgreSQL; no PC exige 4 env vars (fallbacks apontam pro banco errado desde c145d54).

**Autorização:** JWT (8h) + roles ADMIN/OPERATOR; operadores restritos por `setoresPermitidos` (lista ou `*`), checagem `AreaSecurity.can(area)` + `canOperateSector` no acesso manual. PIN admin (ações sensíveis de UI) com lockout.

**Módulo CDI (Biblioteca):** UI própria (js/cdi/) em cima do backend — presença = último log BIBLIO por usuário; scan registra ENTRADA/SAIDA via POST /api/access; cadastro read-only; localStorage só para preferências/backup local.

**Deploy:** PC (mvn run, bench) hoje; VM Ubuntu 24.04 + deploy/docker-compose.yml (canônico) no piloto. Compose da raiz = legado, não usar.
