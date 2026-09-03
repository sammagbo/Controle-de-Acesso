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

   ⚠️ **`ADMIN_PIN` and `MAGBO_ADMIN_PASSWORD` are mandatory.** `docker compose
   up` **refuses to start** until both have a value — they ship empty in
   `.env.example` on purpose. Neither has a fallback, because an empty value
   fails silently in both cases: an empty PIN makes the Admin Panel
   unreachable, and an empty admin password creates, on a *fresh* database, an
   initial administrator **with no password**.

   ⚠️ `MAGBO_ADMIN_PASSWORD` only takes effect on a database that has no
   `admin` user yet — `AdminBootstrap` returns on its first line if one exists.
   To change the password of an existing admin, use the operators screen;
   editing this variable and recreating the container changes nothing.

   ⚠️ **Do not remove `TZ` from `docker-compose.yml`.** Both images boot in UTC
   and the JVM adopts the container zone, so every `LocalDateTime.now()` in the
   backend is written **three hours ahead** of the passages, which
   `EventTimeResolver` writes in `America/Sao_Paulo`. Measured on 2026-08-25
   through a production write path: 17:27 local, stored as 20:27. Where a
   `now()` is *compared* against a passage time, that gap stops being a crooked
   timestamp and becomes a wrong rule.

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

   Apply **V001 → V027, in order**, before considering the deployment done.
   Measured on 2026-09-03: `ls deploy/migrations/V0*.sql | wc -l` → **27**
   (V001 through V027), and all 27 are applied in production. This line read
   «V001 → V016» until then — eleven migrations short.

   ⚠️ **Two of the eleven fail in a way this machine cannot show you.**
   `V022` widens the `access_attempts.denial_reason` CHECK: skip it and the
   INSERT that records a refused meal fails **only on the VM** — never on the
   dev PC, whose `ddl-auto` leaves the existing CHECK alone, and never in the
   tests, where H2 recreates the table from the Java enum. `V027` creates
   `licence_clock`, and it must be applied **before the backend starts**:
   `ddl-auto` would happily create that table itself **without** its
   `CHECK (id = 1)`, and it never repairs a constraint afterwards (the
   V017/V020 lesson). V027 carries an idempotent block that catches that one
   case, but the order stands: **migration first, backend second.**

   ⚠️ **This step is numbered after `docker compose up -d`, and on a first
   install that order is wrong for V022 and V027.** On an empty database, run
   `docker compose up -d postgres` alone, apply the 27 migrations, and only
   then `docker compose up -d`. If the backend has already started, stop it
   (`docker compose stop backend`), apply, and start it again — V022's own
   header says the failure it prevents « part le jour même, au premier
   service », not weeks later.

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

- [ ] Set `ADMIN_PIN` (**not** `1234`) and `MAGBO_ADMIN_PASSWORD` in `.env` — compose will not start without them
- [ ] Change default admin password (`admin/admin1234`) on first login
- [ ] Confirm the containers run in school time: `docker exec magbo-backend date` must show `-0300`, not `+0000`
- [ ] Generate new `MAGBO_JWT_SECRET` (see comment in `.env.example`)
- [ ] Set `MAGBO_WEBHOOK_TOKEN` and configure the same token on the Hikvision terminal
- [ ] Restrict port 5432 to localhost only (already done in compose file)
- [ ] Set up firewall rules: allow 8080 only from Hikvision VLAN + admin LAN
- [ ] Configure HTTPS via reverse proxy (nginx/caddy) — current compose is HTTP only
- [ ] Schedule daily database backup (cron + `pg_dump`)
