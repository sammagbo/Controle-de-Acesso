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
- **Camada de decisão implementada (Fases A–K da `docs/architecture/ESPECIFICACAO-TECNICA-v1.md`).** Fases A–H commitadas (HEAD `ff41ed1`); Fases I (testes) e J (migrations) implementadas, ainda **não commitadas**. Validação com hardware (bateria V01–V14) **pendente** — só após `mvn test` verde.
- **Regra estrutural:** `access_logs` = acesso **efetivo/autorizado** · `access_attempts` = tudo **tentado e negado** (ADR-001). Nenhuma query legada de `access_logs` mudou.
- **Novas tabelas:** `access_attempts`, `meal_entitlements`, `meal_entitlement_events` (histórico), `student_exit_permissions`; + coluna aditiva `system_users.permissoes` (CSV granular, nullable).
- **Taxonomia de 4 eixos** em `access_attempts`: método (`auth_method` FACE/CARD/UNKNOWN) · resultado físico do terminal (`auth_result`) · decisão do MAGBO (`authorization_result`) · motivo (`denial_reason`).
- **MAGBO é observacional:** o webhook é pós-evento; **não bloqueia porta** (ADR-003). Bloqueio físico só via HikCentral. Divergência física×lógica medida por `divergenciaHoje` (`auth_result=SUCCESS` E `authorization_result=DENIED`).
- **Políticas por properties** (sem recompilar) `magbo.policy.*`: meal-not-entitled, meal-pending, outside-meal-time, duplicate-meal, exit-not-authorized, user-inactive, missing-door-mapping + `magbo.dedup.{enabled,window-seconds}`. Piloto: negadas de refeição=DENY, alertas=OBSERVATION.
- **Whitelist rígida de subtipos:** só 75(face)/1(cartão) geram `access_logs`; 8 e desconhecidos → `access_attempts`. `auth_method` gravado em `access_logs`.
- **Testes automatizados existem (Fase I):** `mvn test` → 183 testes, 0 falhas (7 unitários + 17 ITs). ⚠️ o `pom.xml` tem `maven-surefire-plugin` com `<include>*IT.java` — **sem isso o Surefire pula os 17 ITs em silêncio**. 2 queries nativas PostgreSQL-only ficam `@Disabled` (H2 não roda) → conferência manual obrigatória na V13.
- **Dívidas conhecidas (congeladas em teste, NÃO corrigir sem decisão):** (1) `/meal-entitlements/summary` responde **500** — `MealEntitlementService.summary()` passa `"ALUNO"` String a `countByTipoAndAtivoTrue`, mas `tipo` é enum `UserType` (congelado em `MealEntitlementFlowIT#summaryQuebraPorBugDeTipo`); (2) `DEVICE_DENIED` gravado p/ subtipos desconhecidos (falta `UNKNOWN_EVENT` no enum) — polui `divergenciaHoje`; (3) guard `isEmpty()` vs `isBlank()` no webhook — `employeeNoString` só de espaços vira 500 (risco retry-storm); (4) endpoints `@PreAuthorize` sem token devolvem **403**, não 401 (só o webhook devolve 401).
- **SQL versionado** em `deploy/migrations/` (Fase J); Flyway **não** adotado ainda (decisão registrada no README das migrations).
- Detalhes: spec `ESPECIFICACAO-TECNICA-v1.md`, ADRs em `docs/architecture/decisoes/`, bateria em `docs/testing/plano-validacao-estrutural.md`. Histórico: `docs/architecture/relatorio-auditoria-2026-07-10.md` e `docs/testing/plano-2026-07-13.md`.

## Onde procurar
- Padrões por área: `.claude/rules/`
- Processos repetitivos: `.claude/skills/`
- Arquitetura e fluxos: `docs/architecture/`
- Plano e evidências de teste: `docs/testing/`
