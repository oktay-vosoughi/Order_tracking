#!/usr/bin/env bash
# ============================================================================
# Isolated platform test harness
# ----------------------------------------------------------------------------
# Spins up a COMPLETELY SEPARATE environment to exercise the configurable
# platform without touching the real app:
#   - Database : order_tracking_platform_test   (real app uses: order_Tracking)
#   - API port : 4100                            (real app uses: 5000)
#   - Frontend : 3010 (optional --frontend)      (real app uses: 3002)
#
# The real order_Tracking database is only ever read (structure is NOT copied
# from it — the test DB is built from the canonical dump + migrations so it has
# the current intended schema). Nothing in the real app is modified.
#
# Usage:
#   scripts/test-isolated-platform.sh           # (re)build DB + start API on :4100
#   scripts/test-isolated-platform.sh --fresh   # drop & rebuild the test DB first
#   scripts/test-isolated-platform.sh --frontend# also start an isolated Vite UI on :3010
#   scripts/test-isolated-platform.sh --stop     # stop the isolated API/UI
#   scripts/test-isolated-platform.sh --smoke    # rebuild, start, run API smoke tests, stop
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

MYSQL_BIN="/usr/local/mysql/bin/mysql"
[ -x "$MYSQL_BIN" ] || MYSQL_BIN="$(command -v mysql)"

ENV_FILE="server/.env.test"
TEST_DB="order_tracking_platform_test"
API_PORT=4100
UI_PORT=3010
API_PID_FILE=".platform-test-api.pid"
UI_PID_FILE=".platform-test-ui.pid"

# Load DB creds from the gitignored env file.
set -a; . "$ENV_FILE"; set +a
export MYSQL_PWD="$MYSQL_PASSWORD"

myq() { "$MYSQL_BIN" -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" "$@"; }
mydb() { myq "$TEST_DB" "$@"; }

# SOME migration/dump files contain a hardcoded `USE \`order_Tracking\`;` and
# `SET @db = 'order_Tracking'`. Piped raw, that USE statement hijacks the
# connection to the REAL database. load_sql() strips/rewrites those so every
# statement is forced onto the isolated test DB — guaranteeing isolation.
load_sql() {
  local file="$1"
  sed -E \
    -e "/^[[:space:]]*USE[[:space:]]+\`?[oO]rder_[tT]racking\`?[[:space:]]*;/d" \
    -e "s/'order_[tT]racking'/'${TEST_DB}'/g" \
    -e "s/\`order_[tT]racking\`/\`${TEST_DB}\`/g" \
    "$file" | mydb
}

banner() { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }

stop_all() {
  for f in "$API_PID_FILE" "$UI_PID_FILE"; do
    if [ -f "$f" ]; then
      kill "$(cat "$f")" 2>/dev/null || true
      rm -f "$f"
    fi
  done
  echo "Stopped isolated API/UI (if running)."
}

build_db() {
  banner "Building isolated database: $TEST_DB"
  if [ "${FRESH:-0}" = "1" ]; then
    myq -e "DROP DATABASE IF EXISTS \`$TEST_DB\`;"
    echo "Dropped existing $TEST_DB."
  fi
  myq -e "CREATE DATABASE IF NOT EXISTS \`$TEST_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

  # 1) canonical base schema (structure + whatever sample rows the dump carries)
  echo "Loading base schema from full dump…"
  load_sql server/database/order_tracking_full_dump.sql

  # 2) migration chain that predates the CEP DEPO column additions
  for f in add_price_tracking add_ideal_max_stock add_department_and_uploads \
           add_cep_depo_system add_ordered_date add_receipt_fields_to_purchases \
           add_receivedBy_to_usage 2026_06_15_rename_molecular_departments; do
    [ -f "server/migrations/$f.sql" ] || continue
    err=$(load_sql "server/migrations/$f.sql" 2>&1 | grep -i 'error' | grep -vi 'duplicate' | head -1 || true)
    printf '  migration %-40s %s\n' "$f" "${err:-ok}"
  done
  echo "Base + CEP schema loaded (platform tables are created by the server on boot)."
}

start_api() {
  stop_all
  banner "Starting isolated API on port $API_PORT (DB: $TEST_DB)"
  # server/index.js reads server/.env; we pass the test env explicitly instead so
  # the real server/.env is never required or touched.
  ( set -a; . "$ENV_FILE"; set +a
    node server/index.js ) > .platform-test-api.log 2>&1 &
  echo $! > "$API_PID_FILE"

  for i in $(seq 1 20); do
    sleep 0.5
    if curl -sf "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then
      echo "API healthy at http://127.0.0.1:$API_PORT/api/health"
      # shared-cep-depo migration needs columns the server adds on boot; run it now.
      err=$(load_sql server/migrations/2026-07-01-shared-cep-depo.sql 2>&1 | grep -i 'error' | grep -vi 'duplicate' | head -1 || true)
      printf '  migration %-40s %s\n' "2026-07-01-shared-cep-depo" "${err:-ok}"
      grep -E 'platform|ensureCepDepo|Connected|listening' .platform-test-api.log | sed 's/^/  /'
      return 0
    fi
  done
  echo "API failed to start. Last log lines:"; tail -20 .platform-test-api.log; exit 1
}

start_ui() {
  banner "Starting isolated frontend on port $UI_PORT (proxying to :$API_PORT)"
  VITE_PROXY_TARGET="http://127.0.0.1:$API_PORT" \
    ./node_modules/.bin/vite --port "$UI_PORT" --strictPort > .platform-test-ui.log 2>&1 &
  echo $! > "$UI_PID_FILE"
  sleep 2
  echo "Frontend (isolated) → http://localhost:$UI_PORT"
}

smoke() {
  banner "API smoke tests"
  local B="http://127.0.0.1:$API_PORT/api"
  # Bootstrap only works on an empty user set; ignore if an admin already exists.
  curl -s -X POST "$B/auth/bootstrap" -H 'Content-Type: application/json' \
    -d '{"username":"platformadmin","password":"platform123"}' >/dev/null || true
  local TOKEN
  TOKEN=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
    -d '{"username":"platformadmin","password":"platform123"}' \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
  if [ -z "$TOKEN" ]; then echo "Login failed (an admin may already exist with a different password)."; return 1; fi
  local A="Authorization: Bearer $TOKEN"

  echo "1) /api/config:"
  curl -s "$B/config" -H "$A" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('   company:',j.company.name);console.log('   modules:',j.modules.map(m=>m.key+(m.enabled?'':'(off)')).join(' '));console.log('   permissions:',j.permissions.length,'| roles:',j.roles.map(r=>r.key).join(','))})"

  echo "2) disable cep_depo → route blocked:"
  curl -s -X PUT "$B/admin/modules/cep_depo" -H "$A" -H 'Content-Type: application/json' -d '{"enabled":false}' >/dev/null
  echo "   $(curl -s "$B/cep-depo/balances" -H "$A")"
  curl -s -X PUT "$B/admin/modules/cep_depo" -H "$A" -H 'Content-Type: application/json' -d '{"enabled":true}' >/dev/null

  echo "3) create custom role + user, verify enforcement:"
  curl -s -X POST "$B/admin/roles" -H "$A" -H 'Content-Type: application/json' \
    -d '{"key":"DEPOCU","name":"Depo Sorumlusu","permissions":["inventory.view","distributions.create"]}' >/dev/null || true
  curl -s -X POST "$B/users" -H "$A" -H 'Content-Type: application/json' \
    -d '{"username":"depocu_test","password":"depocu123","role":"DEPOCU"}' >/dev/null || true
  local DT
  DT=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' -d '{"username":"depocu_test","password":"depocu123"}' \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
  echo "   DEPOCU approve (expect FORBIDDEN): $(curl -s -X POST "$B/purchases/x/approve" -H "Authorization: Bearer $DT" -H 'Content-Type: application/json' -d '{}')"
  echo "   DEPOCU read stock (expect items): $(curl -s "$B/unified-stock" -H "Authorization: Bearer $DT" | head -c 40)"

  echo "4) terminology override:"
  curl -s -X PUT "$B/admin/terminology" -H "$A" -H 'Content-Type: application/json' -d '{"overrides":{"tab.cep_depo":"Birim Deposu"}}' >/dev/null
  curl -s "$B/config" -H "$A" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('   tab.cep_depo →',JSON.parse(d).terminology['tab.cep_depo']))"
  echo "Smoke tests complete."
}

# ------------------------------------------------------------------ dispatch
case "${1:-}" in
  --stop) stop_all; exit 0 ;;
  --fresh) FRESH=1; build_db; start_api ;;
  --frontend) build_db; start_api; start_ui ;;
  --smoke) FRESH=1; build_db; start_api; smoke; stop_all ;;
  "" ) build_db; start_api ;;
  *) echo "Unknown option: $1"; grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//' | head -25; exit 1 ;;
esac

banner "Ready"
cat <<EOF
Isolated API : http://127.0.0.1:$API_PORT/api   (DB: $TEST_DB)
Logs         : $ROOT/.platform-test-api.log
Stop         : scripts/test-isolated-platform.sh --stop

Your real app is untouched (DB order_Tracking, API :5000, UI :3002).
EOF
