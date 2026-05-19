# UPDATE 2026-05-19 — Separate Satın Alma and Dağıtım Talebi

## Summary
Two types of Talep were mixed in the "Satın Alma Talepleri" tab and EBYS export:
1. **Satın Alma Talebi** (`isCepDepoRequest = 0`) — request to buy new items from an external supplier
2. **Haftalık Dağıtım Talebi** (`isCepDepoRequest = 1`) — technician request for weekly distribution from existing stock to their CEP DEPO

These are now separated:
- The Satın Alma tab and status counters show **only** buying requests.
- The EBYS export now **only** includes buying requests.
- CEP DEPO/distribution requests continue to be managed in the stock tab (per-item queue) as before.

---

## Files Changed

### `src/App.jsx`
- Added `buyingPurchases` derived array at the render-level purchase stats block.
  - Filter: `!Number(p.isCepDepoRequest) && !p.requestedFor`
- Updated `purchaseStatusCounts`, `filteredPurchases`, `readyForOrderCount`, `orderReadyPurchases`, and `displayedPurchases` to use `buyingPurchases` as the base instead of raw `purchases`.

### `server/index.js`
- `GET /api/export/talep-ebys`: added `AND (p.isCepDepoRequest = 0 OR p.isCepDepoRequest IS NULL)` to the WHERE clause so distribution requests never appear in the EBYS Excel output.

---

## DB Changes
None. No migrations required — `isCepDepoRequest` column already exists.

## Rollback
- Revert the `buyingPurchases` line and change all `buyingPurchases` references back to `purchases` in App.jsx.
- Remove the added `AND (p.isCepDepoRequest = 0 OR p.isCepDepoRequest IS NULL)` line from the EBYS query in server/index.js.

## Risks
- Low. Read-only filter change. CEP DEPO request management in the stock tab is unaffected.
- Lab techs' pending distribution requests will no longer show in the Satın Alma count badge — this is correct behaviour.
