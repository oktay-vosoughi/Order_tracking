#!/usr/bin/env bash
# Unified frontend deployment helper for PAM360 server
set -euo pipefail

# You can override these with environment variables when invoking the script, e.g.
# REPO_DIR=/opt/Order_tracking APACHE_ROOT=/var/www/html ./deploy_frontend.sh
REPO_DIR="${REPO_DIR:-/home/genetikuser/Order_tracking}"
APACHE_ROOT="${APACHE_ROOT:-/var/www/gtmlims}"
BACKEND_SERVICE="${BACKEND_SERVICE:-order-tracking-api}"
APACHE_SERVICE="${APACHE_SERVICE:-apache2}"
NODE_ENV="${NODE_ENV:-production}"

log() {
  printf '[deploy] %s\n' "$1"
}

main() {
  log "Working directory: ${REPO_DIR}"
  cd "$REPO_DIR"

  log "Pulling latest code..."
  git fetch origin
  git pull --rebase origin main

  log "Installing frontend dependencies..."
  npm install

  log "Building frontend for ${NODE_ENV}..."
  npm run build

  log "Syncing dist/ to ${APACHE_ROOT} ..."
  sudo mkdir -p "$APACHE_ROOT"
  sudo rsync -a --delete dist/ "$APACHE_ROOT"/

  log "Restarting backend service (${BACKEND_SERVICE})..."
  sudo systemctl restart "$BACKEND_SERVICE"

  log "Reloading Apache (${APACHE_SERVICE})..."
  sudo systemctl reload "$APACHE_SERVICE"

  log "Deployment completed successfully."
}

main "$@"
