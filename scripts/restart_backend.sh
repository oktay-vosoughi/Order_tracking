#!/usr/bin/env bash
# Helper script to restart the backend API service and inspect logs via journalctl
set -euo pipefail

BACKEND_SERVICE="${BACKEND_SERVICE:-order-tracking-api}"
JOURNAL_UNIT="${JOURNAL_UNIT:-$BACKEND_SERVICE}"
TAIL_LINES="${TAIL_LINES:-200}"
FOLLOW_LOGS="${FOLLOW_LOGS:-1}"

log() {
  printf '[backend-restart] %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    exit 1
  fi
}

main() {
  require_cmd systemctl
  require_cmd journalctl

  log "Reloading systemd units (in case service files changed)..."
  sudo systemctl daemon-reload

  log "Restarting ${BACKEND_SERVICE}..."
  sudo systemctl restart "$BACKEND_SERVICE"

  log "Current status for ${BACKEND_SERVICE}:"
  sudo systemctl status "$BACKEND_SERVICE" --no-pager || true

  log "Recent logs for ${JOURNAL_UNIT} (last ${TAIL_LINES} lines):"
  if [[ "$FOLLOW_LOGS" == "1" ]]; then
    log "Following logs. Press Ctrl+C to stop."
    sudo journalctl -u "$JOURNAL_UNIT" -n "$TAIL_LINES" -f
  else
    sudo journalctl -u "$JOURNAL_UNIT" -n "$TAIL_LINES" --no-pager
  fi
}

trap 'log "Interrupted"; exit 1' INT

main "$@"
