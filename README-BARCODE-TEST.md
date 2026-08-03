# Barcode branch — isolated phone-camera test harness

This git worktree runs the `feature/barcode-receiving` branch **completely
isolated** from your main dev app, so you can scan real barcodes with your
phone camera without touching production data.

| Piece | Value |
|-------|-------|
| Branch | `feature/barcode-receiving-test` (tracks `origin/feature/barcode-receiving`) |
| Database | `order_tracking_barcode_test` (fresh, schema-only, **no real data**) |
| Backend port | `4001` |
| Frontend port | `3003` |
| Main dev app | untouched on `4000` / `3002` — both can run at the same time |

## Why a tunnel and not just the LAN IP

The barcode scanner uses the browser camera (`getUserMedia`). Browsers only
allow the camera in a **secure context** — HTTPS, or `localhost`. A phone
hitting `http://<laptop-ip>:3003` over plain HTTP gets **no camera**.
The Cloudflare quick-tunnel gives a real `https://…trycloudflare.com` URL
(trusted cert, zero phone setup), so the camera is allowed.

## Run it

```bash
cd /Users/oktay.vav/Documents/Order_tracking/barcode-test
./start-barcode-test.sh
```

This starts backend + Vite + the tunnel. Watch the output for a line like:

```
https://random-words-1234.trycloudflare.com
```

> **Give the tunnel ~30–40s** after it prints the URL. A fresh quick-tunnel
> takes a moment to propagate at Cloudflare's edge — the first hits may fail
> before it goes live (this is normal, cloudflared even says so in its output).

1. **On the laptop first:** open http://localhost:3003 — since the DB is empty
   the app will prompt you to create the first **admin** user. Do that once.
2. **On the phone:** open the `https://…trycloudflare.com` URL, log in with the
   admin you just made, go to the barcode / receiving screen, tap the camera
   button and scan. The scan hits your laptop's backend + test DB.

Stop everything with `Ctrl-C`.

> The tunnel URL is **random on every run**. Restart = new URL. That's fine for
> testing. (If you want a stable URL, a named Cloudflare tunnel needs a free
> Cloudflare account + a domain — ask and I'll set that up instead.)

## Logs / troubleshooting

- Backend log: `/tmp/barcode-backend.log`
- Vite log: `/tmp/barcode-vite.log`
- Camera says "Kamera açılamadı": make sure you opened the **https** tunnel URL
  on the phone (not an `http://…:3003` address), and grant the camera permission
  when the browser asks. iOS Safari and Android Chrome both work.
- "Host not allowed" blank page: the tunnel domain must be `*.trycloudflare.com`
  (already whitelisted in `vite.config.js` → `allowedHosts`). A different tunnel
  provider needs its domain added there.
- USB/Bluetooth hand-scanner also works — it types like a keyboard into the
  scan field; no camera / HTTPS needed for that path.

## Reset the test database

```bash
MYSQL=/usr/local/mysql-9.4.0-macos15-arm64/bin/mysql
"$MYSQL" -h127.0.0.1 -uroot -p -e "DROP DATABASE order_tracking_barcode_test;"
# then re-run the create + dump load + migration (see below)
```

Recreate from scratch:
```bash
DB=order_tracking_barcode_test
"$MYSQL" -h127.0.0.1 -uroot -p -e "CREATE DATABASE \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
"$MYSQL" -h127.0.0.1 -uroot -p "$DB" < server/database/order_tracking_full_dump.sql
node server/migrations/run-2026-07-07-item-barcodes.cjs   # from this worktree (uses server/.env -> test DB)
```

## Tear down the whole harness when done

```bash
cd /Users/oktay.vav/Documents/Order_tracking/Order_tracking
git worktree remove ../barcode-test          # removes the worktree
git branch -D feature/barcode-receiving-test  # optional: drop the local branch
# optional: drop the test DB (command above)
```
