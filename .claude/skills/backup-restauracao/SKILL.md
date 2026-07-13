# Skill: Backup e restauração (Postgres)

Backup (PC):
```powershell
docker exec magbo-postgres pg_dump -U magbo -d magbodb -F c -f /tmp/magbo.dump
docker cp magbo-postgres:/tmp/magbo.dump .\backups\magbo-$(Get-Date -Format yyyyMMdd-HHmm).dump
```
Restore:
```powershell
docker cp .\backups\<arq>.dump magbo-postgres:/tmp/r.dump
docker exec magbo-postgres pg_restore -U magbo -d magbodb --clean --if-exists /tmp/r.dump
```
Na VM: `deploy/backup.sh` (cron sugerido diário). Regras: backup ANTES de bateria de testes/migração; dump pós-correções de constraint; nunca commitar dumps.
