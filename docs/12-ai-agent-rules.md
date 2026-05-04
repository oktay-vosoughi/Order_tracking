# 12 — AI Agent Rules (durable instruction manual for future Claude sessions)

> This file is the contract. Read it **first** at the start of every session touching this repo.

## 1. Project context summary

- Repo: `c:\Users\STREAM\Desktop\order tracking`.
- Domain: laboratory stock / lot / purchase tracking for a medical lab, Turkish UI.
- Stack: React 18 + Vite (frontend, `src/`), Node.js + Express 4 + MySQL 8 (backend, `server/`).
- Primary entry points: `src/main.jsx` → `src/App.jsx` (~2500 lines, monolithic); `server/index.js` (~2250 lines, monolithic).
- All HTTP calls go through `src/api.js`. All routes live in `server/index.js`.
- Roles enforced at runtime: `ADMIN`, `SATINAL`, `SATINAL_LOJISTIK`, `OBSERVER`. See `06-domain-logic.md` for the full capability matrix.
- Status enums in Turkish SCREAMING_SNAKE (`TALEP_EDILDI` …) are part of the contract — do **not** translate or rename.

## 2. Coding style expectations

- JavaScript only (JSX on frontend, CommonJS on backend). **Do not introduce TypeScript** or a state library without explicit approval.
- Match the surrounding indentation, quoting, and SQL formatting exactly.
- All SQL parameterized; mutations that touch multiple rows/tables must live inside `withTransaction`.
- Date wire format: `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS` UTC via `toMySQLDateTime`.
- Excel dates parsed via `parseSKTDate`.
- Error shape: `{ error: 'CODE', message?: 'text' }`.
- Preserve the denormalization pattern (copy `itemCode`/`itemName` onto transactional rows at write time).

## 3. Mandatory inspection ritual BEFORE editing

Apply this for **any** change larger than a typo:

1. **Search for duplicates of what you intend to change**:
   ```
   rg -n '<identifier or string>' .
   ```
   Capability flags, status strings, and role constants are duplicated across frontend + backend + SQL — expect to touch multiple files.
2. **Read the whole function** you are editing, top to bottom, including its transaction scope.
3. **Cross-check** with these docs:
   - Is the file orphaned (see `09-risky-areas-and-coupling.md` §4)?
   - Is there a known inconsistency affecting this area (§1)?
   - Does the change cross the frontend/backend boundary? If yes, both must change in the same commit.
4. **Check `updates/`** for a prior change in the same area — it may contain the exact revert plan you need.
5. **Only then** write code.

## 4. Shared modules that require extra caution

Edits to these have outsized impact; read the file twice and include a verification note in your `updates/` entry:

- `server/index.js` (every route).
- `src/App.jsx` (~30 `useState`, all capability flags, all tabs).
- `src/api.js` (the only HTTP boundary).
- `src/labUtils.js` (domain constants duplicated in DB).
- `server/migrations/*.sql` (no tracking table — order matters).
- `server/complete_database_schema.sql` (destructive alternate source — do not treat as authoritative).

## 5. How to approach React changes

- Never call `fetch` from a component. Add/extend a function in `src/api.js` first.
- After a mutation, refetch; do not optimistically mutate local state (there is no cache layer to reconcile).
- Do not introduce Redux, Context, or React Query. Keep state inside `App.jsx`.
- Keep capability flags in one block at the top of `App.jsx`. Mirror server middleware exactly.
- Do not delete `migrateData` without auditing persisted shapes.
- No new top-level files outside `src/` (do not imitate `lab_equipment_tracker.tsx` at root).

## 6. How to approach store / API changes

- Every new/changed endpoint:
  - Must have a matching function in `src/api.js` added in the **same** change.
  - Must have its URL listed in `docs/04-backend-and-api.md`.
  - Must declare role guards (`authRequired` + capability middleware) explicitly.
- Preserve the `COALESCE(?, col)` pattern for PUT endpoints.
- Never concatenate user input into SQL.
- Transactional endpoints (consume/distribute/receive-goods/waste-with-lot/clear-all/state) must stay fully inside `withTransaction` and use `FOR UPDATE` when locking lots.

## 7. How to approach DB / schema changes

- Always via a new file in `server/migrations/` named `<YYYY_MM_DD>_<short_topic>.sql` (add the date — existing files lack it, going forward please date them).
- Make the SQL idempotent when possible.
- Apply with `node server/run-migration.js <file>.sql`.
- **Do not** edit `server/database/*.sql` snapshots by hand — regenerate them if needed.
- **Do not** add an `updateColumn` silently at app startup (except `ensureUsersTable`, which is already there).
- Update these in the same change:
  - `server/index.js` SQL (INSERT/UPDATE/SELECT column lists).
  - `src/api.js` and `src/App.jsx` if UI contracts change.
  - `docs/05-database-model.md`.

## 8. How to approach the upload / import / attachment pipeline

- Excel import: `src/utils/lotExcelImporter.js` → `POST /api/import-items`. Keep the header-normalization map in that one file.
- Attachments: base64 `LONGTEXT`, max 5 MB. Any increase in size requires a schema review (row size, backups).
- Respect the `LEGACY-STOK` vs `HISTORICAL` lot convention from `converts/convert.ipynb` outputs — **`HISTORICAL` lots must have `currentQuantity=0` AND `status='DEPLETED'`**. Otherwise total stock is double-counted.
- Do not bypass `parseSKTDate` for Excel dates.

## 9. Rules for safe refactors

- Split `App.jsx` / `server/index.js` only across multiple PRs with a dedicated `updates/REFACTOR_*.md` entry per step.
- Do NOT rename status strings (Turkish enums) or role constants.
- Do NOT change `generateId()` to UUIDs without migrating existing IDs (they are opaque VARCHAR, so any shape is fine going forward — but consistency matters).
- Do NOT remove `withTransaction` wrappers.
- Preserve backward compatibility for `migrateData` unless you can verify no legacy shape is still in production.

## 10. Rules for proposing code modifications

When you propose edits:

- Show the diff in full, with surrounding context.
- If the change crosses frontend+backend+SQL, present each file section clearly.
- State which of `confirmed / inferred / verify` applies to each non-trivial assumption.
- List the **revert** steps explicitly.
- Never fabricate endpoints, columns, or function names — grep first.

## 11. Assumptions to avoid

- "There's a test suite" → **there is none**.
- "CI will catch it" → **no CI**.
- "The `users` table has `email` / `fullName`" → only in `complete_database_schema.sql`; runtime does not.
- "`/admin/clear-all` works" → it does not; the server route is `/api/clear-all`.
- "View `v_stock_summary` exists" → only if DB was built with `complete_database_schema.sql`.
- "Status `GELDI` is still used" → legacy; handled by `migrateData` only.
- "`lab_equipment_tracker.tsx` / `main.js` at root are live" → neither is imported.

## 12. Required validation steps before finalizing code suggestions

Before returning a final answer with code, you must (mentally or actually) confirm:

1. ✅ You ran `rg`/grep for every identifier you reference.
2. ✅ Any new endpoint has a matching client function in `src/api.js`.
3. ✅ Any role change is mirrored in BOTH server middlewares AND UI capability flags.
4. ✅ Any schema change has a migration file AND updated SQL in `server/index.js` AND updated API payload/form.
5. ✅ Multi-table mutations are inside `withTransaction`, using `FOR UPDATE` where stock is read.
6. ✅ You did not edit `complete_database_schema.sql`, `lab_equipment_tracker.tsx`, or `main.js` (root) unless explicitly asked.
7. ✅ You wrote the `updates/` entry (see §13).
8. ✅ You stated what you could not verify.

---

## 13. Change log convention (MANDATORY — per user request)

Every substantive change to this repository must add a new Markdown file under `updates/` that documents the change and **how to revert it**.

### Folder & filename

- Location: `updates/` (at the repo root of **this** `order tracking` project).
- Filename: `UPDATE_<YYYY-MM-DD>_<short_topic>.md`. Example: `updates/UPDATE_2025-03-14_add_ideal_max_stock.md`.
- Cross-project note: if the change is made in a different project (e.g. the sibling `github1` repo with `react_medigen` / `server-medivar` / `server-medisom`), place the update inside that project's own updates folder — e.g. `server-medivar/updates/<file>.md` for a MediVar change or `server-medisom/updates/<file>.md` for a MediSom change. One update file per affected project.

### Required sections in each update file

```markdown
# UPDATE <YYYY-MM-DD> — <topic>

## Summary
- What changed, and the user-visible impact (1–3 sentences).

## Scope / project
- Which repo and which sub-area (frontend, backend, DB, scripts).

## Files touched
- `path/to/file1` — brief note.
- `path/to/file2` — brief note.

## DB changes (if any)
- Migration file: `server/migrations/<name>.sql`.
- Apply: `node server/run-migration.js <name>.sql`.
- Rollback SQL: `...` (explicit, paste-able).

## How to revert
1. Revert file changes (git commit hash or explicit diff summary).
2. Run the rollback SQL above.
3. Re-run `npm run server` and `npm run dev`.
4. Verify with: (smoke-test step).

## Test steps performed
- Manual QA checklist with expected outcomes.

## Risks / open questions
- Anything not fully verified.
```

### When to write it

- **Before** finishing the change, draft the file. It forces you to think about revert up front.
- **Never** commit code without the accompanying update file.
- If the change is later reverted, add another update file `UPDATE_<date>_revert_<topic>.md` pointing back — do not silently delete the original.

---

## 14. User-visible outcomes you own

When a user asks you to make a change:
1. Produce the code.
2. Produce the `updates/UPDATE_*.md` entry.
3. State verification steps they should run (URLs to hit, SQL queries to check).
4. State what remains unverified.

If any of these four are missing, the task is not done.
