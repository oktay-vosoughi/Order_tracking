# Dağıtım Kayıtları: Parti column

## Summary
The distribution history table did not show which parti (lot) was distributed. `GET /api/distributions` now returns `lotDetails` (`LOT (qty), ...` from `distribution_lots`) and the table has a "Parti" column.

## Files touched
- `server/index.js` — `GET /api/distributions` (correlated subquery, row shape otherwise unchanged)
- `src/App.jsx` — Dağıtım Kayıtları table: new Parti column

## DB changes
None.

## Rollback SQL
None. Revert the two edits.

## Test steps
1. Distribute an item from a parti, open Dağıtım tab → Dağıtım Kayıtları.
2. Parti column shows `LOT (qty)`; older rows without `distribution_lots` show `-`.

## Risks
Low. Read-only query change; one extra subquery per distribution row.
