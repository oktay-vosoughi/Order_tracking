# Admin Unit Stock Correction

## Summary
- Added an admin-only stock/unit correction workflow for item master units, active LOT quantity, and CEP DEPO visible consumption quantity.
- CEP DEPO correction treats the entered value as the visible/consumed sub-unit amount and calculates `packQty = unitQty / unitsPerPackage`.
- The correction endpoint rejects ambiguous rows with multiple positive LOTs or multiple active CEP DEPO balances.

## Files Touched
- `server/index.js`
- `server/unitCorrection.cjs`
- `server/unitCorrection.test.cjs`
- `src/api.js`
- `src/App.jsx`

## DB Changes
- No schema changes.
- New API writes existing tables: `item_definitions`, `lots`, `cep_depo_balances`, `stock_movements`.

## Rollback
- Revert the files above.
- Any manual correction applied through the UI must be reversed with a matching manual correction, because the endpoint intentionally writes current stock state.

## Test Steps
- `node --test src\*.test.mjs server\unitCorrection.test.cjs`
- `node --check server\index.js`
- `npm run build`

## Risks
- The UI correction flow only supports one active/positive LOT and one active CEP DEPO balance. Multi-LOT or multi-user balances are rejected to avoid guessing how to split quantities.
