# Skill: Deploy na VM (resumo canônico)

Pré: VM Ubuntu 24.04 na VLAN 192.168.1.x, IP fixo, firewall liberando 8080 das duas VLANs + SSH.
1. `mvn -f backend/pom.xml clean package` (jar em backend/target).
2. Copiar repo/artefatos; `cd deploy && cp .env.example .env` → preencher POSTGRES_PASSWORD forte, MAGBO_JWT_SECRET (`openssl rand -base64 64 | tr -d '\n'`), MAGBO_WEBHOOK_TOKEN.
3. `docker compose up -d` (usa deploy/docker-compose.yml — NUNCA o da raiz).
4. Health, login admin (trocar senha!), ADMIN_PIN via env.
5. Migrar 923 alunos: dump do PC **após** correções de schema → restore; smoke (deploy/smoke-tests.md).
6. Apontar Écoute HTTP dos terminais pro IP da VM; door-mappings pros IPs fixos deles.
Guia extenso: docs/implantacao/ (pendente de commit — P4).
