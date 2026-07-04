# UPDATE 2026-07-04 — Multi-lot support for "Düzelt" (unit/stock correction)

## Summary
The stock page's "Düzelt" tool used to refuse the *entire* correction the moment an item
had more than one active lot — even a pure unit-config fix that never touches lot
quantities. Now:
- Unit-only corrections (packageUnit, consumptionUnit, idealStock, maxStock, etc.) work on
  any item regardless of lot count, as long as the admin isn't also changing the stock number.
- Stock-number corrections on a multi-lot item now show a LOT picker so the admin can say
  explicitly which lot the new number applies to, instead of being blocked outright.
- Items with 0 or 1 active lots are completely unaffected — identical behavior to before.

## Files touched
- `server/index.js` — `POST /api/item-definitions/:id/unit-stock-correction` gains an
  optional `targetLotId` field; the "multiple active lots" check now only fires when the
  admin is actually changing the stock number and hasn't picked a lot.
- `src/App.jsx` — "Düzelt" modal fetches the item's lots (via the already-existing
  `fetchItemLots`) and shows a picker when there are 2+ active lots; the stock-number field
  starts blank (instead of prefilled with the item total) in that case, and fills with the
  selected lot's own quantity once one is picked.
- `docs/superpowers/specs/2026-07-04-multi-lot-correction-design.md` — design doc.

## DB changes
None.

## Rollback
No schema change. Revert `server/index.js` and `src/App.jsx` to their prior commits — the
tool returns to blocking any correction (even unit-only) on multi-lot items, as before.

## Test steps
1. Multi-lot item, unit fields only (no `mainStock`) — expect `200`, lots untouched.
2. Multi-lot item, `mainStock` set, no `targetLotId` — expect `409 MULTIPLE_ACTIVE_LOTS`
   (regression check — must not silently start working without an explicit choice).
3. Multi-lot item, `mainStock` set, `targetLotId` = one of its lots — expect `200`, only
   that lot's quantity changes, others untouched.
4. `targetLotId` pointing at a lot that doesn't belong to the item — expect
   `400 INVALID_INPUT`.
5. Single-lot item, no `targetLotId` — expect identical behavior to before (regression
   check for the common case).
6. Manual UI test: open "Düzelt" on a multi-lot item, confirm the picker appears and
   picking a lot re-fills the quantity field with that lot's own number.

**Verified live against a real MySQL instance on 2026-07-04**, using disposable test items
(cleaned up afterward, no real inventory touched). All 5 API-level scenarios above passed.
Step 6 (browser UI) still needs manual click-through verification.

## Risks
- CEP DEPO's "multiple active balances" restriction is untouched — this update only covers
  the main-depot lot case, per what was asked.
- No automatic/proportional redistribution of a new total across lots was built — this was a
  deliberate choice (there's no correct default), so the admin must always pick explicitly
  when there's more than one active lot.
