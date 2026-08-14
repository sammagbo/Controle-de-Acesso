# MAGBO Access Control — Production Deployment

This directory contains everything needed to deploy MAGBO Access Control
on a production VM using Docker.

> **Updating an installation that already runs?** This file covers the FIRST
> install. To bring a new version onto a VM that is already serving the school —
> including how to switch the régime de sortie on, and in which order — follow
> [`docs/operacional/mise-a-jour-vm.md`](../docs/operacional/mise-a-jour-vm.md).
> It was written and then **walked literally** against a local instance holding
> the 439,993 real rows; its last section lists the five places where its own
> wording was not enough, and what replaced them.
>
> To rebuild from nothing, or to restore a backup:
> [`docs/operacional/reconstruir-do-zero.md`](../docs/operacional/reconstruir-do-zero.md).

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- The backend JAR must be built first (see "Build" below)
- A `.env` file based on `.env.example`

## Setup

1. **Build the backend JAR locally or on the VM:**
   ```bash
   cd ../backend
   mvn clean package -DskipTests
   ```
   This produces `backend/target/access-control-1.0.0.jar`.

2. **Configure environment:**
   ```bash
   cp .env.example .env
   nano .env  # Set strong passwords + generate a new JWT secret
   ```

3. **Start services:**
   ```bash
   docker compose up -d
   ```

4. **Apply the SQL migrations — ⚠️ THIS STEP IS NOT OPTIONAL:**

   The schema is created by Hibernate (`ddl-auto=update`), which **adds** but
   never alters a CHECK constraint and never removes anything. Several
   migrations therefore exist that Hibernate will NOT apply for you, and the
   failures they prevent are **delayed and silent** — they arm weeks later, in
   production, inside the transaction that records a real passage.

   ```bash
   # The full ordered list, and why each one matters:
   cat deploy/migrations/README.md

   # ⚠️ ON_ERROR_STOP=1 is not decorative: without it psql exits 0 even when
   # every statement in the file failed (measured: 0 without, 3 with).
   for f in deploy/migrations/V0*.sql; do
     printf '%-56s' "$(basename "$f")"
     docker exec -i magbo-postgres psql -U magbo -d magbodb -v ON_ERROR_STOP=1 < "$f"        > /tmp/mig.log 2>&1 && echo OK || { echo FAILED; tail -3 /tmp/mig.log; break; }
   done
   ```

   Apply **V001 → V016, in order**, before considering the deployment done.
   `npm test -- tests/migrations.test.js` fails if a migration exists in
   `deploy/migrations/` and is not named in that README, if it has no rollback,
   or if the `denial_reason` CHECK has fallen behind the Java enum.

5. **Check health:**
   ```bash
   docker compose ps
   docker compose logs backend --tail 50
   ```

6. **Verify backend:**
   ```bash
   curl http://localhost:8080/api/auth/login \
     -X POST -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin1234"}'
   ```

## Operations

- **Stop:** `docker compose down`
- **Restart:** `docker compose restart backend`
- **Logs:** `docker compose logs -f backend`
- **Backup database:**
  ```bash
  docker exec magbo-postgres pg_dump -U magbo magbodb > backup_$(date +%Y%m%d).sql
  ```
- **Restore database:**
  ```bash
  cat backup_YYYYMMDD.sql | docker exec -i magbo-postgres psql -U magbo -d magbodb
  ```

## Security checklist before production

- [ ] Change default admin password (`admin/admin1234`) on first login
- [ ] Generate new `MAGBO_JWT_SECRET` (see comment in `.env.example`)
- [ ] Set `MAGBO_WEBHOOK_TOKEN` and configure the same token on the Hikvision terminal
- [ ] Restrict port 5432 to localhost only (already done in compose file)
- [ ] Set up firewall rules: allow 8080 only from Hikvision VLAN + admin LAN
- [ ] Configure HTTPS via reverse proxy (nginx/caddy) — current compose is HTTP only
- [ ] Schedule daily database backup (cron + `pg_dump`)
