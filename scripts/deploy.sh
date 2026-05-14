#!/bin/bash
# =============================================================
# Order Tracking - Deploy Script
# Pulls latest code, rebuilds frontend, copies to Apache,
# restarts backend (PM2), reloads Apache.
#
# Usage (on the server):
#   ~/Order_tracking/scripts/deploy.sh         # normal deploy
#   ~/Order_tracking/scripts/deploy.sh y       # also run DB migrations
# =============================================================

set -e   # Exit immediately on any error

PROJECT_DIR="${PROJECT_DIR:-$HOME/Order_tracking}"
APACHE_ROOT="${APACHE_ROOT:-/var/www/gtmlims}"
PM2_APP_NAME="${PM2_APP_NAME:-order-tracking}"
APACHE_SERVICE="${APACHE_SERVICE:-apache2}"
HEALTH_URL="${HEALTH_URL:-https://gtmlims.medipol.edu.tr/api/health}"
DB_NAME="${DB_NAME:-order_Tracking}"
DB_USER="${DB_USER:-root}"

# Pass 'y' as first argument to run migrations without prompt
RUN_MIGRATIONS_ARG="${1:-}"

cd "$PROJECT_DIR"

echo ""
echo "========================================"
echo " Order Tracking - Deploy"
echo " $(date)"
echo "========================================"

# ---------- 1. Git pull ----------
echo ""
echo "==> [1/7] Pulling latest code from GitHub..."
git pull

# ---------- 2. Install dependencies ----------
echo ""
echo "==> [2/7] Installing npm dependencies..."
npm install --no-audit --no-fund

# ---------- 3. Run new database migrations (optional) ----------
echo ""
echo "==> [3/7] Database migrations"
if [[ "$RUN_MIGRATIONS_ARG" =~ ^[Yy]$ ]]; then
    RUN_MIGRATIONS="y"
else
    read -p "    Run DB migrations? (y/N): " RUN_MIGRATIONS
fi

if [[ "$RUN_MIGRATIONS" =~ ^[Yy]$ ]]; then
    read -sp "    MySQL password for ${DB_USER}: " MYSQL_PWD
    echo ""
    export MYSQL_PWD
    for f in "$PROJECT_DIR"/server/migrations/*.sql; do
        echo "    - Running $(basename "$f")"
        mysql -u "$DB_USER" "$DB_NAME" < "$f" || echo "      (some statements may have failed safely)"
    done
    unset MYSQL_PWD
else
    echo "    Skipped."
fi

# ---------- 4. Build frontend ----------
echo ""
echo "==> [4/7] Building frontend (vite)..."
rm -rf dist
npm run build

if [ ! -f "$PROJECT_DIR/dist/index.html" ]; then
    echo "ERROR: Build failed - dist/index.html not found"
    exit 1
fi

# ---------- 5. Deploy frontend to Apache ----------
echo ""
echo "==> [5/7] Copying dist/ to $APACHE_ROOT..."
sudo mkdir -p "$APACHE_ROOT"
sudo rm -rf "$APACHE_ROOT"/*
sudo cp -r "$PROJECT_DIR"/dist/* "$APACHE_ROOT"/
sudo chown -R www-data:www-data "$APACHE_ROOT"
sudo find "$APACHE_ROOT" -type d -exec chmod 755 {} \;
sudo find "$APACHE_ROOT" -type f -exec chmod 644 {} \;

# ---------- 6. Restart backend (PM2) ----------
echo ""
echo "==> [6/7] Restarting backend ($PM2_APP_NAME)..."
pm2 restart "$PM2_APP_NAME" --update-env
pm2 save

# ---------- 7. Reload Apache ----------
echo ""
echo "==> [7/7] Reloading Apache..."
sudo systemctl reload "$APACHE_SERVICE"

# ---------- Health check ----------
echo ""
echo "========================================"
echo " Health check"
echo "========================================"
sleep 2
HEALTH=$(curl -sk "$HEALTH_URL" || echo "FAIL")
echo "API health: $HEALTH"
echo ""
echo "PM2 status:"
pm2 list | grep "$PM2_APP_NAME" || true
echo ""
echo "Deploy complete!"
echo "Hard-refresh browser: Ctrl + Shift + R"
echo "========================================"
