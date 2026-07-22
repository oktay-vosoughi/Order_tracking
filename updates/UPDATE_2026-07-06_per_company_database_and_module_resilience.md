# UPDATE 2026-07-06 — Per-company dedicated databases + module-deactivation resilience

## Summary

1. **Dedicated database per company (optional).** When the platform admin (company 1,
   `platform.companies` permission) creates a new company in Ayarlar → Şirketler, a new
   checkbox provisions a dedicated MySQL database for it. Business data (items, lots,
   purchases, receipts, distributions, waste, CEP DEPO, counting, usage, audit) lives in
   that database — physical isolation. Identity and configuration (users, departments,
   companies, roles, role_permissions, company_settings, company_modules) stay in the
   central database; the tenant database gets simple cross-schema VIEWs onto them, so
   every existing query (JOINs, inserts with explicit companyId, transactions) works
   unchanged. Companies without a dbName keep using the shared central database exactly
   as before; company 1 always does.

2. **Module deactivation can no longer break other features.**
   - `loadAllActionData` (App.jsx) previously used one all-or-nothing `Promise.all`: a
     disabled `waste` module 403'd and silently killed purchases/distributions/lab-tech
     loading too. Each fetch now degrades independently and module-gated fetches are
     skipped when the module is off.
   - If the module of the currently open tab is disabled while the user is on it, the
     app bounces to the Stok tab (core, cannot be disabled) instead of rendering a dead tab.
   - The two "Atık" buttons on the stock tab are hidden when the `waste` module is off
     (their POST would have been rejected server-side).

## How it works (backend)

- `companies.dbName VARCHAR(64) NULL` — NULL = shared DB (added idempotently at boot,
  documented in `server/migrations/2026-07-06-company-dedicated-database.sql`).
- `server/platform/tenantDb.cjs` (new):
  - `provisionTenantDatabase` — validates the name (`[a-z][a-z0-9_]{2,63}`, reserved
    names refused, **existing databases always refused** — it never adopts a database,
    protecting the other production schemas on this MySQL server), creates the DB,
    creates business tables from `server/database/order_tracking_full_dump.sql`
    (structure only, `FOREIGN_KEY_CHECKS=0` during load), creates the identity views.
    On any mid-provision failure the new DB is dropped.
  - `createTenantPoolRouter` — lazily-created connection pool per tenant DB and a
    30s-cached companyId→dbName map (invalidated on company creation).
- `server/index.js`:
  - The old module-level `pool` is now a Proxy over an `AsyncLocalStorage` store; an
    `/api` middleware decodes the JWT best-effort and enters the caller company's pool
    context. All ~200 existing query/transaction call sites work unchanged. No token /
    unknown company / lookup failure → central pool (never blocks a request).
  - Identity-critical code paths use `centralPool` explicitly: platform routes,
    `requirePermission`/`requireModule` factories, `isValidRoleForCompany`, boot code.
  - `ensureBusinessSchema(db, {seedDepartments})` factors the boot self-heal
    (ensureCepDepoTables + price columns + status migrations) and runs at boot for the
    central DB **and every tenant DB**, and right after provisioning (this is what
    creates the CEP DEPO tables in fresh tenant DBs — they are not in the dump).
- `POST /api/admin/companies` accepts `createDatabase: true` and optional `dbName`
  (default `lims_<slug>`); order of operations is company row → provision → set dbName
  → seed roles → admin user, with full rollback (row, roles, and the just-created DB)
  on any failure. New error codes: `INVALID_DB_NAME` (400), `DB_EXISTS` (409).

## Files touched

- `server/platform/tenantDb.cjs` (new)
- `server/platform/schema.cjs` — companies.dbName column
- `server/platform/routes.cjs` — company create/list, provisioning + rollback
- `server/index.js` — central/tenant pool routing, ensureBusinessSchema, boot loop
- `server/migrations/2026-07-06-company-dedicated-database.sql` (new, manual/prod)
- `src/SettingsPanel.jsx` — dedicated-DB checkbox + dbName input + DB badge in list
- `src/App.jsx` — resilient loadAllActionData, disabled-tab bounce, gated Atık buttons
- `scripts/test-tenant-db.sh` (new) — E2E suite, see below

## DB changes

- Central: `ALTER TABLE companies ADD COLUMN dbName VARCHAR(64) NULL` (self-heals at boot).
- New tenant databases are created only via the admin API, never adopted.

## Rollback

- `ALTER TABLE companies DROP COLUMN dbName;` and revert the code. Tenant databases
  created in the meantime hold real business data — migrate their rows into the central
  DB (adding companyId scoping) before dropping them.

## Test steps / evidence

- Unit: `node --test server/**/*.test.cjs src/*.test.mjs` — 26/26 pass.
- Frontend: `npx vite build` — clean.
- E2E (isolated harness, API :4100, DB `order_tracking_platform_test`):
  `scripts/test-isolated-platform.sh --fresh` then `scripts/test-tenant-db.sh` —
  **44/44 pass**, covering: provisioning (tables vs views), refusal of existing/central
  DB names with full rollback, tenant login, business rows landing in the tenant DB and
  not the central one (and vice versa), transactions on the tenant pool, users and
  departments created by the tenant landing centrally with the right companyId, all
  non-core modules disabled at once → no endpoint 500s, gated endpoints return
  `403 MODULE_DISABLED`, core modules cannot be disabled, one company's toggles do not
  affect another, boot log shows `Tenant database verified: <dbName>`.

## Risks / notes

- Cross-schema views require the app MySQL user to have rights on both schemas (true
  today: single app user). The views name the central DB literally — renaming the
  central database requires re-creating tenant views.
- The `AsyncLocalStorage` context is entered per request in an `/api` middleware; code
  running outside a request (boot, timers) automatically uses the central pool.
- The harness gotcha still applies: rerunning `scripts/test-isolated-platform.sh`
  without `--fresh` reloads the dump and wipes `users` in the test DB. Also, if an old
  API process is orphaned on :4100, the new one dies with EADDRINUSE while health
  checks pass against the stale process — kill by port when in doubt.
