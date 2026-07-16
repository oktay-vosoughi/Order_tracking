# UPDATE 2026-07-16 — Depot location (storageLocation) in the stock-correction modal

## Summary

Adds a **"Depo Konumu (Buzdolabı/Dolap)"** field to the admin **"Birim ve Stok
Düzelt"** modal on the stock page. When an admin adjusts an item's depot
quantity/units, they can now also record where the item physically sits. This
value feeds column **G ("Buzdolabı/Dolap")** of the ISO Malzeme Sayım Formu
(LY-F064), which was previously blank because `storageLocation` was never
captured through the UI.

Location is stored per-item on `item_definitions.storageLocation` (the same
field the ISO export reads).

## Files touched

- **Edit:** `server/unitCorrection.cjs` — `buildUnitCorrectionValues` now
  normalizes and returns `storageLocation`.
- **Edit:** `server/unitCorrection.test.cjs` — expectation updated for the new
  field.
- **Edit:** `server/index.js` — `POST /api/item-definitions/:id/unit-stock-correction`
  UPDATE now sets `storageLocation = COALESCE(?, storageLocation)` (a blank input
  leaves the existing value untouched rather than wiping it).
- **Edit:** `src/App.jsx` — `openUnitStockCorrection` prefills `storageLocation`
  from the item; `handleSaveUnitStockCorrection` sends it; new text input in the
  correction modal.

## DB changes

None. `item_definitions.storageLocation` already exists; this only writes to it.

## Test steps / verification (against local test DB)

- `node --test server/*.test.cjs` → 30/30 pass; `npm run build` clean.
- Live: `POST …/unit-stock-correction` with `storageLocation` → 200; value
  persisted to `item_definitions`; then confirmed it renders in ISO form column G
  for that item. Test item's location reset afterward.

## Risks

- Admin-only (the correction modal is already gated by `isAdmin` + `adminRequired`).
- `COALESCE` means a blank field cannot clear an existing location; this is
  intentional (prevents accidental wipes). Clearing a location would need the
  full item edit form.

## Rollback

Code-only, no DB migration. Revert the commit; `storageLocation` values already
written stay valid (they are just normal item data).
