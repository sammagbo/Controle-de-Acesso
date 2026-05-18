# MAGBO Access Control — Production Deployment

This directory contains everything needed to deploy MAGBO Access Control
on a production VM using Docker.

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

4. **Check health:**
   ```bash
   docker compose ps
   docker compose logs backend --tail 50
   ```

5. **Verify backend:**
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
