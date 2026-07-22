# Local Dev & Run Guide — Order Tracking / Configurable LIMS Platform

> One-page reference for running everything locally and shipping to live.
> Repo path: `~/Documents/Order_tracking/Order_tracking`

---

## TL;DR — run the app

```bash
cd ~/Documents/Order_tracking/Order_tracking

npm run server     # Terminal 1 → backend API on http://localhost:4000
npm run dev        # Terminal 2 → frontend on   http://localhost:3002 (auto-opens)
```

Open **http://localhost:3002**, log in with an ADMIN account (`admin` or `Oktay`).
Stop each with `Ctrl-C`.

---

## The three environments (don't mix them up)

| Environment | How to run | Branch | Database | API port | UI port |
|---|---|---|---|---|---|
| **New configurable app** (dev) | `npm run server` + `npm run dev` | `feature/general-configurable-lims-platform` | `order_Tracking` | 4000 | 3002 |
| **Original app** (pre-platform) | `git checkout main` then the same 2 cmds | `main` | `order_Tracking` | 4000* | 3002 |
| **Isolated test sandbox** (throwaway) | `scripts/test-isolated-platform.sh --frontend` | current | `order_tracking_platform_test` | 4100 | 3010 |

\* the `main` frontend is hardcoded to proxy `:5000` — see “Port gotcha”.

**Key idea:** the new branch, with default settings, behaves **identically** to the original
app (same login, tabs, roles) plus an extra **Ayarlar** (Settings) tab. The only truly
disposable “test” env is the sandbox, which uses a separate database and never touches
your real data.

---

## 1. New configurable app (your main dev target)

```bash
git checkout feature/general-configurable-lims-platform
npm run server     # :4000
npm run dev        # :3002
```

- Uses `server/.env` → DB `order_Tracking`, `PORT=4000`.
- On boot it auto-creates the platform tables (`companies`, `roles`, `role_permissions`,
  `company_settings`, `company_modules`, `departments`) — idempotent, safe.
- Log in as ADMIN → **Ayarlar** tab to configure modules, roles/permissions, terminology,
  form fields, departments, and companies.

## 2. Original app (`main` branch)

```bash
git checkout main
npm run server
npm run dev
git checkout feature/general-configurable-lims-platform   # to come back
```

- Same DB (`order_Tracking`); the extra platform tables are just ignored by old code —
  no breakage, no data loss.
- All feature-branch work is committed & pushed, and `server/.env` is untracked, so
  switching branches is safe.

## 3. Isolated test sandbox (experiment without risk)

```bash
scripts/test-isolated-platform.sh --smoke      # build + auto API tests + teardown
scripts/test-isolated-platform.sh --fresh      # build + start API on :4100
scripts/test-isolated-platform.sh --frontend   # also start UI on :3010
scripts/test-isolated-platform.sh --stop        # stop it
```

- Separate DB `order_tracking_platform_test`; **never** touches `order_Tracking`.
- Credentials come from `server/.env.test` (gitignored).

---

## Port gotcha (macOS)

- **Port 5000 is taken by macOS AirPlay Receiver.** That's why the backend uses **4000**.
- The `feature` branch is already aligned (backend 4000, Vite proxies to 4000).
- The `main` branch’s `vite.config.js` still proxies to `:5000`. To run `main`, either:
  - turn **off** AirPlay Receiver (System Settings → General → AirDrop & Handoff), then set
    `PORT=5000` in `server/.env`; **or**
  - keep backend on 4000 and change the one line in `vite.config.js` to
    `target: 'http://localhost:4000'` (local edit, don't commit).

---

## Database facts

- Local MySQL 9.4 on `127.0.0.1:3306`. **Root password lives in `server/.env`** (gitignored —
  not stored in this file for security).
- App DB: **`order_Tracking`** (dev/seed data: 0 items, 0 purchases, seed users).
- Other databases on this server (`hg37`, `medigen`, `medipol`, …) belong to other projects —
  **don't touch them.**
- Two seed users have **deprecated roles** (no permissions until reassigned):
  `Nilgun` = `LAB_MANAGER`, `Mehtap` = `PROCUREMENT`. Fix them in the **Kullanıcılar** tab.

---

## Going live (deploy checklist)

On the live server:

1. `git pull` the branch, `npm install`.
2. Create `server/.env` with **live** DB creds, plus:
   ```env
   NODE_ENV=production
   JWT_SECRET=<strong unique random value>   # required in prod or the server refuses to start
   CORS_ORIGIN=https://your-domain
   ```
3. `npm run build` → produces `dist/`.
4. `npm run server` → in production the same Express process serves **both** the API and the
   built frontend (no Vite), one process/port behind your reverse proxy.
5. Platform tables auto-create on the live DB on first boot (idempotent).
6. Multi-company **data** isolation (`server/migrations/2026-07-05-multi-company-data-scope.sql`)
   is **optional & manual** — only run it (with a backup) if you onboard a second company that
   needs separate data.

---

## Handy commands

```bash
git branch                       # which branch am I on
git checkout main                # original app
git checkout feature/general-configurable-lims-platform   # new platform app
git status -sb                   # local vs remote sync
git push                         # publish committed work to GitHub

npm run build                    # production build (dist/)
node --test server/platform/configService.test.cjs   # platform unit tests

lsof -nP -iTCP:4000 -sTCP:LISTEN # what's using port 4000
```

---

## Files worth knowing

| File | What |
|---|---|
| `server/.env` | Local backend config + DB creds (gitignored) |
| `server/.env.test` | Isolated sandbox config (gitignored) |
| `scripts/test-isolated-platform.sh` | Isolated test env launcher |
| `server/platform/` | Config engine: registry, schema bootstrap, config service, admin routes |
| `src/platformConfig.js` | Frontend config helpers (`can`, `isModuleEnabled`, `t`) |
| `src/SettingsPanel.jsx` | The **Ayarlar** admin UI |
| `docs/13-configurable-platform-design.md` | Architecture & decisions |
| `updates/UPDATE_2026-07-05_configurable_platform.md` | Full change log |
