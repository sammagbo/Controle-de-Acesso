# Skill: Deploy na VM (resumo canônico)

Pré: VM Ubuntu 24.04 na VLAN 192.168.1.x, IP fixo, firewall liberando 8080 das duas VLANs + SSH.
1. `mvn -f backend/pom.xml clean package` (jar em backend/target).
2. Copiar repo/artefatos; `cd deploy && cp .env.example .env` → preencher POSTGRES_PASSWORD forte, MAGBO_JWT_SECRET (`openssl rand -base64 64 | tr -d '\n'`), MAGBO_WEBHOOK_TOKEN, e ⚠️ **ADMIN_PIN + MAGBO_ADMIN_PASSWORD, que sao OBRIGATORIOS**: o `docker compose up` RECUSA subir sem eles (vazio falha em silencio — PIN vazio torna o Painel Administrativo inalcancavel; senha vazia cria um admin SEM SENHA numa base nova). `MAGBO_ADMIN_PASSWORD` so vale em base que ainda NAO tem o utilizador `admin`.
3. `docker compose up -d` (usa deploy/docker-compose.yml — NUNCA o da raiz).
4. Health, login admin (trocar senha!). ⚠️ **Conferir o FUSO antes de tudo:** `docker exec magbo-backend date` tem de dar `-0300`. Se der `+0000`, o `TZ` do compose sumiu e todo `LocalDateTime.now()` grava 3h a frente das passagens (medido 25/08/2026: 17:27 local, gravado 20:27).
5. Migrar 923 alunos: dump do PC **após** correções de schema → restore; smoke (deploy/smoke-tests.md).
6. Apontar Écoute HTTP dos terminais pro IP da VM; door-mappings pros IPs fixos deles.
Guia extenso: docs/implantacao/ (pendente de commit — P4).
