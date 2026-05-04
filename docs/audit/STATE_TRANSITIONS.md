# STATE_TRANSITIONS

> Per-entity state machines. One section per entity. Every claim is grounded
> in a specific endpoint or SQL statement in `server/index.js` and the
> schema files in `server/migrations/` and `server/schema.sql`.

## Section 9 — Per-Item State Model

### 9.1 `purchases` (purchase request)

- **Purpose**: Lifecycle of a procurement request from lab to warehouse.
- **Status field**: `purchases.status` `VARCHAR`.
- **All statuses**: `TALEP_EDILDI`, `ONAYLANDI`, `REDDEDILDI`,
  `SIPARIS_VERILDI`, `KISMI_TESLIM`, `TESLIM_ALINDI`, `IPTAL`, and legacy
  `GELDI`.
- **Default / initial**: `TALEP_EDILDI` (hard-coded INSERT at
  `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1397`).
- **Terminal**: `REDDEDILDI`, `TESLIM_ALINDI`, `IPTAL`, and effectively
  `KISMI_TESLIM` if no further receipts arrive.
- **Transitions** (actor → status, endpoint, preconditions):

  | From | To | Endpoint | Actor (role) | Precondition |
  |---|---|---|---|---|
  | (none) | `TALEP_EDILDI` | `POST /api/purchases` | ADMIN, SATINAL, SATINAL_LOJISTIK | valid itemId + requestedQty>0 |
  | `TALEP_EDILDI` | `ONAYLANDI` | `POST /api/purchases/:id/approve` | ADMIN, SATINAL | — |
  | `TALEP_EDILDI` | `REDDEDILDI` | `POST /api/purchases/:id/reject` | ADMIN, SATINAL, SATINAL_LOJISTIK | `rejectionReason` in body |
  | `ONAYLANDI` | `SIPARIS_VERILDI` | `POST /api/purchases/:id/order` | ADMIN, SATINAL_LOJISTIK | `supplierName`, `orderedQty>0` |
  | `ONAYLANDI` | `REDDEDILDI` | `POST /api/purchases/:id/reject` | ADMIN, SATINAL, SATINAL_LOJISTIK | ⚠ server does not block post-approval reject |
  | `SIPARIS_VERILDI` | `KISMI_TESLIM` | `POST /api/receive-goods` | ADMIN, SATINAL_LOJISTIK | `receivedQty` > 0 and total < ordered |
  | `SIPARIS_VERILDI` | `TESLIM_ALINDI` | `POST /api/receive-goods` | same | total received ≥ ordered |
  | `KISMI_TESLIM` | `KISMI_TESLIM` | same | same | further partial receipt |
  | `KISMI_TESLIM` | `TESLIM_ALINDI` | same | same | cumulative total ≥ ordered |

- **Triggers**: all transitions are manual UI actions → REST call. No
  timers, no cron.
- **Validations**: listed per endpoint above.
- **Forbidden transitions**: any status → `TALEP_EDILDI` (no reopen);
  any status → `IPTAL` (no endpoint); `TESLIM_ALINDI` → anything (no
  endpoint). `⚠` Server does not actively block illegal transitions — it
  just lacks endpoints for them.
- **Reopening**: not supported.
- **Rejection rollback**: not supported; `REDDEDILDI` is terminal.
- **Deletion / archive**: no row delete endpoint. Destruction only via
  `POST /api/clear-all` (ADMIN) or manual SQL.
- **Confidence**: `Confirmed`.

### 9.2 `lots` (physical batch)

- **Purpose**: Unit of physical stock with quantity, expiry, storage.
- **Status field**: `lots.status` `VARCHAR`.
- **All statuses**: `ACTIVE`, `DEPLETED`, `EXPIRED`, `QUARANTINE`.
- **Initial**: `ACTIVE` (INSERTs at `server/index.js:721-750, 1138-1265,
  1860-1875`); `DEPLETED` when imported with zero initial stock (the
  "HISTORICAL" row convention in `/import-items`).
- **Terminal**: none structurally; lots can be revived by adjustment or
  PUT.
- **Transitions**:

  | From | To | Mechanism | Actor | Precondition |
  |---|---|---|---|---|
  | — | `ACTIVE` | `POST /api/lots`, `/receive-goods`, `/import-items` | ADMIN / SATINAL / SATINAL_LOJISTIK | `initialQuantity > 0` (for create) |
  | — | `DEPLETED` | `/import-items` with `initialStock=0` | same | — |
  | `ACTIVE` | `DEPLETED` | **Auto**: `UPDATE … SET status='DEPLETED' WHEN currentQuantity<=0` inside consume/distribute/waste endpoints | system (transaction) | qty reaches 0 |
  | `ACTIVE` | `EXPIRED` / `QUARANTINE` | manual `PUT /api/lots/:id` with `status=...` | ADMIN / SATINAL / SATINAL_LOJISTIK (UI gate) | — |
  | `DEPLETED` | `ACTIVE` | `PUT /api/lots/:id` or `POST /api/lot-adjustments` with positive `quantityChange` (adjustmentType=`FOUND` / `CORRECTION`) | same | quantity becomes > 0 |
  | `EXPIRED` / `QUARANTINE` | `ACTIVE` | manual PUT | same | — |

- **Forbidden**: none hard-enforced. The FEFO SELECT simply filters
  `status='ACTIVE' AND currentQuantity>0`, so non-ACTIVE lots are silently
  skipped during distribution.
- **Deletion**: no dedicated endpoint (Gap G-7). Cascades from parent
  item delete or `POST /api/clear-all`.
- **Reopening / rollback**: yes via PUT or positive `lot_adjustments`.
- **Confidence**: `Confirmed`.

### 9.3 `distributions`

- **Purpose**: Handout / issue of material out of stock to a department.
- **Status field**: `distributions.status`.
- **All statuses**: `PENDING`, `COMPLETED`, `CANCELLED`.
- **Initial**: `PENDING` (INSERT inside `/api/distribute`).
- **Terminal**: `COMPLETED`.
- **Transitions**:

  | From | To | Endpoint | Actor |
  |---|---|---|---|
  | — | `PENDING` | `POST /api/distribute` | ADMIN / SATINAL / SATINAL_LOJISTIK |
  | `PENDING` | `COMPLETED` | `POST /api/distribute/:id/confirm` | same |
  | `PENDING` | `CANCELLED` | **no endpoint — Gap G-13** | — |

- **Side effects of create**: stock decrement happens at create
  time, not at confirm. Confirm is a bookkeeping flag.
- **Confidence**: `Confirmed`.

### 9.4 `item_definitions`

- **Purpose**: Master SKU record.
- **Status field**: `item_definitions.status` `ENUM('ACTIVE','INACTIVE',
  'DISCONTINUED')` (default `ACTIVE`).
- **Transitions**: any ↔ any via `PUT /api/item-definitions/:id` with a
  `status` field. No application-layer enum guard.
- **Terminal via delete**: `DELETE /api/item-definitions/:id` (ADMIN
  only). Hard delete; cascades lots + usage + distribution_lots +
  lot_adjustments; restricted FKs on purchases/distributions/waste will
  fail the delete if history exists.
- **Functional effect of non-ACTIVE status**: none observed — no stock
  or report query filters by it. Cosmetic.
- **Confidence**: `Confirmed` for transitions; `Likely cosmetic` for
  functional effect.

### 9.5 `waste_records` / `usage_records` / `lot_adjustments`

- **Purpose**: Immutable ledgers.
- **Status**: none; they each carry a "type" enum (`wasteType`,
  `adjustmentType`) that never changes after insert.
- **Transitions**: insert-only. No update or delete endpoints found.
- **Confidence**: `Confirmed`.

### 9.6 `counting_schedules` / `counting_records`

- **Purpose**: Plan and record physical counts.
- **Schedule status**: `'ACTIVE'`, `'INACTIVE'`, `'COMPLETED'` (default
  `ACTIVE` in schema).
- **Schedule frequency**: `DAILY | WEEKLY | MONTHLY | QUARTERLY |
  YEARLY | ADHOC`.
- **Transitions**: no POST/PUT endpoints were located in the
  first-pass scan of `server/index.js`.
- **Confidence**: `Partial / Incomplete — schema only`.

### 9.7 `users`

- **Purpose**: Auth + RBAC subject.
- **Status field**: none in runtime schema. `isActive` exists only in the
  contradictory `complete_database_schema.sql`.
- **Role transitions**: any → any via `PATCH /api/users/:id` (ADMIN).
  Role whitelist enforced on PATCH (returns `400 INVALID_ROLE` for
  unknown values).
- **Deletion**: no endpoint (Gap G-10).
- **Confidence**: `Confirmed`.

### 9.8 `receipts`

- **Purpose**: Event log for a goods-receipt event.
- No status field; immutable event row.
- **Created by**: `POST /api/receive-goods` (ADMIN / SATINAL_LOJISTIK).
- **Deletion**: cascade from `purchases`.
- **Confidence**: `Confirmed`.

### 9.9 `attachments`

- **Purpose**: Inline base64 files attached polymorphically.
- No status field. Insert-only via various upload paths; retrieved via
  `GET /api/attachments/:entityType/:entityId`.
- **Confidence**: `Confirmed`.

---

## Section 9A — Cross-entity coupling

`Confirmed`:

- A `purchases` transition to `KISMI_TESLIM`/`TESLIM_ALINDI` **always**
  coincides with one `lots` creation/update + one `receipts` insert,
  wrapped in one DB transaction.
- A `distributions` PENDING insert **always** implies one or more `lots`
  decrements + matching `distribution_lots` + `usage_records` rows,
  wrapped in one DB transaction.
- A `waste_records` insert **always** implies a `lots` decrement in the
  same transaction.
- Deleting an `item_definitions` row hard-deletes its `lots` and any
  `usage_records`/`distribution_lots`/`lot_adjustments` rows that hang
  off those lots, but **fails** if that item is referenced by
  `purchases`, `distributions`, or `waste_records` (RESTRICT FK).

## Section 10 — Master state diagram (Mermaid, all entities)

See `@c:\Users\STREAM\Desktop\order tracking\docs\audit\PROCESS_DIAGRAMS.md`
diagrams 7–10 for per-entity Mermaid `stateDiagram-v2`s.
