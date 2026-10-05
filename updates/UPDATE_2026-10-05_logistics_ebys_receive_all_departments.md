# UPDATE 2026-10-05 — SATINAL_LOJISTIK: EBYS approval, order and receive for all departments

## Summary
Role gates already allowed SATINAL_LOJISTIK on these routes, but `stockWriteScope` rejected purchases of departments the user is not a member of. Added them to `LOGISTICS_DISTRIBUTE_PATHS`: `/api/purchases/:id/order`, `/api/purchases/ebys-batches/:batchId/approve`, `/api/receive-goods`. Receipt still credits a lot in the purchase's own department; lot/department mismatch is still rejected.

## Files touched
server/stockWriteScope.cjs, server/stockWriteScope.test.cjs, CLAUDE.md §5

## DB changes
None.

## Rollback SQL
None. Revert the commit.

## Test steps
1. `node --test server/*.test.cjs` (98 pass).
2. As SATINAL_LOJISTIK with no memberships: EBYS-approve a batch from another department, then receive a delivery; the lot appears in that purchase's department.
3. Cancel/requested-quantity of another department's request is still 403.

## Risks
Lojistik can now order and receive for all departments (intended). Role comes from the token; re-login after role changes.
