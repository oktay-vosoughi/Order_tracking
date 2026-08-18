# UPDATE 2026-08-16 — Full code-review fixes

## Summary
- Hardened LOT return/consumption and purchase/EBYS state transitions.
- Enforced production CORS, serialized first-admin bootstrap, centralized frontend HTTP, and removed the vulnerable SheetJS dependency.
- Added test/audit scripts, lazy Excel loading, import limits, documentation, and policy tests.

## Scope / project
- Order tracking frontend, backend, database migration, scripts, tests, and documentation.

## Files touched
- `server/index.js`, `server/stockPolicy.cjs`, `server/stockPolicy.test.cjs` — correctness and security controls.
- `server/ebysBatchPolicy.cjs`, `server/ebysBatchPolicy.test.cjs` — existing EBYS batch policy work retained.
- `server/migrations/2026-08-14-add-ebys-batches.sql` — EBYS ownership table and purchase columns.
- `src/api.js`, `src/LotInventory.jsx` — one HTTP boundary.
- `src/utils/excel.js`, `src/utils/lotExcelImporter.js`, `src/App.jsx` — ExcelJS migration and lazy spreadsheet handling.
- `scripts/gen_template.cjs`, `scripts/export_cep_depo_units.cjs` — ExcelJS migration.
- `package.json`, `package-lock.json` — test script, dependency cleanup, secure UUID override.
- `vite.config.js` — stable vendor chunks for a smaller initial application bundle.
- `docs/04-backend-and-api.md`, `docs/05-database-model.md` — API/schema contracts.

## DB changes
- Migration: `server/migrations/2026-08-14-add-ebys-batches.sql`.
- Apply: `node server/run-migration.js 2026-08-14-add-ebys-batches.sql`.
- Rollback SQL: `ALTER TABLE purchases DROP COLUMN ebysReference, DROP COLUMN ebysBatchId; DROP TABLE ebys_batches;`

## How to revert
1. Revert the files listed above.
2. Run the rollback SQL after confirming no EBYS history must be retained.
3. Run `npm install`, then restart the backend and frontend.
4. Verify login, LOT return, ordering, imports, and exports.

## Test steps performed
- `npm test`
- `npm run build`
- `npm audit --omit=dev`
- `node --check server/index.js`
- `git diff --check`

## Risks / open questions
- The migration requires MySQL 8.0.29+ for `ADD COLUMN IF NOT EXISTS`.
- Database-backed concurrency tests still require a disposable MySQL integration environment.
- The initial app chunk is substantially smaller, but splitting the 5,000+ line `App.jsx` further is intentionally deferred because repository rules require that structural refactor to be isolated across dedicated PRs.
