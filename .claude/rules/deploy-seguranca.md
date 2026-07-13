# Regras — Deploy & Segurança

- **VM (canônico):** `deploy/docker-compose.yml` + `.env` (copiar de `.env.example`; nunca commitar .env). Compose monta o jar de `../backend/target` num JRE 17 — buildar antes (`mvn package`). Postgres exposto só em 127.0.0.1.
- Env obrigatórias em produção real: `POSTGRES_PASSWORD` forte, `MAGBO_JWT_SECRET` (>=48 bytes base64), `MAGBO_WEBHOOK_TOKEN` (32+ chars), `ADMIN_PIN` (≠1234), trocar senha do usuário `admin` do app (default admin1234).
- `ProdSecurityStartupCheck` avisa: senha de banco dev, JWT dev, webhook token ausente (deny-by-default). Não há check p/ ADMIN_PIN default — melhoria M2.
- Webhook: token comparado com `MessageDigest.isEqual` + trim (CRLF já mordeu). PIN admin: lockout 5 falhas → 60s.
- CORS `*` com credentials — aceitável em rede interna; revisitar na VM (restringir origem do Electron se aplicável).
- Frontend kiosk depende de CDNs (R1): antes do piloto, vendorizar React/Tailwind/Babel/lucide/jspdf em `libs/` (xlsx já é local).
- Git: `.mailmap` remapeia autores antigos. ⚠️ R2: string com cara de senha exposta como e-mail de autor em commits antigos e no próprio .mailmap — se for/foi senha real, ROTACIONAR onde usada; avaliar `git filter-repo` (decisão do Sam).
- Nunca colocar segredos em commits, docs ou prompts. Token do webhook vive no `setx` do PC / `.env` da VM.
