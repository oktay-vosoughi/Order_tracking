# Multi-lot support for "Düzelt" (unit/stock correction) — Design

**Date:** 2026-07-04
**Status:** Approved for planning

## Problem

`POST /api/item-definitions/:id/unit-stock-correction` (the backend behind the stock page's
"Düzelt" button) unconditionally throws `409 MULTIPLE_ACTIVE_LOTS` whenever an item has more
than one active lot with quantity > 0 (`server/index.js:830-837`), before it even applies the
unit-config part of the correction. This means:

1. An admin can't fix a pure unit-config mistake (packageUnit, consumptionUnit, etc.) on a
   multi-lot item at all, even though that part of the correction never touches lots.
2. An admin genuinely wanting to correct the "Ana Depo Stok" (main depot stock) number on a
   multi-lot item has no way to do it through this tool — they're told to use the LOT Stok
   screen instead, but that screen has no equivalent "just set this number" action.

The reason for the block: when `values.mainStock !== null`, the route directly overwrites one
lot's `initialQuantity`/`currentQuantity` to the new number (`server/index.js:877-909`). With
one lot, "which lot?" is unambiguous. With several, it isn't — there's no correct default (not
proportional split, not "the newest one", nothing that wouldn't sometimes be wrong), so the
route has always just refused rather than guess.

## Decisions (from stakeholder Q&A)

- **Unit-only corrections stop being blocked.** The lot-count check moves so it only applies
  when the admin is actually changing the stock number (`values.mainStock !== null`). Clearing
  that field to correct just the unit settings now works on any item, regardless of lot count.
- **Stock-number corrections on multi-lot items get an explicit LOT picker**, rather than the
  tool guessing or continuing to refuse outright. The admin picks which lot the new number
  applies to; that lot's quantity is overwritten exactly the way the single-lot case already
  works today.
- **CEP DEPO's "multiple balances" restriction is untouched** — out of scope; only the main-depot
  lot case was raised.
- **0 or 1 active lots: zero behavior change.** The picker only appears when it's genuinely
  needed (2+ active lots and the admin is touching the stock number).

## Backend (`server/index.js`)

`POST /api/item-definitions/:id/unit-stock-correction` gains one new optional body field:
`targetLotId`.

Restructure the existing logic (inside the same `withTransaction`, same `lotRows`/`positiveLots`
query — no new queries):

```
// (the previous unconditional MULTIPLE_ACTIVE_LOTS throw is removed from here)

UPDATE item_definitions ...   // unchanged — always runs regardless of lot count

if (values.mainStock !== null) {
  let targetLot;
  if (req.body.targetLotId) {
    targetLot = lotRows.find(l => l.id === req.body.targetLotId);
    if (!targetLot) throw { status: 400, error: 'INVALID_INPUT', message: 'Seçilen LOT bu malzemeye ait değil.' };
  } else {
    if (positiveLots.length > 1) {
      throw { status: 409, error: 'MULTIPLE_ACTIVE_LOTS', message: 'Bu malzemede birden fazla aktif LOT var. Düzeltilecek LOT\'u seçin.' };
    }
    targetLot = positiveLots[0] || lotRows[0];
  }
  // ...rest is byte-for-byte the same UPDATE/INSERT logic already there,
  // just referencing `targetLot` instead of the old inline `positiveLots[0] || lotRows[0]`
}
```

This is fully backward compatible: existing callers that never send `targetLotId` get
identical behavior to today for 0/1-lot items, and the same `409 MULTIPLE_ACTIVE_LOTS` block
for multi-lot items until the frontend starts sending a choice.

## Frontend (`src/App.jsx`)

- `openUnitStockCorrection(item)` becomes `async`. If `item.activeLotCount > 1` (this field
  already means "count of ACTIVE lots with currentQuantity > 0" — the same definition as the
  backend's `positiveLots`), call the already-imported `fetchItemLots(item.id)` (used elsewhere
  in this file for the distribute picker), filter to `status === 'ACTIVE' && currentQuantity > 0`,
  and store the result in a new `correctionLotOptions` state array. For 0/1-lot items, this stays
  empty and nothing changes.
- New state: `correctionForm.targetLotId` (default `''`).
- In the correction modal, when `correctionLotOptions.length > 1`: show a `<select>` "Hangi
  LOT'u düzeltmek istiyorsunuz?" listing each lot as `LOT-NO — <qty> <unit> (SKT: <date or "-">)`.
  Selecting one sets `correctionForm.targetLotId` and re-fills `correctionForm.mainStock` with
  *that lot's own* `currentQuantity` (replacing the item-total prefill, since the field now
  means "this lot's quantity", not the item total).
- Relabel the "Ana Depo Stok" field to "Seçili LOT Miktarı" (Selected LOT's Quantity) whenever
  the picker is showing, to avoid confusion with the item's total; keep the existing "Ana Depo
  Stok" label when there's no ambiguity (0/1 lots).
- Client-side guard before submit: if `correctionLotOptions.length > 1` and
  `correctionForm.mainStock !== ''` and no `targetLotId` chosen, block with an inline message
  ("Lütfen düzeltilecek LOT'u seçin") instead of letting the request round-trip and fail.
- `handleSaveUnitStockCorrection` passes `targetLotId: correctionForm.targetLotId || null`
  through to `applyUnitStockCorrection`.
- If the admin clears "Ana Depo Stok"/"Seçili LOT Miktarı" to blank, the request sends
  `mainStock: null` exactly as today — no lot selection needed, unit-only correction proceeds.

## Out of scope

- CEP DEPO multi-balance correction (`MULTIPLE_CEP_BALANCES`) — untouched.
- Any redesign of the "LOT Stok" screen's own editing tools (Böl, SKT Düzenle) — this is purely
  about unblocking the stock page's existing "Düzelt" tool.
- Proportional/automatic splitting of a new total across multiple lots — explicitly rejected in
  favor of an explicit human choice, since there's no correct automatic default.

## Testing

- Live API test: multi-lot item, `mainStock` omitted (unit fields only) — confirm 200, no
  `MULTIPLE_ACTIVE_LOTS` error, lots untouched, unit fields updated.
- Live API test: multi-lot item, `mainStock` set, no `targetLotId` — confirm the same
  `409 MULTIPLE_ACTIVE_LOTS` as today (regression check — this must NOT silently start working
  without a choice).
- Live API test: multi-lot item, `mainStock` set, `targetLotId` = one of its own lots — confirm
  200, that lot's quantity updated to the new value, other lots on the item untouched.
- Live API test: `targetLotId` pointing at a different item's lot — confirm `400 INVALID_INPUT`.
- Live API test: single-lot item, no `targetLotId` — confirm identical behavior to before
  (regression check for the common case).
- Manual UI test: open "Düzelt" on a multi-lot item, confirm the picker appears, confirm
  selecting a lot re-fills the quantity field with that lot's own number, confirm submit is
  blocked with a clear message if no lot is picked but a number was typed.
- Cleanup: any disposable test item/lots created for live verification are deleted afterward.

## Change log

`updates/UPDATE_2026-07-04_multi-lot-correction.md` per CLAUDE.md rule 5.
