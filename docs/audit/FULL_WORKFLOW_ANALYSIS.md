# FULL_WORKFLOW_ANALYSIS

> End-to-end business process narrative for `lab-equipment-tracker`, grounded in
> `server/index.js`, migrations, and `src/App.jsx`. Confidence labels follow the
> audit brief.

## Section 6 — Full Workflow Narrative

`Confirmed` unless stated otherwise.

### Entry point (every role)

1. User opens the SPA (Vite dev or static build). `App.jsx` calls
   `GET /api/auth/me` on mount (`@c:\Users\STREAM\Desktop\order tracking\docs\07-data-flow-and-lifecycle.md:5-23`).
2. If the DB has **zero users**, the frontend shows a **bootstrap** form and
   posts to `POST /api/auth/bootstrap` — this creates the first `ADMIN`
   (`@c:\Users\STREAM\Desktop\order tracking\server\index.js:217-241`). The
   endpoint refuses to run once any admin already exists.
3. Otherwise: a login form → `POST /api/auth/login` → JWT stored in
   `localStorage['auth_token']` and sent as `Authorization: Bearer …` on every
   subsequent request.
4. On success, `apiFetch` loads the active tab's data. Initial tab is **Stok**
   (unified stock) for all roles.

### Master-data creation (item definitions)

5. ADMIN / SATINAL / SATINAL_LOJISTIK can add an item via the "Yeni Malzeme
   Ekle" form (`src/App.jsx` AddItemFormLab section, gated by
   `canModifyInventory` at `src/App.jsx:1451`). The form posts to
   `POST /api/item-definitions` (`server/index.js:610-632`). OBSERVER cannot
   see this form.
6. Alternatively, ADMIN can **Excel-import** a whole batch of items + initial
   lots via `POST /api/import-items` (`server/index.js:1679-1880`). For legacy
   imports, the convention is one `LEGACY-STOK` lot per item for carrying real
   stock plus `HISTORICAL` `DEPLETED` lots to preserve lot-number traceability
   (`@c:\Users\STREAM\Desktop\order tracking\docs\06-domain-logic.md:127`).

### Stock lifecycle per item

7. Each `item_definition` row has **aggregated stock** computed on-the-fly from
   its `lots` (`SUM(currentQuantity)` with filters). The app **never stores**
   `totalStock` (`@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:82`).
8. Derived UI status (from views + client): `STOKTA`, `SATIN_AL` (below
   `minStock`), `STOK_YOK` (zero), `SKT_YAKIN` (expiry ≤30 days), `SKT_GECMIS`
   (expired) — `@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:69-70, 145-146`.

### Purchase cycle

9. A lab user (ADMIN / SATINAL / SATINAL_LOJISTIK) creates a **purchase
   request** for an item: `POST /api/purchases` → row with
   `status = 'TALEP_EDILDI'` and `requestNumber = 'REQ-' + last-6-digits-of-ms`
   (`server/index.js:1381-1409`). OBSERVER blocked.
10. A purchasing approver (ADMIN or SATINAL) reviews **Talep** tab entries and
    calls `POST /api/purchases/:id/approve` → `ONAYLANDI` (sets
    `approvedBy`, `approvedAt`, `approvalNote`) **or**
    `POST /api/purchases/:id/reject` → `REDDEDILDI` (requires a
    `rejectionReason`). `server/index.js:1438-1484`.
11. A logistics operator (ADMIN or SATINAL_LOJISTIK) picks up approved
    requests and calls `POST /api/purchases/:id/order` with
    `supplierName`, `poNumber?`, `orderedQty` → `SIPARIS_VERILDI`
    (`server/index.js:1487-1512`).
12. When goods physically arrive, the same logistics operator calls
    `POST /api/receive-goods` with `purchaseId, receivedQty, lotNumber,
    expiryDate, …` (`server/index.js:1138-1265`). This is transactional and:
    - `INSERT` (or `UPDATE`) a `lots` row (`status='ACTIVE'`, `currentQuantity
      = receivedQty`).
    - `INSERT` into `receipts` linking `purchaseId` + `lotId`.
    - `UPDATE purchases` setting `receivedQtyTotal`, and pushing status to
      `KISMI_TESLIM` (partial) or `TESLIM_ALINDI` (fully received).
13. `IPTAL` ("cancel") is declared as a valid status but no endpoint issues it
    (`@c:\Users\STREAM\Desktop\order tracking\docs\06-domain-logic.md:75`).
    `Likely but not fully confirmed` — may be used by a legacy UI path; treat
    as unimplemented.

### Outflow cycle (distribution / FEFO consumption)

14. ADMIN / SATINAL / SATINAL_LOJISTIK issue stock via `POST /api/distribute`
    with `{ itemId, quantity, receivedBy, department, purpose, useFefo=true,
    lotId? }` (`server/index.js:1269-1362`). Inside one transaction:
    - Insert `distributions` with `status='PENDING'`.
    - `SELECT lots … ACTIVE AND currentQuantity>0` ordered **expiry-null-last,
      expiryDate ASC, receivedDate ASC** `FOR UPDATE` (FEFO).
    - Loop: deduct `currentQuantity`, flip to `DEPLETED` when zero, write a
      `distribution_lots` row and a `usage_records` row per lot touched.
15. `POST /api/distribute/:id/confirm` → `COMPLETED`. No UI path for
    `CANCELLED` was located — `Likely but not fully confirmed`.

### Waste

16. `POST /api/waste-with-lot` with `{ itemId, lotId?, quantity, wasteType,
    reason, disposalMethod }` (`server/index.js:1559-1640`). `wasteType ∈
    {EXPIRED, DAMAGED, CONTAMINATED, EXCESS, OTHER}`. Transactional, deducts
    the lot, and inserts a `waste_records` row.

### Manual adjustments

17. `POST /api/lot-adjustments` with `{ lotId, adjustmentType ∈ {CORRECTION,
    DAMAGE, FOUND, LOSS, TRANSFER, OTHER}, quantityChange (signed), reason }`
    (`server/index.js:916-955`). Writes a signed delta to `lots` and a row to
    `lot_adjustments`. `UI evidence only` for whether a dedicated UI exists —
    the server endpoint exists; no explicit UI form was located.

### Physical counting

18. `counting_schedules` + `counting_records` tables exist. No POST endpoints
    were surfaced in the first-pass scan (`@c:\Users\STREAM\Desktop\order tracking\docs\06-domain-logic.md:111-115`).
    `Partial / Incomplete` — schema only.

### Reporting / export

19. `GET /api/analytics/overview` feeds the dashboard; `GET /api/reports/*`
    (stock-summary, expiry, low-stock, department-stock) and
    `GET /api/export/*` (purchases, receipts, distributions, waste, usage,
    stock) are available to **every authenticated role**, including
    OBSERVER — by design.

### Admin operations

20. `ADMIN` manages users (`POST/PATCH /api/users*`), can hard-delete item
    definitions (cascades to lots / usage / distribution_lots / lot_adjustments;
    `@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:77-81`),
    and can wipe the DB via `POST /api/clear-all` (`server/index.js:2161`).

### Audit / history

21. A generic `audit_log` table exists. First-pass search found **no INSERT**
    into it from runtime code (`@c:\Users\STREAM\Desktop\order tracking\docs\00-project-overview.md:102`).
    `Unclear` — schema only.

---

## Section 5 — Main Entities summary (who touches what)

`Confirmed`.

| Entity | Creation by | Update by | Read by | Deletion | Notes |
|---|---|---|---|---|---|
| `item_definitions` | ADMIN / SATINAL / SATINAL_LOJISTIK (plus import by same roles, UI gates OBSERVER) | Same as create | All | ADMIN only | Cascades lots on delete |
| `lots` | ADMIN / SATINAL / SATINAL_LOJISTIK, or indirectly via `/receive-goods` (ADMIN/SATINAL_LOJISTIK) or `/import-items` | Same as create | All | Via parent item delete; **no dedicated `DELETE /api/lots/:id`** endpoint found | `Gap G-7` — verify |
| `purchases` | ADMIN / SATINAL / SATINAL_LOJISTIK (`canRequest`) | State transitions by approvers / orderers; body fields only set by their respective endpoints | All | **No delete endpoint found** | `Gap G-8` |
| `receipts` | ADMIN / SATINAL_LOJISTIK (via `/receive-goods`) | — | All | Cascade from `purchases` | Event log |
| `distributions` + `distribution_lots` | ADMIN / SATINAL / SATINAL_LOJISTIK | Confirm via `/confirm`; **no dedicated cancel endpoint found** | All | Via cascade | `CANCELLED` status unreachable |
| `usage_records` | Auto (by consume / distribute / receive) | — | All via `GET /api/usage-records` | Cascade | Ledger |
| `waste_records` | ADMIN / SATINAL / SATINAL_LOJISTIK | — | All | SET NULL on lot deletion | |
| `lot_adjustments` | ADMIN / SATINAL / SATINAL_LOJISTIK | — | — (no GET endpoint visible) | Cascade | `Gap G-9` |
| `counting_schedules` / `counting_records` | ? | ? | ? | ? | `Partial / Incomplete` — no POST/PUT endpoints found |
| `attachments` | Various upload sites (receipt, lot) | — | All | Cascade | 5 MB body cap |
| `audit_log` | — (no writes found) | — | — | — | `Unclear` |
| `users` | ADMIN (except first: bootstrap) | ADMIN | ADMIN (list), self (via `/auth/me`) | ⚠ **no delete endpoint** — ADMIN can only change role/username/password | `Gap G-10` |

---

## Handoff summary across roles

`Confirmed`.

| Stage | Origin role | Destination role | Trigger | Evidence |
|---|---|---|---|---|
| Item master add | Any non-observer | (stays with creator) | `POST /api/item-definitions` | `server/index.js:610` |
| Request | Any non-observer | `canApprove` (ADMIN / SATINAL) | Row status = `TALEP_EDILDI` | `server/index.js:1381-1409` |
| Approve | ADMIN / SATINAL | `canOrder` (ADMIN / SATINAL_LOJISTIK) | Row status = `ONAYLANDI` | `server/index.js:1438` |
| Order | ADMIN / SATINAL_LOJISTIK | same (waits for physical delivery) | Row status = `SIPARIS_VERILDI` | `server/index.js:1487` |
| Receive | ADMIN / SATINAL_LOJISTIK | — (stock now available) | `KISMI_TESLIM` or `TESLIM_ALINDI` + new lot | `server/index.js:1138` |
| Distribute | ADMIN / SATINAL / SATINAL_LOJISTIK | — | `distributions` row + lot deductions | `server/index.js:1269` |
| Waste | ADMIN / SATINAL / SATINAL_LOJISTIK | — | `waste_records` + lot deduction | `server/index.js:1559` |

---

## Special-case analysis

| Topic | Status | Evidence |
|---|---|---|
| **Draft vs submitted** | Not modelled. A purchase is born `TALEP_EDILDI`; no "draft" column exists. `Confirmed`. | `server/index.js:1397` forces status. |
| **Saved vs finalized** | For **distributions**, yes: `PENDING` after create, `COMPLETED` after `/confirm`. `Confirmed`. | `server/index.js:1269, 1365` |
| **Created vs approved** | For **purchases**: `TALEP_EDILDI` vs `ONAYLANDI`. `Confirmed`. | Above |
| **Edited vs versioned** | No versioning of any entity. `Confirmed` (search shows no `version`/`revision` columns). | Schema inspection |
| **Soft vs hard delete** | Only hard deletes via `DELETE /api/item-definitions/:id` and `POST /api/clear-all`. No `deletedAt` columns found. `Confirmed`. | `docs/05-database-model.md` |
| **Visible vs actionable** | UI hides some actions (e.g., Sipariş tab hidden from SATINAL_LOJISTIK). Backend still allows the action. `Confirmed`. | `src/App.jsx:158` + `server/index.js:1487` |
| **Reopen an item** | Purchases cannot be reopened — no endpoint resets status. `Confirmed` as absence-of-feature. | Route grep |
| **Reassign** | No assignment model. Everything is actor-stamped on each transition (`approvedBy`, `orderedBy`). `Confirmed`. | Schema |
| **Reject & return** | `REDDEDILDI` is terminal. No endpoint sends it back to `TALEP_EDILDI`. `Confirmed`. | Route grep |
| **Duplicate / copy** | No duplicate endpoint. `Confirmed`. | Route grep |
| **Export** | Yes, `/api/export/*`. `Confirmed`. | `docs/04-backend-and-api.md:71-77` |
| **History / audit trail** | `usage_records`, `receipts`, `distribution_lots`, `waste_records`, `lot_adjustments` act as activity logs; the generic `audit_log` appears unused. `Likely but not fully confirmed`. | `docs/00-project-overview.md:102` |
| **Different role views of same item** | Roles see the same data; only the action buttons differ. `Confirmed`. | `src/App.jsx` CTA gating |
