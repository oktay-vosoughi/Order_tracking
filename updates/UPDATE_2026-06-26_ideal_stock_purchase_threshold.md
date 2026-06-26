# Ideal Stock Purchase Threshold

## Summary
- Changed low-stock / `SATIN_AL` decisions to use `ideal_stock` when present.
- `minStock` remains the fallback threshold only when `ideal_stock` is null.
- Frontend row highlighting and counters now use the same threshold as the displayed stock ratio.

## Files Touched
- `server/index.js`
- `src/App.jsx`
- `src/stockDisplay.mjs`
- `src/stockDisplay.test.mjs`

## DB Changes
- No schema changes.

## Rollback
- Revert the files above to return `SATIN_AL` decisions to `minStock`.

## Test Steps
- `node --test src\*.test.mjs server\unitCorrection.test.cjs`
- `node --check server\index.js`
- `npm run build`

## Risks
- Items with low `ideal_stock` but high `minStock` will no longer show `SATIN_AL`; this is intentional per the new rule.
