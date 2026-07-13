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

## Estado atual (2026-07-10, commit `0f655b4`)
- Pipeline **validado ponta a ponta com hardware**: rosto → multipart → parse → token (?token=) → mapping por IP → AccessLog `REFEI1/fallback=false`.
- F6a (captura) e F6b (parse tolerante + token query) commitados e validados.
- Absorvidos no main (NÃO refazer): busca backend-driven (userCache + eventos `user-cache-updated`), remoção do mockData, Dashboard 2.0, D4, Fase 3 segurança, F5a AreaMapping, F5b anti-poluição.
- Pendentes: T8 (bateria 13/07) → F5c dedupe → F5d classificação de eventos → flags refinadas + política + rename `blockedToday`→`alertasHoje` → docs/implantacao (commit) → VM.
- Detalhes: `docs/architecture/relatorio-auditoria-2026-07-10.md` e `docs/testing/plano-2026-07-13.md`.

## Onde procurar
- Padrões por área: `.claude/rules/`
- Processos repetitivos: `.claude/skills/`
- Arquitetura e fluxos: `docs/architecture/`
- Plano e evidências de teste: `docs/testing/`
