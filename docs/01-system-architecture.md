# 01 — System Architecture

## 1. Deployment shape (confirmed)

Two processes + one database:

```
┌─────────────────────────┐       ┌──────────────────────────┐       ┌────────────────┐
│ Vite dev server :3000   │──────▶│ Express API :4000        │──────▶│ MySQL 8 :3306  │
│ src/main.jsx → App.jsx  │ /api  │ server/index.js          │ mysql2│ order_Tracking │
└─────────────────────────┘ proxy └──────────────────────────┘       └────────────────┘
```

- Proxy: `vite.config.js` → `/api` → `http://localhost:4000`.
- Production build: `npm run build` → `dist/` (not yet wired to be served by Express; verify deployment strategy in `scripts/deploy_frontend.sh`).

## 2. Process boundaries

| Concern | Owner | Notes |
|---|---|---|
| AuthN (JWT issue/verify) | backend only | Secret: `JWT_SECRET` env. Token lifetime: 7 days (`jwt.sign` in `server/index.js`). |
| AuthZ (role checks) | backend middleware | `authRequired`, `adminRequired`, `requireRole([...])`, `canApprove`, `canOrder`, `canDistribute`, `canRequest`, `canReject`. |
| Frontend auth state | `src/api.js` | JWT stored in `localStorage['auth_token']`. Sent as `Authorization: Bearer <token>`. |
| Stock math / FEFO | backend (transactional) | `SELECT ... FOR UPDATE` inside `withTransaction()`. |
| Excel parsing | both | Frontend `xlsx` for import UI; backend has `/api/import-items` for persistence. |
| File attachments | backend | Stored as `LONGTEXT` base64 inside `attachments.fileData`. Max body size: `express.json({ limit: '5mb' })`. |

## 3. Authentication & authorization flow (confirmed)

1. First user: `POST /api/auth/bootstrap` — allowed only when `users` table has zero admins. Creates `ADMIN`, returns JWT.
2. `POST /api/auth/login` → returns `{ token, user }`. Token payload: `{ id, username, role }`.
3. `GET /api/auth/me` resolves current user from DB (re-reads role on every call).
4. All `/api/*` routes except `health`, `auth/bootstrap`, `auth/login` require `authRequired`.
5. Admin-only routes use `adminRequired`. Workflow routes use capability middlewares:

```
canApprove     = [ADMIN, SATINAL]
canOrder       = [ADMIN, SATINAL_LOJISTIK]
canDistribute  = [ADMIN, SATINAL, SATINAL_LOJISTIK]
canRequest     = [ADMIN, SATINAL, SATINAL_LOJISTIK]
canReject      = [ADMIN, SATINAL, SATINAL_LOJISTIK]
```

(Source: `server/index.js` ~L135-155.)

## 4. Data layer architecture (confirmed)

- **Connection pool**: `mysql.createPool({ connectionLimit: 10 })`.
- **Helpers**:
  - `all(connOrPool, sql, params)` → rows.
  - `run(connOrPool, sql, params)` → result.
  - `withTransaction(cb)` → `beginTransaction / commit / rollback / release`.
  - `toMySQLDateTime(value)` — tolerates ISO strings, date-only strings, `Date`, timestamps. Returns `YYYY-MM-DD HH:MM:SS` in **UTC**.
  - `generateId()` — UUID v4 via `Math.random`. **Not cryptographic** — fine for row IDs, not for tokens.

- **Schema layering (inferred)**:
  - `server/schema.sql` — minimal legacy schema (items / purchases / receipts / distributions / users).
  - `server/complete_database_schema.sql` — **destructive** full rebuild (drops DB) with the LOT-based schema. Role ENUM here disagrees with runtime middleware — verify.
  - `server/database/*.sql` — per-table definition dumps (current state snapshot).
  - `server/migrations/*.sql` — incremental migrations applied on top of `schema.sql`.

The effective runtime schema is `schema.sql` + all migrations in `server/migrations/`. `complete_database_schema.sql` is a parallel "fresh install" path.

## 5. Module dependencies (inferred)

```
src/main.jsx
 └── src/App.jsx
      ├── src/api.js              (all HTTP calls)
      ├── src/labUtils.js         (FEFO, expiry, chemical compatibility, DEPARTMENTS)
      ├── src/LabComponents.jsx   (AddItemFormLab, WasteForm, ExpiryAlertDashboard, ExpiryBadge, MSDSLink)
      ├── src/LotInventory.jsx    (lot-level UI)
      ├── src/utils/dateParser.js (parseSKTDate, formatDateForDisplay)
      ├── src/utils/lotExcelImporter.js (buildLotImportPayload)
      └── src/theme.css           (custom tokens; Tailwind via CDN)
```

`src/api.js` is the **only** allowed HTTP boundary — no component should call `fetch` directly. Confirmed by grep: all calls go through `apiFetch` in `api.js`.

## 6. Cross-cutting concerns

- **Logging**: `console.log` / `console.error` only. No structured logger.
- **Error shape**: `{ error: 'CODE', message?: 'text' }`. Frontend rethrows via `apiFetch`.
- **Transactions**: used for state writes (`/api/state`), `/api/consume`, `/api/receive-goods`, `/api/distribute`, `/api/waste-with-lot`. *Verify each endpoint individually before altering lot math.*
- **Rate limiting / CSRF**: none.
- **CORS**: wide open (`cors()` with defaults).

## 7. What is NOT in this system (confirmed absence)

- No test suite. No `test/` folder, no jest/vitest config.
- No CI/CD definition (no `.github/workflows`, no `Dockerfile`).
- No TypeScript (despite `lab_equipment_tracker.tsx` at root, which is orphaned).
- No schema migration tracking table — `run-migration.js` just runs a single file on demand.
- No queue / background worker.
- No file system uploads — attachments are inline base64.

## 8. Open architectural questions (verify)

- Is `lab_equipment_tracker.tsx` (root) used in any deployment, or strictly legacy?
- Is the Turkish status vocabulary (`TALEP_EDILDI` …) duplicated anywhere beyond `complete_database_schema.sql` ENUM and `App.jsx`? A centralized constant module would reduce risk.
- Are `server/database/*.sql` dumps authoritative? Or just snapshots?
