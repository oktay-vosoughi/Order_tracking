# UPDATE 2026-07-04 — SKT Düzenle (Edit Lot Expiry Date)

## Summary
Added a "Düzenle" (Edit) button next to "Böl" on each lot row in LOT Stok's per-item
detail table, opening a small modal to change just that lot's SKT (expiry date).
Available to the same roles that can already receive/add lots (ADMIN, SATINAL_LOJISTIK,
or a user with the `canReceive` flag) — not admin-only.

## Files touched
- `src/LotInventory.jsx` — new "Düzenle" button, `showEditSktForm`/`editSktValue` state,
  `openEditSktForm`/`handleEditSkt` handlers, edit modal, `canEditLotSkt` permission check
- `docs/superpowers/specs/2026-07-04-lot-skt-edit-design.md` — design doc

## DB changes
None. Reuses the existing `PUT /api/lots/:id` route, which already supported updating
`expiryDate` but had never been called from the frontend before.

## A real bug found and worked around
`PUT /api/lots/:id` builds its `UPDATE ... SET x = COALESCE(?, x)` query straight from
`req.body`'s destructured fields. If a field is omitted from the request body entirely,
it comes through as JavaScript `undefined` rather than `null`, and `undefined` is not a
valid bind parameter for a `mysql2` prepared statement (`connOrPool.execute`) — it throws
and the route 500s. Confirmed live: `PUT` with only `{ "expiryDate": "..." }` crashes;
`PUT` with `expiryDate` plus explicit `null` for every other field succeeds correctly.
The new frontend call sends explicit `null`s for every field except `expiryDate`. The
backend route itself was not changed — this is purely a call-site fix in the new code;
any *other* future caller of this route must do the same.

## Rollback
No schema change. Revert `src/LotInventory.jsx` to its prior commit to remove the button/
modal — `PUT /api/lots/:id` returns to being unused, exactly as before.

## Test steps
1. Live API test: `PUT /api/lots/:id` with only `expiryDate` (no other fields) — confirm
   `500 SERVER_ERROR` (reproduces the bug, confirming why the frontend must send explicit
   nulls).
2. Live API test: same `PUT` with `expiryDate` plus explicit `null` for every other field
   — confirm `200` and that only `expiryDate` changed (lot number, manufacturer, status
   all unchanged).
3. Manual UI test: click "Düzenle" on a lot, confirm the modal pre-fills the current SKT,
   change it, save, confirm the table row updates immediately without a reload.
4. Manual UI test: confirm the button is visible for ADMIN/SATINAL_LOJISTIK/canReceive
   users and hidden for other roles.

**Verified live against a real MySQL instance on 2026-07-04**, using a disposable test
item/lot (cleaned up afterward, no real inventory touched) — steps 1 and 2 above both
passed as expected. Step 3/4 (browser UI) still need manual click-through verification.

## Risks
- Cannot clear an SKT back to blank — the underlying route's `COALESCE` logic means
  sending `null` for `expiryDate` would keep the old value, not clear it. Not something
  that was asked for; noted as a known limitation.
- No audit trail for SKT edits (unlike lot splits, which log to `lot_adjustments`) — a
  plain field correction doesn't have an existing audit pattern to reuse, and one wasn't
  requested.
- Available regardless of lot status (ACTIVE/DEPLETED/EXPIRED) by design, since correcting
  a wrong SKT on an EXPIRED lot is a legitimate use case.
