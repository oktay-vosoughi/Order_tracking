# UPDATE 2026-05-17 — Siparişler Notification

## Summary
Added a role-aware `Siparişler` navigation item for logistics ordering users.
The badge shows approved purchase requests (`ONAYLANDI`) that are ready for `Sipariş Ver`.

## Files touched
- `src/App.jsx` — sidebar item, badge count, focused `Siparişler` view, corrected role labels in user management.
- `src/mobileUi.mjs` — reusable approved-order count and navigation option support.
- `src/mobileUi.test.mjs` — regression tests for the new count and navigation option.

## DB changes
None.

## Rollback
`git checkout HEAD src/App.jsx src/mobileUi.mjs src/mobileUi.test.mjs updates/UPDATE_2026-05-17_siparisler_notification.md`

## Test steps
1. `node --test src\mobileUi.test.mjs`
2. `npm run build`
3. Login as `SATINAL_LOJISTIK`; verify `Siparişler` appears in the sidebar.
4. Approve a purchase request as `SATINAL` or `ADMIN`; verify the `Siparişler` badge increments.
5. Open `Siparişler`; verify only `ONAYLANDI` requests are listed and `Sipariş Ver` is available.
6. Place the order; verify the row leaves `Siparişler` and the badge decreases.

## Risks
- `Siparişler` reuses the existing purchase request table and order modal; any future request-table changes affect both pages.
- `SATINAL_LOJISTIK` visibility now follows the server-side order permission. This corrects the previous UI mismatch where logistics could order through the API but had no dedicated order entry point.
