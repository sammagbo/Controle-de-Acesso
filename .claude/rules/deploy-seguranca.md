# Regras — Deploy & Segurança

- **VM (canônico):** `deploy/docker-compose.yml` + `.env` (copiar de `.env.example`; nunca commitar .env). Compose monta o jar de `../backend/target` num JRE 17 — buildar antes (`mvn package`). Postgres exposto só em 127.0.0.1.
- Env obrigatórias em produção real: `POSTGRES_PASSWORD` forte, `MAGBO_JWT_SECRET` (>=48 bytes base64), `MAGBO_WEBHOOK_TOKEN` (32+ chars), `ADMIN_PIN` (≠1234), trocar senha do usuário `admin` do app (default admin1234).
- `ProdSecurityStartupCheck` avisa: senha de banco dev, JWT dev, webhook token ausente (deny-by-default). Não há check p/ ADMIN_PIN default — melhoria M2.
- Webhook: token comparado com `MessageDigest.isEqual` + trim (CRLF já mordeu). PIN admin: lockout 5 falhas → 60s.
- CORS `*` com credentials — aceitável em rede interna; revisitar na VM (restringir origem do Electron se aplicável).
- Frontend kiosk depende de CDNs (R1): antes do piloto, vendorizar React/Tailwind/Babel/lucide/jspdf em `libs/` (xlsx já é local).
- Git: `.mailmap` remapeia autores antigos. ⚠️ R2: string com cara de senha exposta como e-mail de autor em commits antigos e no próprio .mailmap — se for/foi senha real, ROTACIONAR onde usada; avaliar `git filter-repo` (decisão do Sam).
- ⚠️ **O container do backend monta UM volume: `../backend/target:/app`** — e esse diretório é a saída do Maven, que `mvn clean` apaga e todo build reescreve. **Nada que precise sobreviver pode ser escrito em disco pelo backend.** Foi essa a razão de as **fotos de identificação** irem para o Postgres (V011, `user_photos`): lá elas entram no `pg_dump` que o procedimento de backup já faz. Guardar arquivo em disco exigiria um volume novo no `deploy/docker-compose.yml` + a atualização de `deploy/backup.sh` e do procedimento de restauração — **decisão de deploy, não efeito colateral de uma feature**.
- **Fotos de menores:** leitura só autenticada (não há URL pública — a tela busca por `fetch` com token e monta `objectURL`), **sem endpoint de exportação em massa**, nenhum byte em log, exclusão definitiva, e as imagens da câmera continuam descartadas. Retenção: vivem **só** em `user_photos`, saem no `pg_dump` junto com o resto (o backup do banco **é** o backup das fotos) e são apagadas quando o cadastro é removido.
- Nunca colocar segredos em commits, docs ou prompts. Token do webhook vive no `setx` do PC / `.env` da VM.
