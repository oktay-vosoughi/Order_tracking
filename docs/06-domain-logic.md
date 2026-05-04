# 06 — Domain Logic, Users & Processes

This file answers: **who does what, and with which rules**.

## 1. User roles (confirmed — `server/index.js` L21-26, L135-155; `src/App.jsx` L133-170)

| Role | Label | Intended user | Can log in? | Read-only? |
|---|---|---|---|---|
| `ADMIN` | Admin | System owner / lab IT | ✅ | ❌ — full access |
| `SATINAL` | Satın Alma (Purchasing) | Approver / buyer | ✅ | ❌ |
| `SATINAL_LOJISTIK` | Satın Alma Lojistik | Logistics / order placer / goods receiver | ✅ | ❌ |
| `OBSERVER` | Observer | Auditor / read-only stakeholder | ✅ | ✅ |

Legacy values `APPROVER` / `REQUESTER` appear only in dead code (`complete_database_schema.sql` ENUM, `App.jsx.migrateData` fallback). **Do not create new users with these.**

## 2. Full capability matrix (confirmed from middleware + UI flags)

Legend: ✅ allowed · ❌ denied · 👁 read-only

| Process | Endpoint / Action | ADMIN | SATINAL | SATINAL_LOJISTIK | OBSERVER |
|---|---|:---:|:---:|:---:|:---:|
| Bootstrap first admin | `POST /api/auth/bootstrap` | ✅ (only before any admin exists) | — | — | — |
| Login | `POST /api/auth/login` | ✅ | ✅ | ✅ | ✅ |
| Change own password | `POST /api/account/change-password` | ✅ | ✅ | ✅ | ✅ |
| List users | `GET /api/users` | ✅ | ❌ | ❌ | ❌ |
| Create user | `POST /api/users` | ✅ | ❌ | ❌ | ❌ |
| Update user | `PATCH /api/users/:id` | ✅ | ❌ | ❌ | ❌ |
| Create item definition | `POST /api/item-definitions` | ✅ | ✅ | ✅ | ❌ |
| Update item definition | `PUT /api/item-definitions/:id` | ✅ | ✅ | ✅ | ❌ |
| Delete item definition | `DELETE /api/item-definitions/:id` | ✅ | ❌ | ❌ | ❌ |
| Create lot | `POST /api/lots` | ✅ | ✅ | ✅ | ❌ |
| Update lot | `PUT /api/lots/:id` | ✅ | ✅ | ✅ | ❌ |
| Consume from lot (FEFO) | `POST /api/consume` | ✅ | ✅ | ✅ | ❌ |
| Lot adjustment | `POST /api/lot-adjustments` | ✅ | ✅ | ✅ | ❌ |
| Create purchase request | `POST /api/purchases` | ✅ | ✅ | ✅ | ❌ |
| Approve purchase | `POST /api/purchases/:id/approve` | ✅ | ✅ | ❌ | ❌ |
| Reject purchase | `POST /api/purchases/:id/reject` | ✅ | ✅ | ✅ | ❌ |
| Mark purchase ordered | `POST /api/purchases/:id/order` | ✅ | ❌ | ✅ | ❌ |
| Receive goods (→ lot) | `POST /api/receive-goods` | ✅ | ❌ | ✅ | ❌ |
| Distribute (issue stock) | `POST /api/distribute` | ✅ | ✅ | ✅ | ❌ |
| Confirm distribution | `POST /api/distribute/:id/confirm` | ✅ | ✅ | ✅ | ❌ |
| Record waste | `POST /api/waste-with-lot` | ✅ | ✅ | ✅ | ❌ |
| Import items (Excel) | `POST /api/import-items` | ✅ | ✅ | ✅ | ✅* |
| Export (all tabs) | `GET /api/export/*` | ✅ | ✅ | ✅ | ✅ |
| Fetch attachments | `GET /api/attachments/...` | ✅ | ✅ | ✅ | ✅ |
| View stock / lots / reports / analytics | GET endpoints | ✅ | ✅ | ✅ | ✅ |
| **Clear all data** | `POST /api/clear-all` | ✅ | ❌ | ❌ | ❌ |

> * `/api/import-items` currently only requires `authRequired` (no role guard). **Verify** — likely an oversight. OBSERVERs should probably not be able to import. Flag for review.

### UI enforcement layer

`src/App.jsx` mirrors this matrix as `isAdmin`, `canManageUsers`, `canModifyInventory`, `canCreateRequest`, etc. Treat the UI flags as *hints* — the **server middleware is authoritative**.

## 3. Core business processes

### 3.1 Purchase request lifecycle (confirmed)

```
          (canRequest)                (canApprove)            (canOrder)                (canOrder)
request ──────────────► TALEP_EDILDI ──approve──► ONAYLANDI ──order──► SIPARIS_VERILDI ──receive──► KISMI_TESLIM
                              │                                                               │
                              │                                              full receipt ────┼────► TESLIM_ALINDI
                              ▼
                         (canReject)
                         REDDEDILDI
```

- Role ownership:
  - **Create request**: ADMIN / SATINAL / SATINAL_LOJISTIK.
  - **Approve**: ADMIN / SATINAL.
  - **Reject**: ADMIN / SATINAL / SATINAL_LOJISTIK.
  - **Order**: ADMIN / SATINAL_LOJISTIK.
  - **Receive (creates lot)**: ADMIN / SATINAL_LOJISTIK.
- `IPTAL` (cancel) exists as a status but no endpoint was found — **verify**.
- `purchases.receivedQtyTotal` drives `KISMI_TESLIM` vs `TESLIM_ALINDI`.

### 3.2 FEFO consumption (confirmed — `POST /api/consume`)

Priority when a lot is not explicitly chosen:
```sql
ORDER BY
  CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END,
  expiryDate ASC,
  receivedDate ASC
FOR UPDATE
```
- Iterates lots, deducts, flips `status='DEPLETED'` when `currentQuantity <= 0`.
- Writes one `usage_records` row per lot touched.
- Transactional.

### 3.3 Distribution (confirmed — `POST /api/distribute`)

- Input: `{ itemId, quantity, receivedBy, department, purpose, useFefo=true, lotId? }`.
- Creates a `distributions` row with `status='PENDING'`.
- Splits quantity across lots via FEFO (or single lot if `lotId` given) → writes `distribution_lots` + `usage_records` + decrements `lots.currentQuantity`.
- `POST /api/distribute/:id/confirm` flips status to `COMPLETED`.

### 3.4 Goods receipt (confirmed — `POST /api/receive-goods`)

- Links a receipt event to a `purchase` and creates (or updates) a `lot`.
- Updates `purchases.receivedQtyTotal` → drives `KISMI_TESLIM` / `TESLIM_ALINDI`.
- Transactional. Verify edge cases (over-receive, partial receive, multiple receipts per purchase).

### 3.5 Waste / disposal (confirmed — `POST /api/waste-with-lot`)

- Input: `{ itemId, lotId, quantity, wasteType, reason, disposalMethod, notes }`.
- Deducts from the specified lot; writes `waste_records`.
- Requires `canDistribute`.

### 3.6 Physical counting (confirmed schema; verify endpoints)

- `counting_schedules` store recurring/ad-hoc plans.
- `counting_records` store counted vs. expected with `variance`.
- No dedicated POST endpoints were surfaced in the first-pass scan. **Verify**.

### 3.7 User lifecycle (confirmed)

- First-run: `/api/auth/bootstrap` creates ADMIN. Subsequent users: `/api/users` (admin-only).
- Password rules: min 8 chars on create/update/change-password.
- Username is unique.

### 3.8 Excel import (confirmed — `POST /api/import-items`)

- Payload: `{ items: [...] }` built by `src/utils/lotExcelImporter.buildLotImportPayload`.
- May create item definitions and initial lots in one pass.
- **Memory convention** (verify): legacy imports use `LEGACY-STOK` lot for real stock and `HISTORICAL` lots with `currentQuantity=0, status=DEPLETED` for lot-number traceability.

### 3.9 Reporting / analytics

- `GET /api/analytics/overview` aggregates for the dashboard.
- `GET /api/reports/{stock-summary|expiry|low-stock|department-stock}` — domain-specific rollups.
- `GET /api/export/*` — used by the Excel export buttons.

## 4. Domain rules encoded in code

- **Chemical incompatibility pairs** (`src/labUtils.js`):
  - ACID × BASE
  - OXIDIZER × FLAMMABLE
  - OXIDIZER × REACTIVE
  - ACID × REACTIVE
- **Expiry tiers** (`getExpiryStatus`): `EXPIRED` (`days<0`), `EXPIRES_TODAY` (0), `CRITICAL` (≤7), `WARNING` (≤30), `ATTENTION` (≤90), `GOOD` (>90).
- **Departments** (`DEPARTMENTS`): `Cytogenetic`, `Molecular`, `Numune Kabul`, `Diğer`.
- **Storage temperatures** (`STORAGE_TEMPS`): RT, Fridge +2/+8, Freezer -20, Ultra -80, Dark.
- **Low-stock rule**: `availableStock < minStock` → status `SATIN_AL`.
- **Near-expiry rule**: nearest `expiryDate` within 30 days → status `SKT_YAKIN`.
