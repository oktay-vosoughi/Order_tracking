# UPDATE 2026-07-03 — LOT Bölme (Lot Split)

## Summary
Admins can now split one lot's current quantity into multiple new lots, each with
its own lot number and SKT (expiry date), for cases where stock was originally
entered as a single lot but actually spans several physical batches. The item's
total stock is unaffected — it's always the sum of ACTIVE lots' currentQuantity.

## Files touched
- `server/lotSplit.cjs` (new) — pure validation for split requests
- `server/lotSplit.test.cjs` (new) — unit tests for the above
- `server/index.js` — new `POST /api/lots/:id/split` route (admin-only)
- `src/LotInventory.jsx` — "Böl" button + split modal in the per-item LOT detail table

## DB changes
None. Reuses the existing `lot_adjustments` table (`adjustmentType = 'TRANSFER'`)
for the audit trail — no migration required.

## Rollback
No schema change was made, so rollback is reverting the four files above to their
prior commit. Any lots already split remain valid (the original lot stays
DEPLETED with quantity 0; the new lots stay ACTIVE) — there is no automated
"undo split" action in this version.

## Test steps
1. `node --test server/lotSplit.test.cjs` — all validation unit tests pass.
2. Manual API test: split a 10-unit ACTIVE lot into 4/3/3 with distinct lot
   numbers/SKTs — confirm 200, original lot DEPLETED/qty 0, three new ACTIVE
   lots with correct quantities, and `GET /api/item-definitions` shows
   unchanged `totalStock`/`activeLotCount` for that item.
3. Manual API test: submit quantities summing to 9 or 11 — confirm
   `400 SPLIT_QUANTITY_MISMATCH` and no new rows written.
4. Manual API test: reuse an existing lot number for that item — confirm
   `409 DUPLICATE_LOT`.
5. Manual API test: call the endpoint as a non-ADMIN role — confirm `403`.
6. Manual UI test: full split flow in the browser (see plan Task 3, Step 5).

## Risks
- Splitting is only allowed on `ACTIVE` lots with `currentQuantity > 0`; there is
  no path to split `EXPIRED`/`QUARANTINE` lots in this version.
- No per-split override of manufacturer/catalogNo/storageLocation — always
  inherited from the original lot. If a future request needs per-batch
  manufacturer/catalog differences, that's a follow-up.
- No "merge lots back together" / undo action exists yet.
