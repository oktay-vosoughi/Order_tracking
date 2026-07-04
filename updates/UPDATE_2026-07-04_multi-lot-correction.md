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

## Bugfix (2026-07-04 follow-up)

Three issues found after initial deployment:

1. **`server/index.js`**: `positiveLots` was counting DEPLETED lots with `currentQuantity > 0`
   (a data-integrity edge case). This made the backend see 2 positive lots while `activeLotCount`
   in the frontend was 1 (ACTIVE-only), so the picker never loaded but the server still threw
   `MULTIPLE_ACTIVE_LOTS`. Fixed: `positiveLots` now only counts ACTIVE lots, matching the
   frontend's definition.

2. **`src/App.jsx` — `openUnitStockCorrection`**: `correctionLotOptions` was not cleared before
   the async lot fetch, so stale picker data from a previous modal open could persist briefly.
   Fixed: `setCorrectionLotOptions([])` now runs first; the fetch always runs (not only when
   `activeLotCount > 1`) so even items whose count was wrong in cached data get a fresh lot list.

3. **`src/App.jsx` — `handleSaveUnitStockCorrection`**: On a `MULTIPLE_ACTIVE_LOTS` 409 response
   the catch block just showed the error code. Now it fetches the lots, loads the picker, resets
   `mainStock` to blank, and shows a clear Turkish message so the user can select a lot and retry
   — no page reload needed.

## Risks
- CEP DEPO's "multiple active balances" restriction is untouched — this update only covers
  the main-depot lot case, per what was asked.
- No automatic/proportional redistribution of a new total across lots was built — this was a
  deliberate choice (there's no correct default), so the admin must always pick explicitly
  when there's more than one active lot.
- **Separate latent bug, not fixed here**: `correctionForm.cepUnitQty` is always initialized to
  a number (never blank), so every "Düzelt" save — including pure unit-only edits — sends a
  non-null `cepUnitQty`. If an item also has 2+ active CEP DEPO balances, the backend's
  `MULTIPLE_CEP_BALANCES` guard (`server/index.js`, same endpoint) fires unconditionally,
  blocking even unit-only saves for that item. Out of scope for this ticket (the report was
  specifically about the LOT error), but worth a follow-up fix mirroring the mainStock pattern.

## Bugfix (2026-07-04, second follow-up — reported live by user)

**Symptom:** user reported the "Bu malzemenin birden fazla aktif LOT'u var..." error still
appearing when editing only unit fields (packageUnit/consumptionUnit) on a multi-lot item,
despite the first follow-up above already fixing this server- and client-side.

**Root cause — two separate issues found:**

1. **Frontend race condition (`src/App.jsx`, `openUnitStockCorrection`)**: `mainStock` was
   prefilled synchronously from the (possibly stale) cached `item.activeLotCount` *before* the
   authoritative lot list finished loading. If the cached count was wrong (or the admin saved
   before the async fetch resolved), a real `mainStock` number could reach the server with no
   `targetLotId`, and the server correctly 409'd. Fixed: `mainStock` now always starts blank and
   is only populated once the live lot fetch resolves (from the single active lot's own quantity,
   or item total when there are zero lots). The "Düzeltmeyi Kaydet" button is now disabled with a
   "LOT bilgisi yükleniyor..." label while that fetch is in flight, and a fetch failure disables
   saving entirely instead of silently defaulting to "no lots" — closing the race window outright
   rather than just narrowing it.

2. **Stale running backend process (root cause of the actual live repro)**: the dev server had
   been started via plain `node server/index.js` (no nodemon) over 90 minutes before the first
   multi-lot-correction fix was written to `server/index.js`. It was still serving the
   pre-fix logic in memory the entire time, so *every* multi-lot correction — unit-only or not —
   hit the old unconditional 409, regardless of any client-side fix. Restarting the backend
   process picked up the current code immediately.

**Verified live** against the real MySQL instance (2026-07-04): logged in as an admin, opened
"Düzelt" on `PMT252000` (2 active lots, 12 and 14 units), edited only the sub-unit field
(`kutu` → `adet`), left the stock-quantity field and LOT picker untouched, and saved — result
`200`, alert "Birim ve stok düzeltmesi kaydedildi.", DB confirmed `consumptionUnit` updated
item-wide while both lots' `currentQuantity` (12.00 / 14.00) were unchanged. Test change reverted
back to `kutu` afterward to leave real inventory data untouched.

**Operational note:** this repo's dev/prod backend does not auto-reload on file changes. Any
session that edits `server/index.js` must restart the running `node server/index.js` process
before that code takes effect — otherwise fixes can appear "not applied" indefinitely even
though the source is correct.
