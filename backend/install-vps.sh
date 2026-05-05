#!/usr/bin/env bash
# ============================================================
# STOKVA — Installation VPS / Linux (Ubuntu/Debian)
# by NETPROCESS
# ============================================================
# Détecte les prérequis, installe ce qui manque, configure
# PostgreSQL, déploie l'application en service systemd.
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()   { echo -e "${GREEN}[STOKVA]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC} $1"; }

# --- Vérifs root
if [ "$EUID" -ne 0 ]; then
    err "Ce script doit être exécuté en root (sudo)."
    exit 1
fi

APP_DIR="${APP_DIR:-/opt/stokva}"
APP_USER="${APP_USER:-stokva}"
DB_NAME="${DB_NAME:-stokva}"
DB_USER="${DB_USER:-stokva}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 16)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
SERVICE_PORT="${SERVICE_PORT:-3000}"

log "=== Installation STOKVA ==="
log "Répertoire    : $APP_DIR"
log "Utilisateur   : $APP_USER"
log "Base          : $DB_NAME"
log "Port HTTP     : $SERVICE_PORT"

# --- 1. Détection OS
. /etc/os-release
log "OS détecté : $PRETTY_NAME"

# --- 2. Installation des dépendances système
log "Mise à jour des paquets..."
apt-get update -qq

log "Installation Node.js, PostgreSQL, build tools..."
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
apt-get install -y postgresql postgresql-contrib build-essential python3 git nginx

# --- 3. Configuration PostgreSQL
log "Configuration PostgreSQL..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    sudo -u postgres createdb -O $DB_USER $DB_NAME

# --- 4. Utilisateur système
if ! id -u $APP_USER >/dev/null 2>&1; then
    log "Création utilisateur système $APP_USER..."
    useradd --system --create-home --shell /bin/bash $APP_USER
fi

# --- 5. Déploiement code
log "Déploiement dans $APP_DIR..."
mkdir -p $APP_DIR
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "$SCRIPT_DIR"/* $APP_DIR/ 2>/dev/null || true
chown -R $APP_USER:$APP_USER $APP_DIR

# --- 6. Fichier .env
log "Génération .env..."
cat > $APP_DIR/.env <<EOF
NODE_ENV=production
PORT=$SERVICE_PORT
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=12h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=*
WS_PATH=/ws
WEIGHBRIDGE_ENABLED=false
WEIGHBRIDGE_PORT=/dev/ttyUSB0
WEIGHBRIDGE_BAUDRATE=9600
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
LOG_LEVEL=combined
EOF
chmod 600 $APP_DIR/.env
chown $APP_USER:$APP_USER $APP_DIR/.env

# --- 7. Installation deps + migrate + seed
log "Installation des dépendances npm..."
cd $APP_DIR
sudo -u $APP_USER npm install --omit=dev --no-audit --no-fund

log "Application des migrations..."
sudo -u $APP_USER node scripts/migrate.js

log "Données initiales..."
sudo -u $APP_USER node scripts/seed.js

# --- 8. Service systemd
log "Création du service systemd..."
cat > /etc/systemd/system/stokva.service <<EOF
[Unit]
Description=STOKVA Backend (NETPROCESS)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/src/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable stokva
systemctl start stokva

# --- 9. Nginx reverse proxy (optionnel)
if [ ! -f /etc/nginx/sites-available/stokva ]; then
    log "Configuration nginx..."
    cat > /etc/nginx/sites-available/stokva <<EOF
server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://localhost:$SERVICE_PORT/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location /ws {
        proxy_pass http://localhost:$SERVICE_PORT/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }
    location /health {
        proxy_pass http://localhost:$SERVICE_PORT/health;
    }
    # Frontend statique : copier les fichiers HTML/JS dans /var/www/stokva
    location / {
        root /var/www/stokva;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
    ln -sf /etc/nginx/sites-available/stokva /etc/nginx/sites-enabled/stokva
    rm -f /etc/nginx/sites-enabled/default
    mkdir -p /var/www/stokva
    nginx -t && systemctl restart nginx
fi

# --- 10. Récapitulatif
echo ""
log "=========================================="
log "  Installation terminée avec succès !"
log "=========================================="
echo ""
echo "  Service       : systemctl status stokva"
echo "  Logs          : journalctl -u stokva -f"
echo "  Backend       : http://localhost:$SERVICE_PORT"
echo "  API Docs      : http://localhost:$SERVICE_PORT/api/docs"
echo "  Health        : http://localhost:$SERVICE_PORT/health"
echo ""
echo "  Identifiants par défaut :"
echo "    admin / admin   (à changer !)"
echo ""
echo "  Fichier .env    : $APP_DIR/.env"
echo "  Mot de passe DB : $DB_PASSWORD"
echo "  JWT secret      : $JWT_SECRET"
echo ""
warn "Conservez précieusement le mot de passe DB et le JWT secret."
warn "Frontend : copiez vos fichiers HTML/JS dans /var/www/stokva"
