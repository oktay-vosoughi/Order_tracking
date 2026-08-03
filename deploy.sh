#!/usr/bin/env bash
#
# deploy.sh — one-shot deploy for the GTMLIMS single-company (main) server.
#
# Safe by design:
#   1. Takes a full DB backup BEFORE anything else (so you can always roll back).
#   2. Pulls the latest code, installs deps, rebuilds the frontend.
#   3. Restarts the backend. All schema changes (item_barcodes, app_settings,
#      cep_depo_distributions.receivedConfirmedAt/By) are ADDITIVE and applied
#      idempotently by the server at boot — there is no destructive migration.
#
# Usage:  ./deploy.sh
# Run it from the repository root on the production server.
#
# Adjust the CONFIG block below to match this server, then commit your changes.

set -euo pipefail

# ---------------- CONFIG (edit for this server) ----------------
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # repo root (this script's dir)
BRANCH="main"                                             # branch to deploy
BACKUP_DIR="${APP_DIR}/backups"                           # where DB dumps are written
# How the backend process is managed. Options: "pm2" | "systemd" | "manual"
PROCESS_MANAGER="pm2"
PM2_NAME="gtmlims"                                        # pm2 app name (if PROCESS_MANAGER=pm2)
SYSTEMD_UNIT="gtmlims"                                    # systemd unit (if PROCESS_MANAGER=systemd)
# MySQL client binaries (leave as-is if on PATH)
MYSQL_BIN="$(command -v mysqldump || echo mysqldump)"
# ---------------------------------------------------------------

cd "$APP_DIR"
echo "==> Deploying from: $APP_DIR (branch: $BRANCH)"

# --- Load DB credentials from server/.env (never printed) ---
if [[ -f server/.env ]]; then
  # shellcheck disable=SC1091
  set -a; source server/.env; set +a
fi
DB_HOST="${MYSQL_HOST:-127.0.0.1}"
DB_PORT="${MYSQL_PORT:-3306}"
DB_USER="${MYSQL_USER:-root}"
DB_NAME="${MYSQL_DATABASE:-order_tracking}"

# --- 1. Backup the database FIRST ---
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${STAMP}.sql.gz"
echo "==> [1/5] Backing up ${DB_NAME} -> ${BACKUP_FILE}"
MYSQL_PWD="${MYSQL_PASSWORD:-}" "$MYSQL_BIN" \
  -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" \
  --single-transaction --routines --triggers "$DB_NAME" | gzip > "$BACKUP_FILE"
echo "    backup ok ($(du -h "$BACKUP_FILE" | cut -f1))"

# --- 2. Pull latest code ---
echo "==> [2/5] git fetch + checkout $BRANCH + pull"
git fetch --all --prune
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# --- 3. Install dependencies (adds @zxing/* for the barcode scanner) ---
echo "==> [3/5] npm install"
if [[ -f package-lock.json ]]; then npm ci || npm install; else npm install; fi

# --- 4. Build the frontend (nginx/static serves dist/) ---
echo "==> [4/5] npm run build"
npm run build

# --- 5. Restart the backend (schema self-heals at boot) ---
echo "==> [5/5] Restarting backend ($PROCESS_MANAGER)"
case "$PROCESS_MANAGER" in
  pm2)
    if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
      pm2 restart "$PM2_NAME" --update-env
    else
      echo "    pm2 app '$PM2_NAME' not found — starting it"
      pm2 start server/index.js --name "$PM2_NAME"
    fi
    pm2 save
    ;;
  systemd)
    sudo systemctl restart "$SYSTEMD_UNIT"
    sudo systemctl --no-pager status "$SYSTEMD_UNIT" | head -5
    ;;
  manual)
    echo "    PROCESS_MANAGER=manual — restart your 'node server/index.js' process now."
    ;;
  *)
    echo "    Unknown PROCESS_MANAGER='$PROCESS_MANAGER' — restart the backend manually."
    ;;
esac

echo "==> Done. Verify: barcode tabs appear only after enabling them in Ayarlar → Modüller."
echo "    Rollback DB if needed:  gunzip -c '$BACKUP_FILE' | mysql -h$DB_HOST -P$DB_PORT -u$DB_USER $DB_NAME"
