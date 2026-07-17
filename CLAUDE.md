# MAGBO Access Control — Contexto permanente

Sistema de controle de acesso do Lycée Molière (Rio). Dono e único dev: **Sam (Vie Scolaire)**, marca MAGBO STUDIO. Reconhecimento facial (terminais Hikvision) → webhook HTTP → Spring Boot → PostgreSQL → dashboard Electron/React.

## Stack
- **Backend:** Spring Boot 3.2.5 / Java 17 (roda em Java 21 no PC), Maven. Perfis: `dev` (H2) e `prod` (PostgreSQL). `ddl-auto=update`.
- **Frontend:** Electron + React 18 via Babel standalone (sem bundler), Tailwind CDN. ⚠️ React/Tailwind/Babel/lucide/jspdf vêm de CDN — kiosk sem internet não renderiza (risco aberto R1).
- **Banco:** PostgreSQL 16 (container `magbo-postgres`, db `magbodb`, user `magbo`).
- **Repo:** github.com/sammagbo/Controle-de-Acesso (público). Branch única: `main`.

## Regras de colaboração (invioláveis)
1. **NUNCA commitar/push sem confirmação explícita do Sam.** (Regra já violada 4x no passado por executores.)
2. Patches **cirúrgicos** formato ORIGINAL/NOVO (bloco literal). Âncora ausente ou duplicada → **PARAR e reportar**.
3. Método: **um passo → validar → commit → próximo.** Uma decisão por vez.
4. Português no chat, **inglês nos commits**.
5. Nada de dados mock/placeholder.
6. Mudanças de banco: só **aditivas** (`ddl-auto=update` adiciona, nunca remove/relaxa — ver R5).

## Ambientes
- **PC-TRAB (principal):** Windows, projeto em `C:\Users\smagbo\Documentos-locais\Controle-de-Acesso`. 923 alunos reais. IP por DHCP (**muda entre reboots** — conferir `ipconfig` toda sessão).
- **Notebook Linux Mint (`fenixAzul`):** secundário.
- **VM (futura, SI):** Ubuntu 24.04 na VLAN 192.168.1.x. Deploy canônico: `deploy/docker-compose.yml`. HikCentral vive em 192.168.1.90.
- **Terminal de teste:** Hikvision DS-K1T344MX-E1, fw V4.13.0 build 250728, admin web `admin`/senha registrada pelo Sam. IP por DHCP (conferir no display).

## Gotchas operacionais (decorados a ferro)
1. **Dois docker-compose:** raiz = LEGADO (`magbo-db`, postgres/magbo_access). Canônico p/ VM = `deploy/`. Antes de subir: `docker ps` → se `magbo-db` rodando: `docker stop magbo-db; docker start magbo-postgres`.
2. **Backend no PC exige 4 env vars na MESMA sessão** (fallbacks do prod apontam pro banco errado): `MAGBO_WEBHOOK_TOKEN` (do setx), `MAGBO_DB_URL=jdbc:postgresql://localhost:5432/magbodb`, `MAGBO_DB_USERNAME=magbo`, `MAGBO_DB_PASSWORD=magbo_dev_pass_2026`. Depois `cd backend && mvn spring-boot:run "-Dspring-boot.run.profiles=prod"`.
3. Backend precisa de **restart manual** após mudança Java.
4. 2 WARNs `SECURITY [prod]` no PC são normais; na VM seriam erro de config.
5. Health: `Invoke-WebRequest http://localhost:8080/api/health -UseBasicParsing | Select -ExpandProperty Content` → `"database":"CONNECTED"`.
6. **IPs dançam** (PC .7→.14→.12; terminal .17→.14 em 3 dias). Pedir reserva DHCP ao SI. Toda sessão: `ipconfig` + IP no display do terminal + conferir `Écoute HTTP` e `door_mappings`.
7. **Testes (Fase I):** a env var `MAGBO_WEBHOOK_TOKEN` (do `setx` no PC) **vence** o `application-test.properties` no mesmo processo — os ITs precisaram fixar o token via `@SpringBootTest(properties=...)` para não pegar o do ambiente. Na VM o token vem do `.env`. Rodar a suíte com `mvn test` (o surefire já inclui `*IT.java`).

## Estado atual (2026-07-16)
- **Camada de decisão implementada (Fases A–K da `docs/architecture/ESPECIFICACAO-TECNICA-v1.md`).** Fases A–K + correção B.1 **commitadas e publicadas no GitHub** (16/07; código `e450cd3`, docs `8702ce7`). Validação com hardware: **smoke test 3/3 OK (16/07)**; bateria completa V01–V14 ainda **pendente** — só após `mvn test` verde.
- **Reunião com o Fabiano (SI) + decisões D1–D9 (2026-07-16):** cantina = **bloqueio operacional assistido** (terminal valida identidade · MAGBO valida regra · operador aplica exceção) — **sem bloqueio físico via HikCentral para refeição, nem no roadmap** (**ADR-004**). Direitos de refeição vivem **só no MAGBO** (sem sync MAGBO↔HCP). O HCP vira provisionamento puro (ciclo de pessoas via CSV → `Apply to Device`; export CSV do MAGBO é a F7b futura). Níveis de acesso administrados pela Direção/Vice; operador executa entitlement no MAGBO. Exceção = registro manual (`POST /api/access`, `created_by_user`). IP fixo: Fabiano pediu reservas ao SI; **VM já criada**, aguardando fim dos testes. Detalhes e as **6 pendências** que sobram: `docs/operacional/procedimento-hikcentral.md`.
- **Smoke test com hardware (2026-07-16): 3/3.** Face → `access_log` `440000` REFEI1/FACE/75; cartão → `440001` CARD/1; validade expirada → **0 logs** + `access_attempts` id=1 `DEVICE_DENIED`/sub=8 (**primeiro registro real** da tabela; CANT-09 provado corrigido em hardware). FACE e CARD para o mesmo aluno OK (D8). `door_mappings` id 15 atualizado `172.20.40.12`→`172.20.40.10`; id 14 (`172.20.40.17`) órfão de DHCP (inofensivo, limpar depois).
- **R8 resolvido (2026-07-16):** credencial exposta como e-mail de autor no histórico git/`.mailmap` — vivia só no branch `gh-pages` (demo abandonada, sem relação com `main`), removido do remoto; senha **rotacionada**; `.mailmap` limpo; `main` com autor limpo (`--no-use-mailmap`), sem reescrita de histórico. Ver **R2** do `docs/architecture/relatorio-auditoria-2026-07-10.md`.
- **Regra estrutural:** `access_logs` = acesso **efetivo/autorizado** · `access_attempts` = tudo **tentado e negado** (ADR-001). Nenhuma query legada de `access_logs` mudou.
- **Novas tabelas:** `access_attempts`, `meal_entitlements`, `meal_entitlement_events` (histórico), `student_exit_permissions`; + coluna aditiva `system_users.permissoes` (CSV granular, nullable).
- **Taxonomia de 4 eixos** em `access_attempts`: método (`auth_method` FACE/CARD/UNKNOWN) · resultado físico do terminal (`auth_result`) · decisão do MAGBO (`authorization_result`) · motivo (`denial_reason`).
- **MAGBO é observacional:** o webhook é pós-evento; **não bloqueia porta** (ADR-003). Bloqueio físico só via HikCentral — **exceto refeição**, que é **bloqueio operacional assistido** (operador + feed), **sem** bloqueio físico, nem no roadmap (ADR-004). Divergência física×lógica medida por `divergenciaHoje` (`auth_result=SUCCESS` E `authorization_result=DENIED`); para refeição, a divergência é **por design** (carga de exceção do operador).
- **Políticas por properties** (sem recompilar) `magbo.policy.*`: meal-not-entitled, meal-pending, outside-meal-time, duplicate-meal, exit-not-authorized, user-inactive, missing-door-mapping + `magbo.dedup.{enabled,window-seconds}`. **Produção: `meal-pending=DENY`** (D5, 16/07, ADR-004; pré-requisito operacional: bulk dos autorizados **antes** do dia 1, senão todo `PENDING` é negado); negadas de refeição=DENY, alertas=OBSERVATION. **Dev (`application.properties`) mantém `meal-pending=OBSERVATION`.**
- **Whitelist rígida de subtipos:** só 75(face)/1(cartão) geram `access_logs`; 8 e desconhecidos → `access_attempts`. `auth_method` gravado em `access_logs`.
- **Testes automatizados existem (Fase I):** `mvn test` → 183 testes, 0 falhas (7 unitários + 17 ITs). ⚠️ o `pom.xml` tem `maven-surefire-plugin` com `<include>*IT.java` — **sem isso o Surefire pula os 17 ITs em silêncio**. 2 queries nativas PostgreSQL-only ficam `@Disabled` (H2 não roda) → conferência manual obrigatória na V13.
- **Dívidas conhecidas (congeladas em teste, NÃO corrigir sem decisão):** (2) `DEVICE_DENIED` gravado p/ subtipos desconhecidos (falta `UNKNOWN_EVENT` no enum) — polui `divergenciaHoje`; (4) endpoints `@PreAuthorize` sem token devolvem **403**, não 401 (só o webhook devolve 401). **(1) e (3) corrigidas na B.1 (`e450cd3`, 16/07):** `summary` agora responde 200 (teste `summaryRetornaContagensCorretas`), guard do webhook usa `isBlank()`.
- **SQL versionado** em `deploy/migrations/` (Fase J); Flyway **não** adotado ainda (decisão registrada no README das migrations).
- **Backlog pré-piloto:** **F7a e F7c CONCLUÍDOS e provados 16/07** (E2E com Electron real, rede bloqueada, insert SQL ao vivo): **F7a** = destaque visual (~8s) + beep Web Audio (1 por lote) + toggle de som (persistido) no `DeniedAttemptsFeed`; **F7c** = avatares **locais** (`window.localAvatar`, SVG de iniciais inline em `js/utils/helpers.js`) no lugar do `api.dicebear.com` (kiosk offline não quebra mais foto). **F7b permanece (NÃO implementar sem decisão):** botão de **exportação CSV no formato do HCP** (`Person ID` = `hikvision_employee_id` como TEXTO, zeros à esquerda; **nunca** via Excel) — só após o template do HCP ser definido (pendência com o Fabiano).
- **Bug corrigido (16/07, `f947373`):** o feed de negadas nunca exibia dado — `getRefectoryAttempts`/`getGateAttempts` existiam em `js/utils/api.js` (Fase H) mas **nunca eram anexadas ao `window.api`**; o `CantineMonitor` caía no fallback `[]` **em silêncio** (curl no endpoint devolvia a attempt; a tela dizia "Aucune tentative"). Ligado no fim de `api.js`. **Resolvida a pendência irmã (17/07):** o `<DeniedAttemptsFeed/>` do `GeneralReport` (antes sem props → caixa de erro) agora usa o **endpoint geral** `GET /api/access/attempts` via `window.api.getAllAttempts` (decisão do Sam: relatório mostra todos os pontos, sem janela de tempo). Semântica dos feeds: cantina/portão = operacional (**últimas 12h**) · relatório = histórico (últimos 50).
- Detalhes: spec `ESPECIFICACAO-TECNICA-v1.md`, ADRs em `docs/architecture/decisoes/`, bateria em `docs/testing/plano-validacao-estrutural.md`. Histórico: `docs/architecture/relatorio-auditoria-2026-07-10.md` e `docs/testing/plano-2026-07-13.md`.

## Onde procurar
- Padrões por área: `.claude/rules/`
- Processos repetitivos: `.claude/skills/`
- Arquitetura e fluxos: `docs/architecture/`
- Plano e evidências de teste: `docs/testing/`
