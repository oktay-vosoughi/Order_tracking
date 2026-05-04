# 08 — Coding Conventions

Observed from the current codebase. Follow them for consistency unless there is a good reason to deviate — document the reason in `updates/` if you do.

## 1. Language & tooling

- **JS only** (JSX on the frontend, CommonJS on the backend). Do **not** introduce TypeScript without a migration plan — `lab_equipment_tracker.tsx` at root is an orphan and must not be imitated.
- Node require on backend (`const express = require('express')`), ES modules on frontend (`import`).
- No Prettier/ESLint config committed. Match surrounding style exactly.

## 2. File layout rules

- All new React code goes in `src/`. Do **not** add another file at repo root like `lab_equipment_tracker.tsx`.
- All HTTP calls go through `src/api.js`. **Never** call `fetch()` from a component.
- All backend routes live in `server/index.js` for now. If you split it (recommended long-term), keep it to small, numbered modules and update this doc.
- Every schema change → new file in `server/migrations/` (see §6).

## 3. Naming

- **Table / column names**: camelCase (`itemDefinitions`, `receivedQtyTotal`). MySQL is case-insensitive on identifiers on Windows by default — but the code expects exact case. Don't rename.
- **Status enums**: Turkish SCREAMING_SNAKE (`TALEP_EDILDI`, `ONAYLANDI`, `SATIN_AL`, `SKT_YAKIN`, `STOK_YOK`). These are contract values, not labels.
- **Entity status enums**: English SCREAMING_SNAKE (`ACTIVE`, `DEPLETED`, `EXPIRED`, `QUARANTINE`, `PENDING`, `COMPLETED`).
- **React state**: camelCase; boolean UI flags start with `show*` or `is*` / `can*`.
- **Error codes**: SCREAMING_SNAKE (`INVALID_INPUT`, `DUPLICATE_LOT`).

## 4. Dates & times

- **Wire format**: `YYYY-MM-DD` for dates, `YYYY-MM-DD HH:MM:SS` UTC for datetimes. Use `toMySQLDateTime(value)` on the server for inputs that may be ISO strings.
- **Excel**: route through `parseSKTDate` (`src/utils/dateParser.js`) — handles Excel serials and locale formats.
- **Display**: use `formatDate` in `src/labUtils.js` or `formatDateForDisplay` in `src/utils/dateParser.js` (`tr-TR` locale).

## 5. SQL style (server/index.js)

- Use parameterized queries: `pool.query(sql, params)` — never string-concatenate user input.
- Prefer helpers: `all(conn, sql, params)` and `run(conn, sql, params)`.
- For multi-statement mutations that must be atomic, wrap in `withTransaction(async (conn) => { ... })`. Always pass `conn` (not `pool`) inside the callback.
- Row locking for concurrent stock writes: `SELECT ... FOR UPDATE` inside a transaction.
- Use `COALESCE(?, column)` on UPDATE to preserve existing values when a field is not sent — this is the project's established pattern for PUT endpoints.

## 6. Migrations

- One change per file, named descriptively: `YYYY_MM_DD_<short_topic>.sql` (current files lack dates — when adding new ones, please date them).
- Idempotent where feasible (`IF NOT EXISTS`, `IF EXISTS`, `ADD COLUMN IF NOT EXISTS` where MySQL supports it).
- Run via `node server/run-migration.js <filename>.sql`.
- There is **no** migration tracking table. Document the apply order in the corresponding `updates/` entry.

## 7. Error handling

- Server handlers use the pattern:
  ```js
  try { ... res.json(...) }
  catch (err) {
    if (String(err?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_X' });
    console.error('<context>', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
  ```
- Throwing custom objects like `{ status, error, message }` inside `withTransaction` is acceptable if you catch them in the outer handler and map to `res.status(...)`.
- Frontend: catch errors from `apiFetch`, read `.payload?.error` for the code, `.payload?.message` for the human message; show user-friendly Turkish text.

## 8. Frontend state

- `useState` + explicit refetch after mutations. No caching layer.
- Avoid adding Redux/Zustand without a dedicated plan — the codebase does not currently tolerate a hybrid state model.
- Keep capability flags in one place at the top of `App.jsx`. Mirror exactly any server-side middleware change.

## 9. Role strings

- Use the constants `ADMIN | SATINAL | SATINAL_LOJISTIK | OBSERVER` exactly. No aliases.
- `APPROVER` and `REQUESTER` are legacy — do not introduce them.

## 10. Logging

- `console.log` / `console.error` with a short context prefix: `'[/api/unified-stock] ...'`.
- No third-party logger. Don't add one without discussion.

## 11. Attachments

- Max upload: 5 MB (server body limit). Don't silently raise it — if you need more, update `increase_attachment_size.sql`-style migration **and** `express.json({ limit })`, and document in `updates/`.
- File data stored inline as base64 `LONGTEXT`. If this grows, move to object storage — but that is a significant architectural change.

## 12. UI strings

- UI is Turkish. Keep new labels Turkish to match. Keep code identifiers English.
- Status badges must match the palette produced by `getExpiryColorClass`.

## 13. Commits & updates folder (project-specific)

Every substantive change must:
1. Land the code.
2. Add a file to `updates/` summarizing the change and its revert path. See `12-ai-agent-rules.md` §"Change log convention".

No pull-request template or CI is configured — the `updates/` file is the project's change record.

## 14. Things the code currently does that you should match

- Denormalize `itemCode` / `itemName` onto transactional rows (purchases, distributions, waste_records).
- Use `generateId()` for all new VARCHAR(64) PKs — do not introduce auto-increment on those tables.
- Prefer server-side aggregation (`SUM(currentQuantity)`) over client-side math.

## 15. Things to avoid

- Editing `lab_equipment_tracker.tsx`, `main.js` at repo root, or `complete_database_schema.sql` without explicitly noting you verified they are in use.
- Introducing parallel state in the frontend (extra caches, duplicate fetches).
- Silent data migrations at startup (`ensureUsersTable` is the only acceptable one — and even that is borderline).
