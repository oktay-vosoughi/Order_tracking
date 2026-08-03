#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Isolated barcode-branch test harness.
#   backend  : http://localhost:4001   (DB: order_tracking_barcode_test)
#   frontend : http://localhost:3003   (Vite, proxies /api -> :4001)
#   tunnel   : https://<random>.trycloudflare.com  (open THIS on your phone)
#
# The Cloudflare quick-tunnel needs no account. The phone gets a real HTTPS
# URL, so the browser camera / barcode scanner is allowed to run.
# Ctrl-C stops all three processes.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

pids=()
cleanup() {
  echo ""
  echo "Stopping backend / vite / tunnel..."
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  lsof -ti:4001 2>/dev/null | xargs kill 2>/dev/null || true
  lsof -ti:3003 2>/dev/null | xargs kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> starting backend on :4001 (DB order_tracking_barcode_test)"
PORT=4001 node server/index.js > /tmp/barcode-backend.log 2>&1 &
pids+=($!)

echo "==> starting Vite on :3003"
npm run dev -- --host > /tmp/barcode-vite.log 2>&1 &
pids+=($!)

# Give Vite a moment to bind before the tunnel connects.
sleep 4

echo "==> opening Cloudflare tunnel to http://localhost:3003"
echo "    (watch below for the https://<...>.trycloudflare.com URL — open it on your phone)"
echo ""
cloudflared tunnel --url http://localhost:3003
