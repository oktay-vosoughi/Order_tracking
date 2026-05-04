# Repository Documentation Set

Audit-driven documentation for the `order tracking` (Laboratuvar Malzeme Takip Sistemi) repository. All files were generated from direct inspection of the code on the current branch and use **confirmed / inferred / verify** framing throughout.

## Files

| # | File | Purpose |
|---|---|---|
| 00 | [`00-project-overview.md`](./00-project-overview.md) | What the project is, stack, roles, key terms. |
| 01 | [`01-system-architecture.md`](./01-system-architecture.md) | Deployment shape, auth, data layer, module graph. |
| 02 | [`02-repo-map.md`](./02-repo-map.md) | Every folder and notable file, with "edit X here" cheatsheet. |
| 03 | [`03-frontend-architecture.md`](./03-frontend-architecture.md) | React app shape, state, HTTP client, styling. |
| 04 | [`04-backend-and-api.md`](./04-backend-and-api.md) | Full endpoint inventory, middlewares, invariants. |
| 05 | [`05-database-model.md`](./05-database-model.md) | Tables, enums, cascades, invariants, schema drift. |
| 06 | [`06-domain-logic.md`](./06-domain-logic.md) | **Roles, capability matrix, all business processes.** |
| 07 | [`07-data-flow-and-lifecycle.md`](./07-data-flow-and-lifecycle.md) | End-to-end traces of each flow. |
| 08 | [`08-coding-conventions.md`](./08-coding-conventions.md) | Project-specific style rules. |
| 09 | [`09-risky-areas-and-coupling.md`](./09-risky-areas-and-coupling.md) | Known inconsistencies and coupling hotspots. |
| 10 | [`10-debugging-guide.md`](./10-debugging-guide.md) | Triage table, SQL snippets, common traps. |
| 11 | [`11-how-to-add-features.md`](./11-how-to-add-features.md) | Recipe-style playbook for common changes. |
| 12 | [`12-ai-agent-rules.md`](./12-ai-agent-rules.md) | **Durable contract for future Claude sessions.** |

## How to use

- **Human onboarding**: read in order 00 → 06 → 09 → 10.
- **Before any code change**: read 09 + 12 (section 3 "Inspection ritual").
- **Claude sessions**: 12 is the first file to load.

## Gaps (not fully verified in the first pass)

1. Internals of `POST /api/receive-goods`, `POST /api/distribute`, `POST /api/waste-with-lot`, `POST /api/import-items`, `GET /api/analytics/overview`, and the `GET /api/export/*` family — surface shape captured, deep branch behavior NOT exhaustively traced.
2. Full tab list in `src/App.jsx` and every conditional render branch.
3. Which migrations have actually been applied to the production DB (no tracking table).
4. Whether `audit_log` is written to anywhere in the code.
5. Whether `v_stock_summary` / `v_purchase_summary` views exist in the current DB (they are only created by `complete_database_schema.sql`).
6. Stored routines in `server/database/order_tracking_routines.sql` — not inspected.
7. `lab_equipment_tracker.tsx` (root) and `main.js` (root) — confirmed not imported by `index.html` / `src/main.jsx`, but no deeper verification.
8. Whether `POST /api/import-items` intentionally allows OBSERVER (no role guard detected).

## Priority list — what to manually inspect next

1. `server/index.js` lines ~900–2250 (receive-goods, distribute, waste-with-lot, import-items, analytics, exports, clear-all).
2. `src/App.jsx` lines ~150–2497 (tab render branches, form submit handlers, migrateData edge cases).
3. `src/LotInventory.jsx` (42 KB — not inspected).
4. `src/LabComponents.jsx` internals.
5. Current production DB: `SHOW TABLES`, `SHOW CREATE TABLE users`, `SHOW CREATE VIEW v_stock_summary` — confirm schema drift.
6. `server/database/order_tracking_routines.sql` for triggers / stored procs.
7. `converts/convert.ipynb` — confirm the LEGACY-STOK vs HISTORICAL invariant matches what is still used for imports.

## Suggested improvement order for these docs

1. **Phase 1 (next session)**: extend `04-backend-and-api.md` with full request/response shapes for the deep endpoints in priority item 1 above.
2. **Phase 2**: after inspecting `App.jsx` fully, enrich `03-frontend-architecture.md` with a tab-by-tab breakdown.
3. **Phase 3**: add a dedicated `13-testing-and-qa.md` once any automated tests exist (currently none).
4. **Phase 4**: reconcile `complete_database_schema.sql` with runtime — either retire it or regenerate it from migrations. Update `05-database-model.md` accordingly.
5. **Phase 5**: once `updates/` accumulates enough entries, compile a `CHANGELOG.md` and link it from `00-project-overview.md`.
