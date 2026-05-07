#!/bin/bash
# ============================================================
# MAGBO Access Control — PostgreSQL Backup Script
# ============================================================
# Usage: bash backup.sh
# Schedule: crontab -e → 0 3 * * * /opt/magbo/backup.sh
#
# Strategy: 3-2-1 (3 copies, 2 media, 1 offsite)
#   - Local compressed dump in BACKUP_DIR
#   - Retention: 30 days
#   - Optional rsync to remote/NAS
# ============================================================

set -euo pipefail

# ─── Configuration ───
DB_NAME="${DB_NAME:-magbo_db}"
DB_USER="${DB_USER:-magbo}"
BACKUP_DIR="${MAGBO_BACKUP_DIR:-/var/backups/magbo}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/magbo_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=30
LOG_FILE="${BACKUP_DIR}/backup.log"

# Optional: remote backup destination (set via env var)
REMOTE_DEST="${MAGBO_BACKUP_REMOTE:-}"

# ─── Create backup directory ───
mkdir -p "${BACKUP_DIR}"

# ─── Perform backup ───
echo "[$(date -Iseconds)] Starting backup of ${DB_NAME}..." | tee -a "${LOG_FILE}"

if pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_FILE}"; then
    SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "[$(date -Iseconds)] ✅ Backup complete: ${BACKUP_FILE} (${SIZE})" | tee -a "${LOG_FILE}"
else
    echo "[$(date -Iseconds)] ❌ Backup FAILED" | tee -a "${LOG_FILE}"
    exit 1
fi

# ─── Clean old backups ───
DELETED=$(find "${BACKUP_DIR}" -name "magbo_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo "[$(date -Iseconds)] Cleaned ${DELETED} backups older than ${RETENTION_DAYS} days" | tee -a "${LOG_FILE}"

# ─── Optional: sync to remote ───
if [ -n "${REMOTE_DEST}" ]; then
    echo "[$(date -Iseconds)] Syncing to remote: ${REMOTE_DEST}" | tee -a "${LOG_FILE}"
    rsync -av "${BACKUP_DIR}/" "${REMOTE_DEST}" >> "${LOG_FILE}" 2>&1 || \
        echo "[$(date -Iseconds)] ⚠️  Remote sync failed" | tee -a "${LOG_FILE}"
fi

# ─── List current backups ───
echo "" | tee -a "${LOG_FILE}"
echo "Current backups:" | tee -a "${LOG_FILE}"
ls -lh "${BACKUP_DIR}"/magbo_*.sql.gz 2>/dev/null | tail -5 | tee -a "${LOG_FILE}"
TOTAL=$(ls "${BACKUP_DIR}"/magbo_*.sql.gz 2>/dev/null | wc -l)
echo "Total: ${TOTAL} backups" | tee -a "${LOG_FILE}"
