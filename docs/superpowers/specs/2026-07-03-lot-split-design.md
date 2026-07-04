# LOT Bölme (Lot Split) — Design

**Date:** 2026-07-03
**Status:** Approved for planning

## Problem

Stock is sometimes entered as a single `lots` row with a single quantity and a single SKT
(expiry date), when in reality that quantity spans multiple physical batches with different
lot numbers and different expiry dates. There is currently no way to correct this after the
fact — an admin can only edit a lot's fields in place (`PUT /api/lots/:id`), not divide its
quantity into several independently tracked lots.

## Goal

Give admins a UI action to split one lot's `currentQuantity` into N new lots, each with its
own lot number and SKT (e.g. 10 units in LOT-X → 4 in LOT-X1, 3 in LOT-X2, 3 in LOT-X3). The
item's total stock is unaffected — it is always the sum of `currentQuantity` across that
item's `ACTIVE` lots, so splitting one lot into several never changes what's shown as the
item's total.

## Decisions (from stakeholder Q&A)

- **Full split only.** Split quantities must sum to exactly the lot's current `currentQuantity`.
  No partial splits that leave a remainder behind under the original lot number.
- **Original lot closes out.** After a split, the original lot's `currentQuantity` becomes `0`
  and its `status` becomes `DEPLETED`. It is not deleted — existing `usage_records` /
  `distribution` history that reference its `lotId` remain valid and readable.
- **Every resulting quantity becomes a brand-new lot row**, each with its own `id`, `lotNumber`,
  and `expiryDate`. There is no "the first split keeps the old lot number" special case — this
  keeps the audit trail unambiguous (a lot row always represents one physical batch).
- **No history guard.** Splitting is allowed regardless of whether the lot has prior
  consumption/distribution history against it. It operates on whatever `currentQuantity`
  remains right now. (CEP DEPO consumption doesn't track back to specific lots, so this is a
  non-issue in practice.)
- **Per-split fields:** `lotNumber` and `expiryDate` are set explicitly per row (these are the
  two things that differ between physical batches). All other lot fields (manufacturer,
  catalogNo, receivedDate, department, location, storageLocation, invoiceNo, attachment,
  notes) are copied from the original lot — no per-row override UI for these in v1.
- **Admin-only.** This is a data-correction action, not a routine distribution — restricted to
  `ADMIN`, matching the existing `unit-stock-correction` precedent.

## Backend

### `POST /api/lots/:id/split`

- Middleware: `authRequired, adminRequired` (same tier as
  `POST /api/item-definitions/:id/unit-stock-correction`).
- Body: `{ splits: [{ lotNumber, expiryDate, quantity }, ...] }`

Inside `withTransaction`:

1. `SELECT * FROM lots WHERE id = ? FOR UPDATE`. 404 `LOT_NOT_FOUND` if missing.
2. 400 `LOT_NOT_ACTIVE` unless `status === 'ACTIVE' && currentQuantity > 0`.
3. 400 `INVALID_INPUT` unless `splits.length >= 2`, every `lotNumber` is a non-empty string,
   and every `quantity` is a positive integer.
4. 400 `SPLIT_QUANTITY_MISMATCH` unless `sum(splits.quantity) === lot.currentQuantity` exactly.
5. For each split, `INSERT INTO lots` — new `id` (generateId()), same `itemId`, `manufacturer`,
   `catalogNo`, `receivedDate`, `department`, `location`, `storageLocation`, `invoiceNo`,
   `attachmentUrl`, `attachmentName`, `notes` as the original; `lotNumber` / `expiryDate` /
   `initialQuantity` / `currentQuantity` from the split row; `status = 'ACTIVE'`;
   `createdBy = req.user.username`.
   - The existing `uniq_item_lot (itemId, lotNumber)` constraint is the backstop against
     duplicate lot numbers for this item — catch `ER_DUP_ENTRY` → 409 `DUPLICATE_LOT`
     (same pattern as `POST /api/lots`).
6. `UPDATE lots SET currentQuantity = 0, status = 'DEPLETED', updatedBy = ? WHERE id = ?` on
   the original.
7. `INSERT INTO lot_adjustments (id, lotId, adjustmentType, quantityChange, reason, adjustedBy, notes)`
   for the original lot: `adjustmentType = 'TRANSFER'`, `quantityChange = -<original currentQuantity>`,
   `reason = 'LOT bölündü'`, `notes` listing the new lot numbers and quantities
   (e.g. `"LOT-X1 (4), LOT-X2 (3), LOT-X3 (3)"`). Reuses the existing `lot_adjustments` table
   and its already-wired `TRANSFER` enum value — no schema change.
8. Return `{ originalLot, newLots: [...] }` (re-fetch rows after the transaction commits).

No other endpoint or query needs to change: `totalStock`/`activeLotCount` aggregates already
`SUM`/`COUNT` over `status = 'ACTIVE'` lots, so the depleted original drops out and the new
lots are picked up automatically.

## Frontend (`src/LotInventory.jsx`)

- In the per-item expanded "LOT Detayları" table (~line 307), add an "İşlem" column with a
  "Böl" button per lot row, rendered only when `lot.status === 'ACTIVE' && lot.currentQuantity > 0
  && currentUser.role === 'ADMIN'`.
- New state: `showSplitLotForm` (holds the lot being split) and `splitRows`
  (array of `{ lotNumber, expiryDate, quantity }`, initialized with 2 empty rows).
- Modal: one row per split with LOT No / SKT / Miktar inputs, "+ Satır Ekle" to append a row,
  a remove button per row (minimum 2 rows enforced in the UI).
- Live remainder indicator: `Kalan: <lot.currentQuantity - sum(splitRows.quantity)> / <lot.currentQuantity>`,
  styled green when the remainder is exactly `0`, red otherwise. Submit button disabled unless
  the remainder is `0` and every row has a non-empty `lotNumber` and positive `quantity`.
- On submit: `apiCall('/lots/' + lot.id + '/split', { method: 'POST', body: JSON.stringify({ splits: splitRows }) })`
  using the file's existing local `apiCall` wrapper (this file does not go through `src/api.js`;
  that migration is tracked separately and out of scope here).
- On success: replace the original lot in local `lots` state with the returned `originalLot`
  (now `DEPLETED`, qty 0) and append `newLots`; close the modal. Item-level `totalStock` /
  `activeLotCount` in `itemDefinitions` do not need adjusting — the sum is unchanged.
- Errors surfaced via the existing `alert('Hata: ' + err.message)` convention used elsewhere
  in this file.

## Out of scope (v1)

- Per-split override of manufacturer/catalogNo/storageLocation/department — always inherited
  from the original lot.
- Splitting `EXPIRED` or `QUARANTINE` lots.
- Migrating `LotInventory.jsx`'s local `apiCall` to `src/api.js` (tracked separately in
  CLAUDE.md's known issues).
- Undo/merge-back-together action.

## Testing

- Split a 10-unit lot into 4/3/3 → verify 3 new `ACTIVE` lots with correct quantities/SKTs,
  original lot `DEPLETED` with `currentQuantity = 0`, item total stock unchanged.
- Attempt a split where quantities sum to 9 or 11 (not 10) → expect `SPLIT_QUANTITY_MISMATCH`,
  no rows written (transaction rollback).
- Attempt with a duplicate `lotNumber` already used by that item → expect `DUPLICATE_LOT`.
- Attempt as a non-admin role → expect 403.
- Attempt splitting a `DEPLETED` or `EXPIRED` lot → expect `LOT_NOT_ACTIVE`.
- Verify `lot_adjustments` row is written for the original lot with the correct negative
  `quantityChange`.

## Change log

`updates/UPDATE_2026-07-03_lot-split.md` per CLAUDE.md rule 5 — summary, files touched
(`server/index.js`, `src/LotInventory.jsx`), DB changes (none — reuses `lot_adjustments`),
rollback (no schema change, so rollback is just reverting the two source files), test steps,
risks.

## Addendum (2026-07-04) — keep one portion under the original lot number

Real usage (admin tried to split 10 into 4 under the *existing* lot number + 3 + 3) revealed
that the "every split is a brand-new lot number" rule from the original design was too rigid —
admins commonly want to keep the majority of the quantity under the lot's existing number and
only carve off the pieces with a different SKT. The `409 DUPLICATE_LOT` error this produced was
also a documented known risk in the original design (see "Risks" in the change log) that turned
out to matter in practice.

**Revised rule:** exactly one split row *may* reuse the original lot's own `lotNumber`. When it
does:
- That row's `expiryDate` (if any was submitted) is ignored — the original lot keeps its own
  SKT, since a lot number can't span two expiry dates.
- The route `UPDATE`s the original lot's `currentQuantity` to that row's quantity and leaves
  `status = 'ACTIVE'` (instead of closing it out to `DEPLETED`/qty 0).
- All other rows behave exactly as before: brand-new lot rows with their own number/SKT.
- If no row reuses the original's number, behavior is unchanged from the original design (full
  close-out).
- Two rows both claiming the original's number is still rejected — the existing "duplicate lot
  number within one request" check in `validateLotSplit` already catches this for free, since it
  treats every lot number in the request uniformly (no special-casing needed in the validator).
- The `lot_adjustments` audit entry's `quantityChange` reflects only the quantity that actually
  left the original lot (`originalQuantity - keptQuantity`), not the full original quantity.

Frontend: the split modal shows a hint that typing the original lot number into a row keeps
that portion under it, and for that specific row the SKT field auto-fills with (and disables
editing of) the original's own expiry date.

No backend validator changes were needed — `validateLotSplit` never inspected the original
lot's `lotNumber` in the first place, so this is entirely a routing change in
`POST /api/lots/:id/split` (which row becomes an `UPDATE` vs `INSERT`) plus the frontend hint.
