# EXISTING_ITEM_PROCESS

> How an already-existing item is found, reviewed, edited, transitioned, and
> finalised. Covered per entity.

## Section 8 — Detailed Numbered Steps

### 8.A. Existing **purchase request** lifecycle

`Confirmed` from `@c:\Users\STREAM\Desktop\order tracking\server\index.js:1412-1512, 1138-1265`.

1. **Finding it.** Any authenticated user calls `GET /api/purchases`
   (`server/index.js:1412`) which returns every purchase plus its linked
   `receipts`. The UI list is on the "Talep" tab (hidden from OBSERVER via
   `canViewTalep`).
2. **Who can view it.** All roles, OBSERVER included. No row-level filter by
   department / requester is applied.
3. **Who can edit it.** There is **no generic `PUT /api/purchases/:id`**
   endpoint. The only mutations are status-transition endpoints:
   - `POST /api/purchases/:id/approve` → `canApprove` (ADMIN, SATINAL).
     Requires nothing in the body; optional `approvalNote`. Sets
     `approvedBy`, `approvedAt`, `approvedDate`, `approvalNote`, `status =
     ONAYLANDI`. Works only if the client sends from a row currently in
     `TALEP_EDILDI` — **but the server does not guard against idempotent
     re-approval**: calling `/approve` on a row already in `ONAYLANDI` or
     even `REDDEDILDI` will succeed and overwrite the status. `Likely but
     not fully confirmed` — see Gap G-12.
   - `POST /api/purchases/:id/reject` → `canReject` (ADMIN, SATINAL,
     SATINAL_LOJISTIK). Requires body `rejectionReason`. Sets
     `rejectedBy`, `rejectedDate`, `rejectionReason`, `status=REDDEDILDI`.
   - `POST /api/purchases/:id/order` → `canOrder` (ADMIN,
     SATINAL_LOJISTIK). Requires `supplierName` and `orderedQty>0`. Sets
     `orderedBy`, `orderedAt`, `supplierName`, `poNumber`, `orderedQty`,
     `status=SIPARIS_VERILDI`. Same idempotency caveat.
   - `POST /api/receive-goods` → `canOrder`. Increments `receivedQtyTotal`
     and pushes status to `KISMI_TESLIM` or `TESLIM_ALINDI` depending on
     totals. Creates / updates a `lots` row and inserts a `receipts`
     row.
4. **Who can comment / review.** No explicit "comment" or "review" model.
   `approvalNote`, `rejectionReason`, `notes` are the only textual fields
   preserved per stage.
5. **Which fields become locked.** `requestedQty`, `itemId`, `department`,
   `urgency`, `notes` are set at creation and never updated by any route.
   They are effectively locked once the request is submitted.
6. **What depends on status.**
   - Approve/reject UI buttons appear only while status is `TALEP_EDILDI`
     (`src/App.jsx` Talep section conditional render — `UI evidence only`).
   - Order button appears only after `ONAYLANDI`.
   - Receive button appears only after `SIPARIS_VERILDI`.
   - Backend does not re-check prior status before transitioning; the gate
     is the UI only.
7. **Re-open possibility.** None. No endpoint pushes status backward.
   `REDDEDILDI`, `IPTAL`, and `TESLIM_ALINDI` are terminal in practice.
8. **Versioning.** None — each PATCH-like transition overwrites in place.
9. **Post-update effects.** After `/receive-goods`:
   - A `lots` row is created or updated with the received qty, starting
     `ACTIVE`.
   - A `receipts` row is inserted.
   - `usage_records` is **not** written at receipt time (usage is only on
     consume/distribute — `Confirmed` by endpoint inspection).
10. **Export / reporting.** `GET /api/export/purchases` emits current
    rows, filterable by `?status=`. Any role can call it.
11. **Delete / archive.** `Gap G-8` — no `DELETE /api/purchases/:id`
    endpoint exists. Destructive cleanup only via `POST /api/clear-all`
    (ADMIN) or manual SQL.

### 8.B. Existing **item definition**

`Confirmed` from `server/index.js:568-683`.

1. **Finding it.** `GET /api/item-definitions` (list + aggregates),
   `GET /api/item-definitions/:id` (one + lots), or the unified list
   `GET /api/unified-stock`.
2. **Who can view it.** All roles.
3. **Who can edit it.** ADMIN / SATINAL / SATINAL_LOJISTIK via
   `PUT /api/item-definitions/:id`. Backend protection is `authRequired`
   only, so OBSERVER could call it directly — `Likely partial`, filed as
   Gap G-1. UI correctly hides the edit button from OBSERVER.
4. **Updatable fields** (`server/index.js:635-668`): `code`, `name`,
   `category`, `department`, `unit`, `minStock`, `ideal_stock`,
   `max_stock`, `supplier`, `catalogNo`, `brand`, `storageLocation`,
   `storageTemp`, `chemicalType`, `msdsUrl`, `notes`, `status`.
   `COALESCE(?, column)` is used so passing `NULL` preserves the existing
   value. **`status` can be changed to any string** — no enum check at
   app layer.
5. **Locked fields.** `id`, `createdBy`, `createdAt` — no update path.
6. **Status transitions.** No dedicated endpoint; `status` is a free column
   updated via the generic PUT. `INACTIVE`/`DISCONTINUED` are names only;
   nothing in the stock math or business rules references them — `Likely
   cosmetic`.
7. **Delete.** `DELETE /api/item-definitions/:id`, ADMIN only, **hard
   delete**. Inside a transaction it `DELETE FROM lots WHERE itemId=?`
   then `DELETE FROM item_definitions …`. Cascades reach `usage_records`,
   `distribution_lots`, `lot_adjustments`. **Restrict** FKs from
   `purchases`, `distributions`, `waste_records` (so the delete fails if
   historical rows reference this item) — `Confirmed` from
   `@c:\Users\STREAM\Desktop\order tracking\docs\05-database-model.md:77-81`.

### 8.C. Existing **lot**

`Confirmed` from `server/index.js:687-781, 916-955`.

1. **Finding it.** `GET /api/lots` with `?itemId`, `?status`, or
   `?expiringSoon=true`; or drill-down via
   `GET /api/unified-stock/:itemId/lots`.
2. **Who can view it.** All roles.
3. **Who can edit metadata.** ADMIN / SATINAL / SATINAL_LOJISTIK via
   `PUT /api/lots/:id` (same `authRequired`-only + UI gate pattern).
   Updatable: `lotNumber`, `manufacturer`, `catalogNo`, `expiryDate`,
   `department`, `location`, `storageLocation`, `invoiceNo`,
   `attachmentUrl`, `attachmentName`, `notes`, `status`. `status` is a
   free string, so one could set `'EXPIRED'` or `'QUARANTINE'` directly
   from the UI — `Confirmed` as intended functionality.
4. **Who can change quantity.** `POST /api/lot-adjustments` (signed
   `quantityChange`) or indirectly:
   - `POST /api/consume` (decrements; optional lotId).
   - `POST /api/distribute` (decrements via FEFO or specific lotId).
   - `POST /api/waste-with-lot` (decrements).
   - `POST /api/receive-goods` (can UPDATE an existing lot if `(itemId,
     lotNumber)` already matches).
5. **Automatic side effects.** When `currentQuantity` reaches `<= 0`, the
   SQL flips `status = 'DEPLETED'` in the same UPDATE — `Confirmed`
   (`server/index.js:786-872, 1269-1362, 1559-1640`).
6. **Locked once.** `id`, `itemId`, `createdAt`, `createdBy`,
   `initialQuantity`. (No endpoint rewrites `initialQuantity` except
   `/import-items` which also resets `currentQuantity` — that one does
   overwrite initialQuantity, so beware during re-imports.)
7. **Delete.** No dedicated `DELETE /api/lots/:id` endpoint. Lots are
   purged only via parent item deletion or `POST /api/clear-all`. Gap
   G-7.

### 8.D. Existing **distribution**

`Confirmed` from `server/index.js:1269-1378`.

1. Finding it: `GET /api/distributions` / `/distributions-detailed`.
2. Visible to all roles.
3. Edit: none. The only action is `POST /api/distribute/:id/confirm`,
   which flips status `PENDING → COMPLETED` and stamps `completedBy`,
   `completedDate`.
4. Cancel / rollback: `CANCELLED` is in the enum but no endpoint issues
   it. Gap G-13.
5. Effect of confirm: informational only (no stock changes; stock was
   already decremented at `POST /api/distribute` time).

### 8.E. Existing **waste record**, **usage record**, **adjustment**

- `waste_records`, `usage_records`, `lot_adjustments` are **immutable
  ledgers**. No UPDATE or DELETE endpoints exist. `Confirmed`.

### 8.F. Existing **user**

`Confirmed` from `server/index.js:243-291`.

- ADMIN can `PATCH /api/users/:id` to change `username`, `role`, and/or
  `password` (min 8 chars enforced; username unique enforced).
- Self-service: any user can change their own password via
  `POST /api/account/change-password`.
- No soft delete, no "disable user" — Gap G-10.
- `role` is validated server-side against the `INVALID_ROLE` set (Confirmed;
  see server/index.js around L260 where the role whitelist check lives).

---

## Which fields become locked by status — quick table

`Confirmed`.

| Entity | Status | Fields locked | Allowed actions in this status |
|---|---|---|---|
| `purchases` | `TALEP_EDILDI` | `itemId`, `requestedQty`, `department`, `urgency`, `notes`, `requestedBy/At` | Approve (ADMIN/SATINAL), Reject (same + SATINAL_LOJISTIK) |
| `purchases` | `ONAYLANDI` | everything from TALEP_EDILDI + `approvedBy/At/Date`, `approvalNote` | Order (ADMIN/SATINAL_LOJISTIK), Reject (⚠ endpoint doesn't block) |
| `purchases` | `SIPARIS_VERILDI` | above + `orderedBy/At`, `supplierName`, `poNumber`, `orderedQty` | Receive (ADMIN/SATINAL_LOJISTIK) |
| `purchases` | `KISMI_TESLIM` | same | Further receipts |
| `purchases` | `TESLIM_ALINDI` | all | (terminal, no endpoint moves it further) |
| `purchases` | `REDDEDILDI` | all | none (terminal) |
| `purchases` | `IPTAL` | all | none (no endpoint issues it — Gap G-6) |
| `lots` | `ACTIVE` | `id`, `itemId`, `initialQuantity` | Distribute, Waste, Adjustment, Update metadata |
| `lots` | `DEPLETED` | same | Auto-set when qty hits zero; FEFO skips it |
| `lots` | `EXPIRED` / `QUARANTINE` | same | Set manually via `/lots/:id` PUT; FEFO skips |
| `distributions` | `PENDING` | — | Confirm |
| `distributions` | `COMPLETED` | all | none (terminal) |
| `distributions` | `CANCELLED` | all | — (unreachable, Gap G-13) |
| `item_definitions` | `ACTIVE` | `id`, `createdAt/By` | Update, Delete (ADMIN), create lots, open purchase |
| `item_definitions` | `INACTIVE` / `DISCONTINUED` | same | Same as ACTIVE (status is cosmetic) |

---

## Role "view of the same item"

`Confirmed`.

- All roles see the **same row data** for purchases, items, lots, etc.
  There is no field-level redaction.
- What differs is the **set of action buttons** rendered on the detail
  panel, as dictated by `canApprove` / `canOrder` / `canReceive` /
  `canDistribute` / `canModifyInventory` / `canManageUsers` — see
  `@c:\Users\STREAM\Desktop\order tracking\src\App.jsx:146-158`.
