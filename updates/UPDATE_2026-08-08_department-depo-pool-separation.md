# UPDATE 2026-08-08 — Per-department depo pool separation

## Summary

Each department now works like its own lab for main-warehouse stock. Previously
`lots.department` was unused (always NULL) and `GET /api/unified-stock`
summed every lot and every pending purchase order for an item into one
combined number, regardless of which department it belonged to — so when
Moleküler Genetik ordered a shared item (e.g. gloves that both they and
SİTOGENETİK stock), the "beklemede" (pending) figure shown to everyone
included that order, and SİTOGENETİK's own separately-stored physical stock
was silently pooled into the same total. This shipped in two stages within
this change:

1. A binary SİTOGENETİK-vs-shared split (per the original ask: SİTOGENETİK
   keeps a physically separate storage room, everyone else shares one).
2. Generalized to a full per-department model (per follow-up direction): every
   department is its own isolated pool; untagged legacy rows fall into a
   catch-all `UNASSIGNED` ("Etiketlenmemiş") pool.

The read-side breakdown (stock/pending-order numbers shown per department) is
always on and purely additive. The write-side enforcement (FEFO deduction only
draws from the correct department's pool) is gated behind the `depo_pool_split`
app_settings flag, **default OFF**, so today's behavior is unchanged until an
ADMIN opts in via Hesabım → Sistem Ayarları → "Bölüm bazlı depo ayrımı".

## Files touched

- `server/depoGroup.cjs` (new) — pure `resolveDepoGroup(departmentName)` /
  `buildLotPoolFilter(group, alias)`. Every department name is its own pool
  key; blank/null collapses to `UNASSIGNED_POOL`.
- `server/depoGroup.test.cjs` (new) — 6 `node:test` cases.
- `server/migrations/2026-08-08-depo-pool-backfill.sql` (new) — backfills
  `lots.department` only for the unambiguous case (item belongs to exactly one
  department, not global); adds `idx_lots_department`. Mirrored into the boot
  self-heal (`ensureCepDepoTables()`) so it also runs automatically.
- `server/index.js`:
  - `POST /api/receive-goods` — new lots are tagged with the purchase's own
    `department` (was: always NULL).
  - `GET /api/unified-stock` — added two grouped queries (lots-by-department,
    pending-purchases-by-department) and merged them into a new `pools` field
    per item: `{ [departmentName|'UNASSIGNED']: { total, available, expired,
    activeLotCount, nearestExpiry, pendingOrderQty, status } }`. All prior
    top-level fields (`totalStock`, `availableStock`, `pendingOrderQty`,
    `stockStatus`, etc.) are unchanged.
  - `POST /api/consume`, `POST /api/distribute`, `POST /api/cep-depo/distribute`
    — FEFO auto-selection branches now filter by `buildLotPoolFilter` when
    `depo_pool_split = '1'`. Manual/explicit lot-selection branches are
    untouched (admin's deliberate choice, not auto-FEFO).
  - New `app_settings` key `depo_pool_split` (default `'0'`).
- `src/stockDisplay.mjs` — new pure `getDepoPoolRows(item)`: returns one row
  per department only when an item's stock/pending orders actually span more
  than one department; otherwise returns `[]` so ordinary single-department
  items render exactly as before.
- `src/App.jsx` — unified-stock table (desktop + mobile) renders the
  per-department breakdown when `getDepoPoolRows` returns rows; otherwise the
  original combined "beklemede/Tahmini" line is unchanged. New "Bölüm bazlı
  depo ayrımı" checkbox under Hesabım → Sistem Ayarları.

## DB changes

- `lots.department` — no schema change (column already existed, was unused).
  Backfilled for unambiguous single-department items only.
- New index `idx_lots_department` on `lots(department)`.
- New `app_settings` row: `depo_pool_split = '0'`.

Rollback: `DROP INDEX idx_lots_department ON lots;` — backfilled `department`
values are not mechanically reversible (no record of which NULL rows were
touched); restore from a pre-migration backup if needed. The `app_settings`
row can be deleted or left at `'0'` harmlessly.

## Test steps

1. `node --test server/depoGroup.test.cjs` — 6/6 pass.
2. `node --test server/*.test.cjs server/*.test.js` — 55/56 pass (the 1
   failure, `unitCorrection.test.cjs`, is pre-existing on `main` and unrelated
   — confirmed via `git stash` before this change).
3. `npx vite build` — clean, no errors.
4. Live-verified end-to-end via the running dev server + real admin browser
   session (all test items/purchases/lots created and deleted afterward,
   production data untouched):
   - Created a shared item, bought it through the full talep→onay→sipariş→
     teslim-al flow for 3 different departments (SİTOGENETİK, Moleküler
     Genetik, untagged) — confirmed 3 distinct pools in `unified-stock` and in
     the Stok table UI, summing correctly to the combined total.
   - Confirmed pending-order figures split per department (an order for one
     department no longer shows as "beklemede" against another).
   - With `depo_pool_split` OFF: confirmed FEFO consumption behaves exactly as
     before (can cross pools) — no behavior change for the default state.
   - With `depo_pool_split` ON: confirmed a department's FEFO consumption is
     capped at its own pool's stock (`NO_STOCK_AVAILABLE` on overdraw) even
     when other departments' pools still have stock — no cross-pool spillover.

## Risks

- Backfill migration correctness depends on `item_definitions`/`item_departments`
  being accurate at migration run time — re-run the preview `SELECT` against
  production before/after applying if there's any doubt about current tagging.
- `depo_pool_split` changes real consumption/distribution behavior once
  enabled — recommend enabling it only after reviewing the per-department
  breakdown on the live unified-stock view for a while first.
- `server/run-migration.js` had an unrelated, pre-existing local (uncommitted)
  change on the working tree before this session that is no longer present —
  flagged separately to the user; not caused by this change (confirmed via
  `git stash`, which never contained it).
