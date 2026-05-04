# 05 — Database Model

> Source of truth for **runtime** schema: `server/schema.sql` + migrations in `server/migrations/` applied via `server/run-migration.js`. `server/complete_database_schema.sql` is an alternative destructive rebuild and **disagrees** with runtime in some places (notably `users.role`).

## 1. Tables (confirmed — 14 core)

| Table | Purpose | PK | Key FKs |
|---|---|---|---|
| `users` | Auth + RBAC | `id` (BIGINT AI) | — |
| `item_definitions` | Master SKU | `id` (VARCHAR 64) | — |
| `lots` | Physical batches | `id` | → `item_definitions.id` |
| `purchases` | Purchase request lifecycle | `id` | → `item_definitions.id` |
| `receipts` | Goods receipt events | `receiptId` | → `purchases.id`, → `lots.id` (nullable) |
| `distributions` | Issue events | `id` | → `item_definitions.id` |
| `distribution_lots` | Lot splits per distribution | `id` | → `distributions.id`, → `lots.id` |
| `usage_records` | Per-lot consumption ledger | `id` | → `lots.id`, → `item_definitions.id` |
| `waste_records` | Disposal | `id` | → `item_definitions.id`, → `lots.id` |
| `lot_adjustments` | Manual corrections | `id` | → `lots.id` |
| `counting_schedules` | Physical-count plans | `id` | — |
| `counting_records` | Count results with variance | `id` | → `counting_schedules`, `lots`, `item_definitions` |
| `attachments` | Inline base64 files | `id` | polymorphic via `(entityType, entityId)` |
| `audit_log` | Change log | `id` (BIGINT AI) | — |

Plus legacy tables from `schema.sql`: `items` (still referenced by `/api/state` legacy path but backend notes the table no longer exists in runtime — **verify** which DBs still have it).

## 2. Enums (confirmed)

### `users.role`
- **Runtime** (via `add_rbac_roles.sql`): `VARCHAR(20)` holding `'ADMIN' | 'SATINAL' | 'SATINAL_LOJISTIK' | 'OBSERVER'`.
- `complete_database_schema.sql`: `ENUM('ADMIN','APPROVER','REQUESTER')` — **out of date, do not use**.

### `item_definitions.status`
`'ACTIVE' | 'INACTIVE' | 'DISCONTINUED'` (default `ACTIVE`).

### `lots.status`
`'ACTIVE' | 'DEPLETED' | 'EXPIRED' | 'QUARANTINE'` (default `ACTIVE`).

### `purchases.status`  (**Turkish literals — API contract**)
```
TALEP_EDILDI     - Requested (initial)
ONAYLANDI        - Approved
REDDEDILDI       - Rejected
SIPARIS_VERILDI  - Ordered
KISMI_TESLIM     - Partially received
TESLIM_ALINDI    - Fully received
IPTAL            - Cancelled
```

Plus legacy value `GELDI` (old "received") used by `migrateData` in `App.jsx`.

### `purchases.urgency`
`'normal' | 'urgent' | 'critical'`.

### `distributions.status`
`'PENDING' | 'COMPLETED' | 'CANCELLED'`.

### `waste_records.wasteType`
`'EXPIRED' | 'DAMAGED' | 'CONTAMINATED' | 'EXCESS' | 'OTHER'`.

### `lot_adjustments.adjustmentType`
`'CORRECTION' | 'DAMAGE' | 'FOUND' | 'LOSS' | 'TRANSFER' | 'OTHER'`.

### `counting_schedules.frequency` / `.status`
`'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ADHOC'` / `'ACTIVE' | 'INACTIVE' | 'COMPLETED'`.

### `attachments.entityType`
`'PURCHASE' | 'RECEIPT' | 'LOT' | 'DISTRIBUTION' | 'WASTE' | 'ITEM'`.

### Derived UI statuses (from `v_stock_summary`)
`STOKTA | SATIN_AL | STOK_YOK | SKT_YAKIN | SKT_GECMIS`.

## 3. Important invariants (confirmed)

1. **`UNIQUE (itemId, lotNumber)`** on `lots` — cannot create two identical lot numbers per item. Server returns `409 DUPLICATE_LOT`.
2. **`UNIQUE (code)`** on `item_definitions`. Returns `409 DUPLICATE_CODE`.
3. **`UNIQUE (requestNumber)`** on `purchases`.
4. **Cascade deletes** (important to understand before deleting anything):
   - `item_definitions` deletion → cascades to `lots`, `usage_records` (hard), and **restricts** `purchases`, `distributions`, `waste_records`.
   - `lots` deletion → cascades to `usage_records`, `distribution_lots`, `lot_adjustments`; sets `receipts.lotId = NULL`; sets `waste_records.lotId = NULL`.
   - `purchases` deletion → cascades to `receipts`.
   - `distributions` deletion → cascades to `distribution_lots`.
5. **`totalStock`** and **`availableStock`** are **computed views**, never stored. Always `SUM(currentQuantity)` with filters.
6. **FEFO ordering**: `ORDER BY (expiryDate IS NULL) ASC, expiryDate ASC, receivedDate ASC`. Null-expiry lots are used **last**.
7. **Dates on disk**: `DATE` and `DATETIME` columns on new tables; but `schema.sql` legacy tables use `VARCHAR(40)` for dates. Migrations have partially unified these — verify each field before writing SQL.

## 4. Views (confirmed in `complete_database_schema.sql`)

- `v_stock_summary` — per-item aggregated stock + derived `stockStatus`.
- `v_purchase_summary` — purchases joined with item name + Turkish status text.

> These views exist only if the DB was built from `complete_database_schema.sql`. If the DB was bootstrapped from `schema.sql` + migrations, they may be missing. **Verify** with `SHOW CREATE VIEW` before depending on them in code.

## 5. Denormalization callouts

- `purchases.itemCode`, `purchases.itemName` are **copied from** `item_definitions` at request time — they will NOT auto-update if the item is renamed.
- `distributions.itemCode`, `distributions.itemName`, `waste_records.itemCode`, `waste_records.itemName`, `waste_records.lotNumber` are similarly denormalized.
- When renaming an item, decide intentionally whether to update historical rows.

## 6. `users` quirks

- Two definitions exist in the repo:
  - `schema.sql` → `role VARCHAR(20)`, no `email`/`fullName`/`isActive`.
  - `complete_database_schema.sql` → `ENUM(...)`, adds `email`, `fullName`, `isActive`, `updatedAt`.
- `ensureUsersTable()` in `server/index.js` creates the **minimal** `VARCHAR(20)` version if missing. Runtime relies on this shape. Any code referencing `users.email`/`fullName`/`isActive` would fail on the legacy-created DB — **verify** before adding.

## 7. Indexes worth knowing

- `lots (itemId, status, expiryDate)` and `(itemId, status, receivedDate)` — used by FEFO queries.
- `purchases (itemId, status)`; `distributions (itemId, distributedDate)`; `usage_records (itemId, usedAt)` — used by reports.
- `attachments (entityType, entityId)` — polymorphic lookup.

## 8. Migration hygiene (current state)

- No migration-tracking table. Applying `run-migration.js` twice on the same file can fail or duplicate changes.
- `add_lab_fields.sql` has a `_safe` twin — **the `_safe` version is idempotent**; prefer it. Verify which was applied.
- Every new change should add a dated migration file and document it in `updates/` (see `12-ai-agent-rules.md`).
