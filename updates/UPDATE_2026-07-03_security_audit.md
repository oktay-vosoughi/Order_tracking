## UPDATE_2026-07-03_security_audit

- **Summary:** Full end-to-end security + logic audit of the project, plus surgical fixes for the highest-impact backend authorization gaps, JWT/CORS/brute-force hardening, and frontend XSS / file-upload / date-display bugs. No new dependencies, no schema changes.

### Files touched
- `server/index.js` — JWT_SECRET fail-fast in production; CORS allowlist via `CORS_ORIGIN`; in-memory login brute-force throttle; role guards added to stock-mutating routes; password-length enforcement on bootstrap + create-user.
- `src/labUtils.js` — `isValidMSDSUrl` now restricts to http/https; new `isSafeAttachmentUrl` + `openAttachmentSafely` helpers.
- `src/App.jsx` — replaced two `document.write(<iframe src=...>)` XSS sinks with `openAttachmentSafely`; added file type/size validation on the receive-goods upload; fixed "Invalid Date" on mobile purchase cards (`requestDate` → `requestedAt` with guard); imported `openAttachmentSafely`.
- `src/LotInventory.jsx` — safe attachment open + upload validation; imported `openAttachmentSafely`.

### DB changes
- none

### Rollback SQL
- n/a (no migrations)

### Behavior changes worth noting
- **Production start now aborts** if `NODE_ENV=production` and `JWT_SECRET` is unset or equals the default. Ensure `JWT_SECRET` is set before deploying (the fail-fast only triggers when `NODE_ENV=production`; `server/.env` currently sets `development`).
- **CORS** is locked to `CORS_ORIGIN` (comma-separated) only when `NODE_ENV=production` AND `CORS_ORIGIN` is set; otherwise it stays permissive (dev unchanged).
- **Login throttle**: 10 failed attempts per IP per 15 min → HTTP 429. In-memory; resets on restart and is per-process (not a substitute for a real limiter behind multiple instances).
- **New role guards** — `POST /api/lots` and `PUT /api/lots/:id` now require `canReceiveGoods`; `POST /api/consume` and `POST /api/lot-adjustments` now require `canDistribute`. Previously any authenticated user (including OBSERVER / LAB_TECHNICIAN) could mutate main-depot stock.
- **Uploads** are limited to PNG/JPEG/GIF/WEBP/PDF and ≤4 MB client-side.
- **Attachments** open only if they are http(s) or `data:` image/PDF URLs; `data:text/html` / `javascript:` are refused.

### Test steps (manual)
1. `npm run build` → exits 0 (verified).
2. `node --test src/*.test.mjs server/*.test.cjs` → 11 pass (verified).
3. Log in as OBSERVER, call `POST /api/lots` → expect 403.
4. Log in as LAB_TECHNICIAN, call `POST /api/consume` → expect 403; CEP DEPO consume still works.
5. Attempt 11 bad logins from one IP within 15 min → 11th returns 429.
6. Upload a `.exe` in the receive form → blocked with alert; upload a 6 MB PDF → blocked.
7. Open a receipt document → opens in new tab (image/PDF); a crafted `data:text/html` attachment → refused.
8. On a phone-width viewport, open Talepler → request date shows a real date, not "Invalid Date".

### Risks / open questions
- The login throttle is per-process/in-memory — behind a load balancer or on restart it is weak. Recommend `express-rate-limit` + `helmet` (needs `npm install`, deferred per no-new-deps rule).
- Secrets (`JWT_SECRET`, MySQL password) remain in **git history** and a plaintext admin password remains in tracked `server/migrations/add_rbac_roles.sql`. These MUST be rotated and history purged — not fixable in code alone. See audit report.
- `xlsx@0.18.5` has known CVEs with no npm-hosted fix; migrating off it is a separate task.
- Tailwind is still loaded from CDN in `index.html` (supply-chain / CSP); moving it into the Vite build is deferred to avoid breaking styling.
