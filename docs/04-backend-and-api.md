# 04 — Backend & API

## 1. Shape (confirmed)

- One file: `server/index.js` (~2251 lines). All routes, middlewares, SQL, and helpers.
- Express 4, `cors()` default, `express.json({ limit: '5mb' })`.
- MySQL pool with `connectionLimit: 10`.
- Start: `npm run server` → `node server/index.js` on `PORT` (default `4000`).

## 2. Middlewares (confirmed, `server/index.js` ~L95-155)

```
authRequired(req,res,next)    → 401 if no/invalid Bearer token
adminRequired                 → 403 unless req.user.role === 'ADMIN'
requireRole([...roles])       → 403 unless role ∈ roles
canApprove    = [ADMIN, SATINAL]
canOrder      = [ADMIN, SATINAL_LOJISTIK]
canDistribute = [ADMIN, SATINAL, SATINAL_LOJISTIK]
canRequest    = [ADMIN, SATINAL, SATINAL_LOJISTIK]
canReject     = [ADMIN, SATINAL, SATINAL_LOJISTIK]
```

JWT payload: `{ id, username, role }`. Signed with `JWT_SECRET`. Expires in `7d`.

## 3. Full endpoint inventory (confirmed by grep)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| GET  | `/api/health` | none | Liveness. |
| POST | `/api/auth/bootstrap` | none (fails if admin exists) | Create the first ADMIN. |
| POST | `/api/auth/login` | none | Return JWT. |
| GET  | `/api/auth/me` | authRequired | Current user (re-read from DB). |
| POST | `/api/account/change-password` | authRequired | Change own password (min 8 chars). |
| GET  | `/api/users` | authRequired + adminRequired | List users. |
| POST | `/api/users` | authRequired + adminRequired | Create user. |
| PATCH| `/api/users/:id` | authRequired + adminRequired | Update username/role/password. |
| GET  | `/api/state` | authRequired | Aggregate legacy state (purchases+receipts+distributions+waste). `items=[]` for legacy compat. |
| POST | `/api/state` | authRequired | Bulk rewrite of purchases/distributions/waste (transactional DELETE+INSERT). ⚠ destructive. |
| GET  | `/api/item-definitions` | authRequired | Items + aggregated `totalStock`, `activeLotCount`. |
| GET  | `/api/item-definitions/:id` | authRequired | One item + its lots. |
| POST | `/api/item-definitions` | authRequired | Create item (requires code+name; 409 on dup code). |
| PUT  | `/api/item-definitions/:id` | authRequired | Update (uses `COALESCE` preserving nulls). |
| DELETE | `/api/item-definitions/:id` | authRequired + adminRequired | Hard delete + cascade lots. |
| GET  | `/api/lots` | authRequired | Lots with item info. Filters: `itemId`, `status`, `expiringSoon=true`. |
| POST | `/api/lots` | authRequired | Create lot (409 on dup item+lotNumber). |
| PUT  | `/api/lots/:id` | authRequired | Update mutable fields (`COALESCE`). |
| POST | `/api/consume` | authRequired | Consume from a specific lot or FEFO auto-select. Transactional with `FOR UPDATE`. |
| GET  | `/api/usage-records` | authRequired | Usage history (verify params). |
| POST | `/api/lot-adjustments` | authRequired | Manual adjustment. |
| GET  | `/api/reports/stock-summary` | authRequired | Stock rollup. |
| GET  | `/api/reports/expiry` | authRequired | Expiring/expired lots. |
| GET  | `/api/reports/low-stock` | authRequired | Below-minStock items. |
| GET  | `/api/reports/department-stock` | authRequired | Per-department rollup. |
| GET  | `/api/unified-stock` | authRequired | Item-level with aggregated lot stock (primary list for UI). |
| GET  | `/api/unified-stock/:itemId/lots` | authRequired | Drill-down. |
| POST | `/api/receive-goods` | authRequired + canOrder | Goods receipt → creates lot, updates purchase status. |
| POST | `/api/distribute` | authRequired + canDistribute | Issue stock, FEFO default, writes `distributions` + `distribution_lots` + `usage_records`. |
| POST | `/api/distribute/:id/confirm` | authRequired + canDistribute | Flip to `COMPLETED`. |
| POST | `/api/purchases` | authRequired + canRequest | New purchase request. |
| GET  | `/api/purchases` | authRequired | List + attached receipts. |
| POST | `/api/purchases/:id/approve` | authRequired + canApprove | Approve. |
| POST | `/api/purchases/:id/reject` | authRequired + canReject | Reject (requires reason). |
| POST | `/api/purchases/:id/order` | authRequired + canOrder | Mark as ordered (requires supplier+orderedQty). |
| GET  | `/api/distributions` | authRequired | List. |
| GET  | `/api/distributions-detailed` | authRequired | With lot splits. |
| GET  | `/api/waste-records` | authRequired | List. |
| POST | `/api/waste-with-lot` | authRequired + canDistribute | Dispose from a specific lot. |
| GET  | `/api/attachments/:entityType/:entityId` | authRequired | Files as base64. |
| POST | `/api/import-items` | authRequired | Bulk item+lot import (from Excel). |
| GET  | `/api/analytics/overview` | authRequired | Dashboard stats. |
| GET  | `/api/export/purchases` | authRequired | Export rows (query: `status`). |
| GET  | `/api/export/receipts` | authRequired | |
| GET  | `/api/export/distributions` | authRequired | |
| GET  | `/api/export/waste` | authRequired | |
| GET  | `/api/export/usage` | authRequired | |
| GET  | `/api/export/stock` | authRequired | |
| POST | `/api/clear-all` | authRequired + adminRequired | ⚠ wipe nearly everything. |
| GET  | `*` | — | Wildcard (verify; likely 404 / SPA fallback). |

> **Inconsistency to note**: `src/api.js` calls `clearAllData` against `/admin/clear-all`, but the server route is `/api/clear-all`. **Verify** — this likely already fails (see `09-risky-areas-and-coupling.md`).

## 4. Request / response conventions (confirmed)

- Success: `2xx` with JSON body. Shapes differ per endpoint (`{ items }`, `{ item }`, `{ lots }`, `{ lot }`, `{ purchases }`, `{ status: 'saved' }`, ...).
- Errors: non-2xx with `{ error: 'CODE', message?: '...' }`. Known codes:
  - `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_INPUT`, `INVALID_ROLE`, `INVALID_CREDENTIALS`
  - `WEAK_PASSWORD`, `USERNAME_EXISTS`, `NO_USERS`, `BOOTSTRAP_NOT_ALLOWED`
  - `DUPLICATE_CODE`, `DUPLICATE_LOT`, `NOT_FOUND`, `ITEM_NOT_FOUND`, `LOT_NOT_FOUND`
  - `INSUFFICIENT_STOCK`, `INSUFFICIENT_TOTAL_STOCK`, `NO_STOCK_AVAILABLE`
  - `SERVER_ERROR`, `USER_NOT_FOUND`, `PASSWORD_UPDATED` (success echo)

## 5. Transactional endpoints (confirmed use of `withTransaction` / `FOR UPDATE`)

- `POST /api/state` — DELETE+INSERT, all-or-nothing.
- `POST /api/consume` — selects lots with `FOR UPDATE`, deducts, writes `usage_records`.
- `POST /api/receive-goods` — creates lot + writes receipt + updates purchase totals. *Verify details.*
- `POST /api/distribute` — FEFO loop with `FOR UPDATE`, writes `distributions` + `distribution_lots` + `usage_records`. *Verify.*
- `POST /api/waste-with-lot` — deducts lot + writes waste. *Verify.*
- `DELETE /api/item-definitions/:id` — deletes lots then item.

When modifying any of these, the **entire** branch must stay inside one `withTransaction`. Never split.

## 6. Stock math invariants (confirmed)

- `lots.currentQuantity` is the **only** source of per-lot stock.
- Item-level "stock" is always a SUM over `lots` filtered by `status='ACTIVE' AND currentQuantity > 0` and optionally `expiryDate >= CURDATE()`.
- On depletion: `status` flips to `'DEPLETED'` in the same UPDATE that sets `currentQuantity`.
- FEFO ordering: `ORDER BY CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END, expiryDate ASC, receivedDate ASC`. **Null expiry sorts last.**

Violate these and you will silently corrupt stock math. See `09-risky-areas-and-coupling.md`.

## 7. Env (confirmed)

`server/.env` (loaded by `dotenv`):

```
PORT=4000
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=0000
MYSQL_DATABASE=order_Tracking
JWT_SECRET=change-this-in-production
```

Also: `src/.env` with `VITE_API_URL`, plus two stub `.env` files at repo root. **Two sources of truth** — be careful which one is loaded.

## 8. Open questions (verify)

- Do `/api/export/*` return JSON or an XLSX buffer?
- Does `/api/consume` have a corresponding UI action, or is it invoked only from `POST /api/distribute`?
- Is `audit_log` written to anywhere? Schema exists; usage not seen in the first-pass scan.
- Does `POST /api/state` still work given `items` are intentionally empty? (It skips item writes.)
