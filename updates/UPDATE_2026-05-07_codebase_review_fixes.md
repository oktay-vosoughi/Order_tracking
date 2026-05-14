# UPDATE_2026-05-07_codebase_review_fixes

## Summary
Full codebase review. Fixed 12 confirmed bugs spanning broken API routes, missing role guards, race conditions, dead code, and stale UI references.

## Files touched
- `src/api.js` — fix `clearAllData` URL mismatch; add `deleteItemDefinition` export
- `src/App.jsx` — use `deleteItemDefinition` via api.js; fix stale `LAB_MANAGER` role default; fix role display badge; fix alert text `APPROVER` → `SATINAL`; remove debug console.log from load functions; fix role fallback display
- `src/LotInventory.jsx` — add missing `import * as XLSX from 'xlsx'` (crashed template download)
- `server/index.js` — add `canManageItems` middleware; guard `POST /api/state` (adminRequired), `POST/PUT /api/item-definitions`, `POST /api/import-items` (canManageItems); add `DELETE /api/purchases/:id`; wrap purchase creation in `withTransaction`; add `FOR UPDATE` to lot SELECT in receive-goods; fix silent HTTP 200 on missing entity (4 routes); remove debug `console.log` from unified-stock hot path
- `CLAUDE.md` — update known issues; mark fixed items; add new open issues found during review

## DB changes
None — all changes are application-layer only.

## Rollback SQL
n/a

## Test steps
1. `npm run server` — server starts on port 4000 with no errors.
2. `npm run dev` — Vite starts on port 3000.
3. Login as ADMIN.
4. Stock tab loads without console.log noise.
5. "Tümünü Temizle" (clear-all) button now reaches the server (previously 404).
6. Delete a malzeme — uses api.js, no raw fetch.
7. Go to Users tab → create user → cancel → role selector shows `SATINAL_LOJISTIK` (not `LAB_MANAGER`).
8. Role badges in users table show colour for each of the 5 roles.
9. LOT Stok Yönetimi → download Excel template → works without ReferenceError.
10. OBSERVER/LAB_TECHNICIAN attempting `POST /api/state`, `POST /api/item-definitions`, or `POST /api/import-items` receives 403.
11. `DELETE /api/purchases/:id` on a TALEP_EDILDI purchase returns 200; on SIPARIS_VERILDI returns 400.
12. Approve/reject/order a non-existent purchase ID returns 404 (not 200 with undefined body).

## Risks
- `POST /api/state` now requires ADMIN — any code path that was calling this as a non-ADMIN user will now receive 403. The only caller is `saveData()` in App.jsx which already notes this is a legacy/silent-fail path.
- `DELETE /api/purchases/:id` is ADMIN-only; the "Sil" button in the UI is only shown in contexts where ADMIN access is implied (line 2533 in App.jsx) — acceptable.
- `LotInventory.jsx` still uses its own `apiCall` wrapper instead of `api.js`. Tracked in CLAUDE.md as a future refactor item.
