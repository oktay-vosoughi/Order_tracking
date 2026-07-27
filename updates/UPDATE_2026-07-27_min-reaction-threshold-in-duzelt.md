# UPDATE 2026-07-27 — "Min Talep Eşiği" (minReactionThreshold) editable via "Düzelt"

## Summary
`item_definitions.minReactionThreshold` ("Min Reaksiyon Eşiği" / the reaction-item talep
threshold — CEP DEPO stock must drop below this before a new talep can be opened) was only
settable at item-creation time. It could not be corrected afterward for existing products.
The "Düzelt" (unit/stock correction) modal now exposes and saves this field.

## Files touched
- `server/unitCorrection.cjs` — `buildUnitCorrectionValues()` now parses an optional
  `minReactionThreshold` from the request body (non-negative number, floored to an integer;
  `null`/`''`/`undefined` all mean "leave unchanged").
- `server/index.js` — `POST /api/item-definitions/:id/unit-stock-correction`: the
  `UPDATE item_definitions` now sets `minReactionThreshold = COALESCE(?, minReactionThreshold)`
  (COALESCE, not unconditional overwrite, because the column is `NOT NULL DEFAULT 3` — an
  unconditional `NULL` write would violate the constraint and fail the whole transaction).
- `src/App.jsx` — `correctionForm` state gains `minReactionThreshold`; `openUnitStockCorrection`
  prefills it from `item.minReactionThreshold`; `handleSaveUnitStockCorrection` sends it
  (`''` → `null`, meaning "don't change" server-side); the "Düzelt" modal JSX gets a new
  "Min Reaksiyon Eşiği (Talep Eşiği)" number input, placed after "Tüketim tipi" to mirror the
  item-creation form's field order.

## DB changes
None — reuses the existing `minReactionThreshold` column (added by an earlier migration,
self-healed via `ensureColumn` in `server/index.js`).

## Rollback
No schema change. Revert the three files above to their prior commits — the field disappears
from the modal and the endpoint stops touching the column (falls back to COALESCE no-op, so no
data loss either way).

## Test steps
1. Open "Düzelt" on an existing CEP DEPO reaction item — confirm the new field is prefilled
   with its current `minReactionThreshold` (or blank if unset).
2. Change the value, save — expect `200`, confirm in DB that `minReactionThreshold` updated
   and all other columns (unit, ideal_stock, max_stock, lot quantities) are unchanged.
3. Leave the field blank and save — expect the column to keep its previous value (COALESCE
   no-op), not get reset to `NULL`/error.
4. Enter a negative number — expect `400 INVALID_INPUT` (via existing `toNullableNumber`
   validation, `minReactionThreshold must be a non-negative number`).
5. Regression: save a correction on an item that never used this field before (plain PACK
   item) — confirm no unrelated behavior changes.

## Risks
- Low: additive field on an existing, already-editable-elsewhere column; COALESCE guards
  against accidental NULL/constraint violation on save.
