# NEW_ITEM_PROCESS

> How a brand-new "item" enters the system. This document treats two candidate
> "items" separately — **item master (`item_definitions`)** and **purchase
> request (`purchases`)** — because each has its own creation flow. A third
> creation path, **lot receipt (`lots` via `/receive-goods`)**, is the
> operational consequence of the purchase flow.

## Section 7 — Detailed Numbered Steps

### 7.A. Creating a new **item definition** (master SKU)

`Confirmed` from `@c:\Users\STREAM\Desktop\order tracking\server\index.js:610-632`
and `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:1451-1454`.

1. **Who can start it**: ADMIN, SATINAL, SATINAL_LOJISTIK. OBSERVER cannot see
   the "Yeni Malzeme Ekle" button (`canModifyInventory` gate at
   `src/App.jsx:149, 1451`).
2. **Where they start it**: main "Stok" tab → `AddItemFormLab` component.
3. **Required inputs** (from validation at `server/index.js:612-614`):
   - `code` (unique) — server returns `409 DUPLICATE_CODE` on conflict.
   - `name`.
4. **Optional inputs** (persisted as-is or `NULL`): `category`, `department`,
   `unit`, `minStock`, `ideal_stock`, `max_stock`, `supplier`, `catalogNo`,
   `brand`, `storageLocation`, `storageTemp`, `chemicalType`, `msdsUrl`,
   `notes`. Non-numeric strings for numeric fields are accepted — `Likely
   partial validation`.
5. **Default values**: `status = 'ACTIVE'`, `id = generateId()` (server-side),
   `createdAt = NOW()`, `createdBy = req.user.username`.
6. **Initial status**: `item_definitions.status = 'ACTIVE'` (the string
   literal is hard-coded in the INSERT; `UI evidence only` for
   INACTIVE/DISCONTINUED actually being set anywhere).
7. **Side effects**: none — **no lot is auto-created**. The item has
   `totalStock = 0` until a lot is added (manual or via receipt).
8. **Next owner**: creator. There is no approval / review step on item master.
9. **Next screen**: after the UI reloads `GET /api/unified-stock`, the item
   appears in the list with stock status `STOK_YOK` (zero-stock derived
   status).
10. **Notifications**: none — the codebase has no email / websocket / push
    channel.
11. **Save vs submit vs finalize**: not distinguished. A single POST persists
    the row in its final form.
12. **Irreversible**: only ADMIN can delete an item afterwards
    (`DELETE /api/item-definitions/:id`) and the delete cascades to lots and
    usage — `server/index.js:671-683`.

### 7.B. Creating a **bulk batch** of item definitions + lots via Excel

`Confirmed` from `server/index.js:1679-1880` and
`@c:\Users\STREAM\Desktop\order tracking\src\utils\lotExcelImporter.js`
(referenced in `docs/07-data-flow-and-lifecycle.md:125-138`).

1. Who can start it via UI: **ADMIN only** — the "Excel Yükle" button is
   gated by `isAdmin` at `src/App.jsx:1335`.
2. Who can hit the endpoint directly: **any authenticated user**
   (`authRequired` only). See Gap G-3.
3. Inputs: `{ items: Row[] }` where each row must have `code`, `name`, and
   `lotNumber`. Optional numeric/date fields are parsed via `parseDecimal` /
   `parseInteger` / `parseDate` helpers defined inline in `server/index.js`.
4. Behaviour per row:
   - If `code` already exists → UPDATE master fields (`server/index.js:1773-1798`).
   - Else → INSERT master row with `status='ACTIVE'`.
   - For the row's `lotNumber`: UPDATE if an `(itemId, lotNumber)` pair
     exists, else INSERT. Lot `status` = `'ACTIVE'` when `initialStock > 0`,
     else `'DEPLETED'` — this is the `LEGACY-STOK` vs `HISTORICAL`
     convention in the `converts/` migration scripts.
5. Errors are collected per row but do not fail the whole transaction; the
   response returns counters (`created`, `updated`, `lotsCreated`,
   `lotsUpdated`, `errors[]`). `Confirmed` by code path at `1713-1880`.

### 7.C. Creating a new **lot** manually

`Confirmed` from `server/index.js:721-750`.

1. Who: ADMIN / SATINAL / SATINAL_LOJISTIK via UI (OBSERVER blocked by
   `canModifyInventory`); server requires `authRequired` only (Gap G-11).
2. Required body: `itemId`, `lotNumber`, `initialQuantity > 0`.
3. Optional: `manufacturer`, `catalogNo`, `expiryDate`, `receivedDate`,
   `department`, `location`, `storageLocation`, `invoiceNo`, `attachmentUrl`,
   `attachmentName`, `notes`.
4. Defaults: `currentQuantity = initialQuantity`, `status='ACTIVE'`.
5. Uniqueness: server enforces `UNIQUE(itemId, lotNumber)` and returns
   `409 DUPLICATE_LOT` on conflict.
6. Side effects: none beyond the INSERT. The parent item's `totalStock`
   becomes `SUM(currentQuantity)` recomputed on read.

### 7.D. Creating a new **purchase request** (the business-critical "new item")

`Confirmed` from `server/index.js:1381-1409`.

1. Who starts it: ADMIN / SATINAL / SATINAL_LOJISTIK (`canRequest`).
   OBSERVER: blocked.
2. Where: "Talep" tab (visible to those three roles + ADMIN; hidden from
   OBSERVER via `canViewTalep` at `src/App.jsx:157`).
3. Required body:
   - `itemId` (must exist in `item_definitions`).
   - `requestedQty > 0`.
4. Optional body: `itemCode`, `itemName`, `department`, `notes`,
   `urgency ∈ {normal, urgent, critical}` (default `'normal'`),
   `supplierName`.
5. Defaults / generated values:
   - `id = generateId()`.
   - `requestNumber = 'REQ-' + Date.now().toString().slice(-6)` — **not
     guaranteed unique**; under heavy load the same 6-digit suffix could
     collide against the `UNIQUE(requestNumber)` constraint and return a DB
     error. `Likely but not fully confirmed` as a risk — verify.
   - `requestedAt = NOW()`, `requestDate = CURDATE()`.
   - `status = 'TALEP_EDILDI'` (hard-coded).
   - `requestedBy = req.user.username`, `orderedQty = requestedQty` (so a
     1:1 initial guess that will be overwritten at ordering time).
6. Initial status: **`TALEP_EDILDI`**. This is the only initial status the
   code path produces.
7. `itemCode` and `itemName` are **denormalized** onto the purchase row at
   creation time; later renames of the item master do not propagate
   (`@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:94-97`).
8. **Next owner / actor**: a user with `canApprove` (ADMIN or SATINAL).
9. **Next screen**: approver opens the Talep tab and either approves or
   rejects; see EXISTING_ITEM_PROCESS §8.A.
10. **Side effects at create time**: none. No stock is reserved; no lot is
    pre-created.
11. **Notifications**: none.
12. **Save vs submit vs finalize**: not distinguished — a single POST
    creates the row directly in `TALEP_EDILDI`. There is no "draft" state.
13. **Validations on the body**:
    - `itemId` presence and numeric `requestedQty > 0` — both enforced.
    - No FK validation at the application layer (relies on DB FK, which
      `lots`/`purchases` tables have on `itemId` — `docs/05-database-model.md`).
    - No validation that the item is `ACTIVE` (a request can be opened
      against any item, including `DISCONTINUED`). `Likely partial`.
14. **Error shapes**: `400 INVALID_INPUT`, `500 SERVER_ERROR`. Duplicate
    requestNumber would be a generic `SERVER_ERROR` since the code does not
    catch it explicitly — `Likely but not fully confirmed`.

---

## Quick field-by-field reference — new purchase request

`Confirmed`.

| Field | Required | Source | Default | Locked after create? |
|---|---|---|---|---|
| `id` | — | server `generateId()` | auto | yes |
| `requestNumber` | — | server `REQ-######` | auto | yes |
| `itemId` | ✅ | form | — | yes (no update endpoint re-assigns) |
| `itemCode`, `itemName` | optional | form / denormalized | `''` | yes |
| `department` | optional | form | `''` | — (not mutated by any endpoint) |
| `requestedQty` | ✅ | form | — | yes |
| `orderedQty` | — | server | `= requestedQty` | mutated by `/order` |
| `supplierName` | optional at request | form | `''` | mutated by `/order` |
| `poNumber` | — | — | `NULL` | set by `/order` |
| `notes` | optional | form | `''` | — |
| `urgency` | optional | form | `'normal'` | — |
| `status` | — | server | `'TALEP_EDILDI'` | transitions by endpoints only |
| `requestedBy` | — | server (JWT) | `req.user.username` | yes |
| `requestedAt`, `requestDate` | — | server | `NOW()`, `CURDATE()` | yes |
| `approvedBy`, `approvedAt`, `approvedDate`, `approvalNote` | — | set by `/approve` | `NULL` | — |
| `rejectedBy`, `rejectedDate`, `rejectionReason` | — | set by `/reject` | `NULL` | — |
| `orderedBy`, `orderedAt` | — | set by `/order` | `NULL` | — |
| `receivedQtyTotal` | — | updated by `/receive-goods` | `0` | incremented |
