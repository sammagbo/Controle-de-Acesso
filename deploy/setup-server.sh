#!/bin/bash
# ============================================================
# MAGBO Access Control — Server Setup Script (Ubuntu 22.04 LTS)
# ============================================================
# Usage: sudo bash setup-server.sh
#
# Prerequisites:
#   - Ubuntu Server 22.04 LTS with internet access
#   - Root or sudo privileges
#   - magbo-access-1.0.0.jar available in current directory
#
# This script:
#   1. Installs Java 17 and PostgreSQL 15
#   2. Creates database and user
#   3. Deploys the JAR to /opt/magbo/
#   4. Creates systemd service
#   5. Configures firewall
#   6. Sets up log directory
# ============================================================

set -euo pipefail

# ─── Configuration ───
DB_NAME="magbo_db"
DB_USER="magbo"
DB_PASS="${DB_PASSWORD:-$(openssl rand -base64 24)}"
APP_DIR="/opt/magbo"
LOG_DIR="/var/log/magbo"
BACKUP_DIR="/var/backups/magbo"
JAR_FILE="magbo-access-1.0.0.jar"
SERVICE_USER="magbo"

echo "============================================"
echo "  MAGBO Access Control — Server Setup"
echo "============================================"
echo ""

# ─── 1. System Update ───
echo "[1/10] Updating system packages..."
apt update && apt upgrade -y

# ─── 2. Install Java 17 ───
echo "[2/10] Installing OpenJDK 17..."
apt install -y openjdk-17-jdk
java -version

# ─── 3. Install PostgreSQL 15 ───
echo "[3/10] Installing PostgreSQL 15..."
apt install -y postgresql-15
systemctl enable --now postgresql

# ─── 4. Create Database and User ───
echo "[4/10] Creating database '${DB_NAME}' and user '${DB_USER}'..."
sudo -u postgres psql <<EOF
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF
echo "  ✅ Database created. Password: ${DB_PASS}"
echo "  ⚠️  SAVE THIS PASSWORD SECURELY!"

# ─── 5. Create Service User ───
echo "[5/10] Creating service user '${SERVICE_USER}'..."
if ! id -u ${SERVICE_USER} &>/dev/null; then
    useradd -r -s /bin/false ${SERVICE_USER}
fi

# ─── 6. Deploy JAR ───
echo "[6/10] Deploying application..."
mkdir -p ${APP_DIR} ${LOG_DIR} ${BACKUP_DIR}

if [ -f "${JAR_FILE}" ]; then
    cp ${JAR_FILE} ${APP_DIR}/
else
    echo "  ⚠️  JAR file '${JAR_FILE}' not found in current directory."
    echo "  Copy it manually to ${APP_DIR}/ before starting the service."
fi

# Create production properties
cat > ${APP_DIR}/application-prod.properties <<PROPS
spring.datasource.url=jdbc:postgresql://localhost:5432/${DB_NAME}
spring.datasource.username=${DB_USER}
spring.datasource.password=${DB_PASS}
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=false
spring.sql.init.mode=never
server.port=8080
server.address=0.0.0.0
logging.file.name=${LOG_DIR}/application.log
admin.pin=\${ADMIN_PIN:1234}
magbo.webhook.token=\${MAGBO_WEBHOOK_TOKEN:}
PROPS

chown -R ${SERVICE_USER}:${SERVICE_USER} ${APP_DIR} ${LOG_DIR} ${BACKUP_DIR}

# ─── 7. Create systemd Service ───
echo "[7/10] Creating systemd service..."
cat > /etc/systemd/system/magbo.service <<SERVICE
[Unit]
Description=MAGBO Access Control Backend
After=network.target postgresql.service

[Service]
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/java -jar -Dspring.profiles.active=prod -Dspring.config.additional-location=file:${APP_DIR}/application-prod.properties ${APP_DIR}/${JAR_FILE}
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

Environment=ADMIN_PIN=1234
Environment=MAGBO_WEBHOOK_TOKEN=
Environment=LOG_PATH=${LOG_DIR}

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable magbo

# ─── 8. Configure Firewall ───
echo "[8/10] Configuring firewall..."
ufw allow 8080/tcp comment "MAGBO Access Control API"
ufw allow 22/tcp comment "SSH"
echo "y" | ufw enable || true
ufw status

# ─── 9. Install backup cron ───
echo "[9/10] Setting up nightly backup (03:00)..."
cp "$(dirname "$0")/backup.sh" ${APP_DIR}/backup.sh 2>/dev/null || echo "  ⚠️  backup.sh not found, copy manually to ${APP_DIR}/"
chmod +x ${APP_DIR}/backup.sh 2>/dev/null || true
(crontab -l 2>/dev/null; echo "0 3 * * * ${APP_DIR}/backup.sh") | sort -u | crontab -

# ─── 10. Start Service ───
echo "[10/10] Starting MAGBO service..."
systemctl start magbo
sleep 3
systemctl status magbo --no-pager

echo ""
echo "============================================"
echo "  ✅ Setup Complete!"
echo "============================================"
echo ""
echo "  Backend URL:  http://$(hostname -I | awk '{print $1}'):8080"
echo "  Health Check: curl http://localhost:8080/api/health"
echo "  Logs:         sudo tail -f ${LOG_DIR}/application.log"
echo "  Service:      sudo systemctl status magbo"
echo ""
echo "  Database:"
echo "    Name:     ${DB_NAME}"
echo "    User:     ${DB_USER}"
echo "    Password: ${DB_PASS}"
echo ""
echo "  ⚠️  Save the database password securely!"
echo "  ⚠️  Update ADMIN_PIN and MAGBO_WEBHOOK_TOKEN in"
echo "      /etc/systemd/system/magbo.service"
echo "============================================"
