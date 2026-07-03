# UPDATE 2026-07-03 — LOT Bölme (Lot Split)

## Summary
Admins can now split one lot's current quantity into multiple new lots, each with
its own lot number and SKT (expiry date), for cases where stock was originally
entered as a single lot but actually spans several physical batches. The item's
total stock is unaffected — it's always the sum of ACTIVE lots' currentQuantity.

## Files touched
- `server/lotSplit.cjs` (new) — pure validation for split requests, including a
  duplicate-lot-number-within-request check added during post-review fixes
- `server/lotSplit.test.cjs` (new) — unit tests for the above (9 cases)
- `server/index.js` — new `POST /api/lots/:id/split` route (admin-only)
- `src/LotInventory.jsx` — "Böl" button + split modal in the per-item LOT detail
  table; also updates `itemDefinitions[].activeLotCount` after a split
  (post-review fix — see below)

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
   unchanged `totalStock` and `activeLotCount` increased by 2 (net: −1 original
   + 3 new) for that item.
3. Manual API test: submit quantities summing to 9 or 11 — confirm
   `400 SPLIT_QUANTITY_MISMATCH` and no new rows written.
4. Manual API test: reuse an existing lot number for that item — confirm
   `409 DUPLICATE_LOT`.
5. Manual API test: submit two split rows with the same lot number — confirm
   `400 INVALID_INPUT` ("LOT numarası tekrar ediyor: ...") before any INSERT runs.
6. Manual API test: call the endpoint as a non-ADMIN role — confirm `403`.
7. Manual UI test: full split flow in the browser (see plan Task 3, Step 5),
   including checking the item row's LOT count badge updates immediately
   without a reload.

**Not yet exercised:** no MySQL instance was available in the build sandbox, so
steps 2-7 above have only been verified by code inspection (final whole-branch
review), not run live. Run them against a real DB before this ships to
production.

## Risks
- Splitting is only allowed on `ACTIVE` lots with `currentQuantity > 0`; there is
  no path to split `EXPIRED`/`QUARANTINE` lots in this version.
- No per-split override of manufacturer/catalogNo/storageLocation — always
  inherited from the original lot. If a future request needs per-batch
  manufacturer/catalog differences, that's a follow-up.
- No "merge lots back together" / undo action exists yet.
- Lots with a fractional `currentQuantity` (the column is `decimal(10,2)`)
  cannot be split — every split quantity and their sum must be a whole
  integer, so a lot like `10.50` can never satisfy the exact-sum check. The UI
  fails safe (submit just stays disabled) but gives no explanation why.
- Splitting a lot into a lot number that matches the *original* lot's own
  (now-freed) number returns `409 DUPLICATE_LOT` — by design (every split is
  a brand-new lot row; there's no "keep the old number for one shard" case),
  but the error message doesn't make that clear to the admin.

## Post-review fixes (2026-07-03)
A final whole-branch review caught two issues, both fixed in a follow-up commit:
- `handleSplitLot` in `LotInventory.jsx` never updated `itemDefinitions`, so
  the collapsed item row's active-lot-count badge under-reported after a split
  until a full reload. Fixed by bumping `activeLotCount` by
  `newLots.length - 1`, mirroring the existing `handleCreateLot` pattern.
- `validateLotSplit` didn't catch duplicate lot numbers *within* the same
  split request — it fell through to a confusing `409 DUPLICATE_LOT` from the
  DB constraint instead. Fixed with an explicit pre-check and a Turkish error
  naming the duplicate, plus a covering unit test.
