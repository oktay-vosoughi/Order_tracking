# Shared main stock: Moleküler Genetik + Moleküler Mikro

## Summary
The two departments now draw from one main-warehouse stock. Lots keep their `department`; the group is resolved in code (`server/sharedStockPool.cjs`, UI mirror `src/sharedStockPool.mjs`). CEP DEPO balances, purchases/requests and master-data membership checks are unchanged (per department).

## Files touched
- `server/sharedStockPool.cjs` (+ test), `src/sharedStockPool.mjs` — group definition
- `server/depoGroup.cjs` — `buildLotPoolFilter` spans the group (FEFO)
- `server/stockWriteScope.cjs` — lot checks accept group members; lot/operation department compare uses `samePool`
- `server/index.js` — lot/item visibility filters in `/api/lots`, `/api/unified-stock`, `/api/unified-stock/:id/lots`; waste FEFO; manual-lot spillover (`/api/distribute`, `/api/cep-depo/distribute`); recipient/lot check at distribute
- `src/App.jsx` — CEP request Parti picker accepts group lots
- `server/stockVisibility.test.cjs`, `server/stockWriteScope.test.cjs` — updated/added
- `CLAUDE.md` §5 — documents the exception

## DB changes
None.

## Rollback SQL
None. Revert the code; or set `SHARED_STOCK_POOLS = []` in both pool files.

## Test steps
1. Distribute REQ-527599 (Genetik, furkan) from the Eldiven Small `BELIRTILMEDI` lot (department Mikro): lot appears in Parti picker and distribution succeeds; furkan's CEP balance is credited under Genetik.
2. A Genetik-only user sees the Mikro lot in stock; a SİTOGENETİK user does not.
3. `npm test` — 166 pass.

## Risks
- Unified-stock `pools` breakdown still lists Genetik and Mikro as separate rows (totals are combined).
- A Genetik user's main-stock total now includes Mikro lots.
- Mikro-only items must have an `item_departments`/department tag in the group to be visible; shared via the same filter.
- Frontend list filters (`LotInventory.jsx` department dropdown) still match exact lot department.

## Addendum: untagged lots of global materials
Lots with no department (NULL/'') of items with `isGlobal = 1` are now visible to every role in `/api/lots`, `/api/unified-stock`, `/api/unified-stock/:id/lots` (`buildStockDepartmentFilter(..., { itemAlias: 'id' })`). Department-tagged lots stay scoped. Read-only visibility: consuming/distributing an untagged lot still requires tagging it first (ADMIN repair rule in `stockWriteScope.cjs`). No DB change; rollback = revert code.
