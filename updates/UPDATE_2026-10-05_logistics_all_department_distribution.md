# UPDATE 2026-10-05 — SATINAL_LOJISTIK all-department stock view + distribution

## Summary
SATINAL_LOJISTIK saw empty "Parti seç" lists and could not distribute because stock reads and writes were scoped to `user_departments`. It now sees all departments' lots/stock and can distribute to any department. Other writes remain membership-scoped. Distribution still names one target department; lot and department must match (no cross-department mixing).

## Files touched
- server/index.js (`getStockViewDepartments`)
- server/stockWriteScope.cjs (`LOGISTICS_DISTRIBUTE_PATHS` bypass)
- src/App.jsx (lot picker label shows department)
- server/stockVisibility.test.cjs, server/stockWriteScope.test.cjs, CLAUDE.md §5

## DB changes
None.

## Rollback SQL
None. Revert the commit.

## Test steps
1. `node --test server/*.test.cjs` (97 pass).
2. As SATINAL_LOJISTIK with no memberships: open Dağıt on an item, Parti list shows lots of all departments with department prefix; distribute to a department using a lot of that department.
3. Using a lot from a different department than the selected one returns LOT_DEPARTMENT_MISMATCH.
4. Lot edit / adjustment / waste on another department's lot is still 403.

## Risks
- Lojistik now sees all departments' quantities (intended).
- Role is read from JWT-independent DB check? Role comes from the token; changes apply after re-login.
