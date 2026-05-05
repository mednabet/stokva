#!/usr/bin/env bash
# ============================================================
# STOKVA — Installation Docker
# by NETPROCESS
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[STOKVA]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v docker >/dev/null 2>&1; then
    err "Docker non installé. Voir https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose v2 requis (commande 'docker compose')."
    exit 1
fi

log "=== Installation STOKVA via Docker ==="

# .env in docker/ folder
ENV_FILE="$SCRIPT_DIR/docker/.env"

if [ ! -f "$ENV_FILE" ]; then
    log "Génération du fichier .env Docker..."
    DB_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64)
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64)
    cat > "$ENV_FILE" <<EOF
DB_NAME=stokva
DB_USER=stokva
DB_PASSWORD=$DB_PASSWORD
DB_PORT_PUBLIC=5432
JWT_SECRET=$JWT_SECRET
PORT=3000
FRONTEND_PORT=8080
CORS_ORIGIN=*
WEIGHBRIDGE_ENABLED=false
EOF
    log "Fichier $ENV_FILE créé."
else
    log "Fichier $ENV_FILE déjà présent."
fi

cd "$SCRIPT_DIR/docker"

log "Build des images..."
docker compose build

log "Démarrage des conteneurs..."
docker compose up -d

log "Attente démarrage backend..."
sleep 5

log "État des conteneurs :"
docker compose ps

# Récupération du mot de passe DB pour affichage
DB_PWD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2)

echo ""
log "=========================================="
log "  Installation Docker terminée !"
log "=========================================="
echo ""
echo "  Backend       : http://localhost:3000"
echo "  Frontend      : http://localhost:8080"
echo "  API Docs      : http://localhost:3000/api/docs"
echo "  Health        : http://localhost:3000/health"
echo ""
echo "  Identifiants par défaut : admin / admin"
echo ""
echo "  Logs backend  : docker compose -f $SCRIPT_DIR/docker/docker-compose.yml logs -f backend"
echo "  Stop          : docker compose -f $SCRIPT_DIR/docker/docker-compose.yml down"
echo "  Reset complet : docker compose down -v   (supprime les données !)"
echo ""
echo "  Fichier env   : $ENV_FILE"
echo "  Mot de passe DB : $DB_PWD"
