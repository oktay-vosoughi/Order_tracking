# UPDATE 2026-08-09 — Fix: "Düzelt" silently failed to update CEP DEPO for items with no balance row

## Summary

Reported: for "some products," using the admin "Birim ve Stok Düzelt" (unit/stock
correction) form to set a CEP DEPO quantity had no effect, with no error shown.

Root cause: `POST /api/item-definitions/:id/unit-stock-correction`
(`server/index.js`) only ever ran an `UPDATE cep_depo_balances ...` when a
balance row already existed for that item (`cep_depo_balances.status = 'ACTIVE'`).
Any item that had never been distributed to a department's CEP DEPO pocket
depot had zero balance rows, so the correction silently no-opped — the item
catalog fields (unit, ideal stock, etc.) still saved fine, so the "kaydedildi"
success message was technically true for the rest of the form, masking that
the CEP DEPO portion did nothing.

Fix: `cep_depo_balances` is keyed by `(department, itemId)`, so creating a
brand-new balance row needs to know which department it belongs to — the form
didn't collect that. When no existing row is found and a nonzero CEP DEPO
quantity is submitted without a department, the server now returns a clear
`CEP_DEPARTMENT_REQUIRED` error instead of silently doing nothing. The
frontend catches this and reveals a department `<select>` in the same form
(reusing the already-loaded `departments` list) so the admin can pick one and
resubmit, which creates the new row correctly.

## Files touched

- `server/index.js` — `POST /api/item-definitions/:id/unit-stock-correction`:
  added the `else if` branch that either creates a new `cep_depo_balances` row
  (given `cepDepartment` in the body) or throws `CEP_DEPARTMENT_REQUIRED`.
  Existing-row update path is untouched (verified via regression test below).
- `src/App.jsx` — `correctionForm` gained a `cepDepartment` field; new
  `correctionNeedsCepDepartment` state; `handleSaveUnitStockCorrection` sends
  `cepDepartment` and handles the new error code (same pattern as the existing
  `MULTIPLE_ACTIVE_LOTS` handling); the correction modal shows a department
  `<select>` under the CEP DEPO quantity field only when needed.

## DB changes

None (no schema change — this only changes which code path an existing table
gets written through).

## Test steps

1. `node --test server/*.test.cjs server/*.test.js` — 55/56 pass (1 pre-existing
   unrelated failure, same as before this fix).
2. `npx vite build` — clean.
3. Live-verified against local dev DB (test data cleaned up afterward,
   production untouched):
   - Item with zero CEP DEPO balance rows: correction without a department →
     `CEP_DEPARTMENT_REQUIRED` (previously: silent no-op, false success).
   - Same item, retried with a department → new `cep_depo_balances` row
     created with the correct quantity.
   - Regression: item with an existing ACTIVE balance row → correction without
     a department still updates that row in place, unchanged from prior
     behavior, no duplicate row created.

## Risks

Low — additive `else if` branch; the pre-existing update path and its
`MULTIPLE_CEP_BALANCES` guard are both untouched. Worst case for an admin
mid-correction on a never-distributed item: they now see a required-field
error where before they saw a false "success," which is the intended fix, not
a regression.
