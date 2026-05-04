# 09 — Risky Areas & Coupling

Places where a small change can silently cause large damage. Re-read this before editing.

## 1. Known inconsistencies (confirmed)

### 1.1 `clearAllData` URL mismatch
- **Frontend** (`src/api.js`): `POST /admin/clear-all`.
- **Backend** (`server/index.js`): `POST /api/clear-all`.
- Result: the "Clear All" button almost certainly 404s today. If you touch this area, unify both sides in the same commit and document in `updates/`.

### 1.2 `users` table schema drift
- Runtime DB comes from `schema.sql` + migrations → `role VARCHAR(20)`, no `email/fullName/isActive`.
- `complete_database_schema.sql` → `role ENUM('ADMIN','APPROVER','REQUESTER')`, with `email/fullName/isActive/updatedAt`.
- Any code path that reads `u.email`, `u.fullName`, or `u.isActive` will fail on the runtime DB. **Verify** before adding fields.

### 1.3 Legacy `items` table vs new unified model
- `schema.sql` creates `items`; `server/index.js` comments say it no longer exists. `/api/state` treats `items = []`.
- Some handlers still reference `items` (in legacy paths and `schema.sql`). If you see `FROM items` in a query, confirm the table exists in the target DB before trusting the result.

### 1.4 Role label drift
- Runtime roles: `ADMIN | SATINAL | SATINAL_LOJISTIK | OBSERVER`.
- Legacy roles in comments / enums / `migrateData` fallback: `APPROVER | REQUESTER | LAB_MANAGER | PROCUREMENT`.
- Server middlewares use the runtime set. UI too. Do not use legacy labels.

## 2. Coupling hotspots

### 2.1 Role middleware ↔ UI capability flags
- `server/index.js` ~L135-155 defines `canApprove`, `canOrder`, etc.
- `src/App.jsx` ~L133-170 defines `isAdmin`, `canModifyInventory`, `canCreateRequest`, etc.
- These **are not generated from a shared source**. If you change one, mirror the other in the same commit.

### 2.2 Turkish status strings everywhere
- `TALEP_EDILDI | ONAYLANDI | REDDEDILDI | SIPARIS_VERILDI | KISMI_TESLIM | TESLIM_ALINDI | IPTAL` appear as literal strings in:
  - `server/index.js` (SQL `UPDATE ... SET status=?`).
  - `src/App.jsx` (switch/case on status, badge coloring).
  - `complete_database_schema.sql` ENUM.
  - `server/migrations/*.sql` (where applicable).
  - `updates/*.md` (reference).
- Change one → search **all** of the above.

### 2.3 Stock computation
- UI displays a "Stock" number that may come from either:
  - `item_definitions.totalStock` (legacy field, if present), or
  - computed `SUM(lots.currentQuantity)` via `/api/unified-stock` / `/api/item-definitions`.
- Any new write path that forgets to update `lots.currentQuantity` OR flips `lots.status` incorrectly will desynchronize the displayed stock.

### 2.4 FEFO ordering
- Duplicated in at least two places inside `server/index.js` (`/api/consume`, `/api/distribute`).
- If you change the rule (e.g. respect `quarantine`), update BOTH queries and the import-time `LEGACY-STOK` convention.

### 2.5 Denormalized identifiers
- `purchases.itemCode/itemName`, `distributions.itemCode/itemName`, `waste_records.itemCode/itemName/lotNumber` are copies at write time. They do NOT follow renames.
- Renaming an item → consider whether to backfill history.

### 2.6 Attachments size limit
- Body size cap `5mb` (`express.json({ limit: '5mb' })`).
- Attachments stored as base64 `LONGTEXT` — increases size by ~33%.
- Raising the limit without raising DB row size / index footprint consideration risks slow queries and big backups.

### 2.7 `withTransaction` scope
- Endpoints like `/api/consume`, `/api/distribute`, `/api/receive-goods`, `/api/waste-with-lot` MUST remain fully wrapped.
- A refactor that moves even one `run(conn, ...)` call out of the callback breaks atomicity silently (no error, just partial writes under failure).

## 3. Destructive endpoints (triple-check before calling)

- `POST /api/clear-all` — wipes almost all tables.
- `POST /api/state` — DELETE+INSERT of purchases/receipts/distributions/waste.
- `DELETE /api/item-definitions/:id` — cascades to lots → cascades to usage_records / distribution_lots / lot_adjustments.
- `complete_database_schema.sql` — DROPS the database.

## 4. Dead / orphan files (do not edit blindly)

- `lab_equipment_tracker.tsx` (root) — not imported.
- `main.js` (root) — not referenced by `index.html`.
- `.gitigonore` — typo; the real file is `.gitignore`.
- `NOTE.TXT`, `myNotes/` — scratch.

Before editing any of these, grep the repo for references (`rg -F '<filename>' .`). If none exist → don't spend time on it.

## 5. Data memory pitfall (legacy import)

See memory entry: **LEGACY-STOK** vs **HISTORICAL** lot convention.
- `LEGACY-STOK` lot carries real stock (`currentQuantity = Depo count`).
- `HISTORICAL` lots have `currentQuantity = 0`, `status = DEPLETED`.
- Total stock = `SUM(currentQuantity)`. Any converter that forgets to set `status = DEPLETED` on historical lots will **double-count** stock.

## 6. Windows/Linux split

- Dev machine: Windows (pwsh).
- `scripts/*.sh` assume Linux. Running them locally will fail.
- MySQL identifier case sensitivity differs — keep identifiers exact.

## 7. Silent sources of truth

When in doubt, trust in this order (descending):
1. Runtime DB (`SHOW CREATE TABLE`, `SELECT` actual data).
2. `server/index.js` — SQL actually executed.
3. `server/migrations/` — chronological deltas.
4. `server/database/*.sql` — snapshots.
5. `server/schema.sql` — initial.
6. `server/complete_database_schema.sql` — alternate. *Lowest trust.*
