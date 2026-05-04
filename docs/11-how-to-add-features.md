# 11 — How to Add Features

Recipe-style playbook for common change types. Every recipe ends with a mandatory **updates/** entry — see `12-ai-agent-rules.md` §"Change log convention".

## 0. Before you start (every feature)

1. Read `09-risky-areas-and-coupling.md`.
2. `rg -n '<relevant term>'` the whole repo to find duplicated constants/strings.
3. Decide: frontend only, backend only, or both? Schema change needed?
4. Write the `updates/UPDATE_<YYYY-MM-DD>_<topic>.md` skeleton first (intent + revert plan).

---

## Recipe A — Add a new field to an existing entity (e.g. new column on `lots`)

1. **Migration** — create `server/migrations/<YYYY_MM_DD>_add_<field>_to_lots.sql`:
   ```sql
   ALTER TABLE lots ADD COLUMN newField VARCHAR(255) NULL AFTER notes;
   ```
   Idempotent variant if your MySQL supports it:
   ```sql
   ALTER TABLE lots ADD COLUMN IF NOT EXISTS newField VARCHAR(255) NULL;
   ```
2. **Apply**: `node server/run-migration.js <YYYY_MM_DD>_add_newField_to_lots.sql`.
3. **Backend** (`server/index.js`):
   - `POST /api/lots` — add `newField` to destructure + INSERT column list + params.
   - `PUT /api/lots/:id` — add `newField = COALESCE(?, newField)` and param.
   - Any SELECT that returns lots already uses `l.*` → no change, but verify.
4. **API client** (`src/api.js`) — no change needed unless you add a new endpoint.
5. **UI** — add input to the relevant form in `App.jsx` / `LotInventory.jsx` / `LabComponents.jsx`. Pass the value through the existing `receiveGoods` / create-lot flow.
6. **Types / memos** — if the field is a Turkish enum, update any switch statements rendering badges.
7. **Revert plan**: `ALTER TABLE lots DROP COLUMN newField;` + revert the 3 code edits.
8. `updates/UPDATE_<date>_add_newField_to_lots.md` with all of the above.

---

## Recipe B — Add a new purchase status

**This is a high-risk change.** Statuses are denormalized into UI switches, badge colors, filter queries, and possibly views.

1. DB: extend the status check/enum (currently plain VARCHAR — a migration may not be required if you only add a new string).
2. `server/index.js`:
   - Add the new status string to any transition endpoint (`/approve`, `/reject`, `/order`, `/receive-goods`).
   - Add a new endpoint if the transition doesn't belong to an existing one.
3. `src/App.jsx`:
   - Update `migrateData` if old rows might carry a legacy value.
   - Update the status → Turkish label map and the badge color map.
   - Update the tab filter (`purchaseStatusFilter`) options.
4. `complete_database_schema.sql` view `v_purchase_summary` — update the CASE.
5. Test the full lifecycle (create → new status → terminal state).
6. Revert: remove the status from the five places above; manually restore any rows that reached the new status.

---

## Recipe C — Add a new role

1. Backend:
   - Add to `ROLES` object in `server/index.js` (L21-26).
   - Add to `validRoles` guards in `POST /api/users` and `PATCH /api/users/:id`.
   - Decide membership in each capability middleware (`canApprove`, `canOrder`, `canDistribute`, `canRequest`, `canReject`).
2. Frontend (`src/App.jsx`):
   - Add to `ROLE_LABELS`.
   - Add the `isNewRole` flag and include it in each `canX` boolean.
   - Update the role dropdown in the user-management form.
3. `docs/06-domain-logic.md` — extend the capability matrix.
4. Revert: remove from the same six places and downgrade any users who already hold the role to `OBSERVER`.

---

## Recipe D — Add a new endpoint

1. `server/index.js` — add the route with appropriate middlewares (`authRequired` always; role guard if mutating). Use the project error-shape pattern.
2. `src/api.js` — add a matching client function. Keep the name short and aligned with the URL.
3. `src/App.jsx` (or subcomponent) — call it, handle success + error.
4. If the endpoint mutates multiple tables, wrap in `withTransaction`.
5. Update `docs/04-backend-and-api.md` endpoint table.

---

## Recipe E — Add a new tab in the UI

1. Pick a key (e.g. `reports`). Add a `tabClass('reports')` button in the tab bar in `App.jsx`.
2. Add a branch in the main render that shows the panel when `activeTab === 'reports'`.
3. Load data on tab enter (or on mount) via an existing `fetchX()`.
4. Gate visibility by role if needed (`isObserver` typically still sees read-only tabs).

---

## Recipe F — Add a new Excel import column

1. `src/utils/lotExcelImporter.js` — extend header normalization map and the per-row builder.
2. `POST /api/import-items` — accept the new field; insert into `item_definitions` or `lots` as appropriate.
3. Update `Malzeme_Import_Sablonlari.xlsx` / `MIGRATION_EXAMPLE.xlsx` so users have a template.
4. Update `updates/EXCEL_IMPORT_GUIDE.md` or add a new update file.

---

## Recipe G — Add a new report / analytic

1. Backend: add `GET /api/reports/<name>` or extend `/api/analytics/overview`. Use server-side aggregation.
2. Frontend: add a fetcher in `api.js`; render in an existing analytics panel or new tab.
3. Prefer reading from the `v_stock_summary` view if the DB was built with `complete_database_schema.sql`; otherwise inline the SUM query.

---

## Recipe H — Schema rename (dangerous)

1. Add the new column; dual-write for one release; migrate reads; drop the old column in a later migration.
2. Never rename in-place without dual-write — there is no rollback safety net.

---

## Recipe I — Performance fix on a slow query

1. Run `EXPLAIN <query>` in MySQL.
2. Add an index via migration. Follow naming convention `idx_<table>_<col1>_<col2>`.
3. Record before/after timings in the `updates/` entry.

---

## Every feature ends with:

- A new file in `updates/UPDATE_<YYYY-MM-DD>_<topic>.md`. Minimum sections:
  - **Summary** (what changed, user-visible impact)
  - **Files touched** (repo-relative paths)
  - **DB changes** (migration filename, apply command)
  - **How to revert** (reverse migration + file diffs; include SQL commands)
  - **Test steps** (manual QA checklist)
  - **Open questions / risks**
