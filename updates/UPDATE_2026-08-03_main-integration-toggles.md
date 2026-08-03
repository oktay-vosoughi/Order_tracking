# UPDATE 2026-08-03 — Barcode on main (single-company) + feature toggles + deploy.sh

## Summary
Integrated the full barcode pack onto the **main product line** (branch
`feature/barcode-integration`, cut from `origin/main`) — single company, role
guards, **no** configurable-platform/module layer (that stays on
`feature/general-configurable-lims-platform` for the future multi-company server).

Added a lightweight **single-company feature-toggle** system so an ADMIN can turn
features on/off from Hesabım → Modüller. Optional existing tabs default ON
(behavior unchanged); the barcode add-ons default OFF (opt-in).

## How it was integrated
- Merged `feature/barcode-receiving-test` into `feature/barcode-integration`.
  Only 2 code conflicts (imports/declarations in `server/index.js`, `src/App.jsx`)
  + `package.json`/`package-lock.json`. Kept main's ISO/MG work + `isKalite`.
- Dropped the phone-test harness config (restored main's `vite.config.js`).

## Feature toggles (single company)
- Stored in `app_settings` as `module.<key>` (no companyId, no licensing).
- Keys mirror the platform module keys → future multi-company migration maps 1:1.
- Frontend: `isFeatureOn(key)` gates nav tabs + panels; ADMIN "Modüller" panel
  in the account tab writes via `PUT /api/settings/module.<key>`.
- Backend: `/api/barcodes/*` gated by `requireAnyFeature('barcode_receiving','barcode_distribution')`
  → returns `403 MODULE_DISABLED` when both are off.
- Defaults: requests/orders/distributions/waste/total_stock/lot_inventory/cep_depo/
  prices/iso_forms = ON; barcode_receiving/barcode_distribution = OFF.

## DB changes (additive/idempotent, ensured at boot)
- `item_barcodes` (new table)
- `app_settings` (new table) + one-time `dist_confirmation_backfilled` marker
- `cep_depo_distributions.receivedConfirmedAt` / `receivedConfirmedBy` (nullable)
No drops, no type changes, no data rewrites.

## Verified
- `npm run build` ✓, `node --check server/index.js` ✓.
- Booted against a CLONE of a working DB (`order_tracking_integration_test`):
  login, `GET /api/settings`, `GET /api/barcodes/:code` (GS1 parse → 404),
  `GET /api/cep-depo/pending-confirmations`, `PUT /api/settings/:key` all OK.
- Toggle gate: barcode route → `403 MODULE_DISABLED` when off, `404 BARCODE_NOT_FOUND`
  when `module.barcode_distribution=1`.

## Deploy (deploy.sh)
`deploy.sh` at repo root: backs up the DB (mysqldump), pulls, `npm install`,
`npm run build`, restarts the backend. **Edit the CONFIG block** (`PROCESS_MANAGER`,
`PM2_NAME`/`SYSTEMD_UNIT`) to match the production server before first use. Schema
self-heals at boot — no manual migration step.

## Rollback
`git revert` the merge; DB rollback: restore the mysqldump deploy.sh wrote to `backups/`.
Optional column/table drop SQL in `server/migrations/2026-08-03-distribution-receipt-confirmation.sql`.
