# SKT Düzenle (Edit Lot Expiry Date) — Design

**Date:** 2026-07-04
**Status:** Approved for planning

## Problem

There is no way to correct a lot's SKT (expiry date) after it's been entered, short of
editing the database directly. `PUT /api/lots/:id` already supports updating `expiryDate`
(among other fields), but no frontend code calls it — the route is currently dead/unused.

## Goal

Add an "Düzenle" (Edit) button per lot row, next to the existing "Böl" (Split) button, that
opens a small modal to change just the SKT.

## Decisions (from stakeholder Q&A)

- **Placement:** LOT Stok's per-item expanded "LOT Detayları" table, next to "Böl" — not the
  stock page's "Düzelt" button, which opens a different, item-level unit/stock correction tool
  that already breaks when an item has more than one active lot. Lot-level SKT editing doesn't
  fit there without reworking that modal.
- **Scope:** SKT only. No lot number, manufacturer, storage location, or notes editing in this
  version — those are out of scope, not asked for, and lot number changes in particular carry
  more risk (renaming a lot number in place could confuse history/reports).
- **Permission:** reuse whatever already gates lot edits today — `PUT /api/lots/:id` is
  `canReceiveGoods` (ADMIN, SATINAL_LOJISTIK, or a user with the `canReceive` flag). No new
  permission tier; this is *not* admin-only like the split feature.
- **Availability:** shown for a lot regardless of its status (ACTIVE/DEPLETED/EXPIRED) — unlike
  "Böl", which only applies to ACTIVE lots with stock. Fixing a wrong SKT is exactly the kind of
  correction you'd want to make on an EXPIRED lot (e.g. it shows expired only because the date
  was mistyped).

## A backend wrinkle found while checking the existing route

`PUT /api/lots/:id` (`server/index.js:1122`) updates every field via `COALESCE(?, <column>)`,
intended so omitted fields keep their old value. But the route destructures `req.body` directly
and passes whatever comes out — including `undefined` for any key the caller doesn't send — as
a bind parameter to `connOrPool.execute(sql, params)` (`server/index.js:56`, prepared statement).
mysql2 throws `Bind parameters must not contain undefined` for a prepared-statement param that
is `undefined` (as opposed to `null`, which is a valid bind value and is exactly what COALESCE
needs to "keep the old value"). Since no frontend code has ever called this route before, this
bug has never surfaced. **The fix:** the new frontend call must send `null` explicitly for every
field except `expiryDate`, not omit the keys. This is a call-site consideration, not a route
change — the route's COALESCE logic is correct as long as callers send explicit `null`s.

This will be verified live against a real database (the same way the split feature was) before
considering this done, specifically to confirm no `undefined`-bind-parameter crash occurs.

## Frontend (`src/LotInventory.jsx`)

- New computed value (mirrors `App.jsx`'s existing `canReceive` pattern, `src/App.jsx:222`):
  `const canEditLotSkt = currentUser?.role === 'ADMIN' || currentUser?.role === 'SATINAL_LOJISTIK' || !!currentUser?.canReceive;`
- New state: `showEditSktForm` (holds the lot being edited) and `editSktValue` (the date string
  in the input, initialized from the lot's current `expiryDate`, sliced to `YYYY-MM-DD` for the
  `<input type="date">` value).
- New "Düzenle" button per lot row in the "LOT Detayları" table's action column (next to "Böl"),
  rendered when `canEditLotSkt` is true — no status/quantity restriction, unlike "Böl".
- Small modal: LOT No shown read-only, current SKT shown read-only for reference, one
  `<input type="date">` for the new SKT (required — empty submission disabled, since the
  backend route can't clear an SKT to blank anyway), Kaydet/İptal buttons.
- On save: `apiCall('/lots/' + lot.id, { method: 'PUT', body: JSON.stringify({ expiryDate: editSktValue, lotNumber: null, manufacturer: null, catalogNo: null, department: null, location: null, storageLocation: null, invoiceNo: null, attachmentUrl: null, attachmentName: null, notes: null, status: null }) })`
  — explicit `null`s for every other field, per the wrinkle above.
- On success: replace the edited lot in local `lots` state with the returned `lot`; close the
  modal. No changes needed to `itemDefinitions` (SKT doesn't affect stock totals or counts).
- Errors surfaced via the existing `alert('Hata: ' + err.message)` convention.

## Out of scope

- Editing any field besides SKT (lot number, manufacturer, storage location, notes).
- Clearing an SKT back to blank (the underlying COALESCE-based route can't do this either).
- Any change to the stock page's "Düzelt" (unit/stock correction) modal.
- Audit trail for SKT edits — `lot_adjustments` is for *quantity* changes; a plain field edit
  like this doesn't have an existing audit pattern to reuse, and adding one wasn't requested.

## Testing

- Live API test: create a disposable test lot with SKT `2026-01-01`, `PUT` it to `2027-01-01`
  with all other fields explicitly `null` — confirm 200 and the lot's `expiryDate` actually
  changed, with `lotNumber`/`manufacturer`/etc. unchanged. This is the critical test that
  confirms the `undefined`-bind-parameter wrinkle doesn't crash the route.
- Live API test: same call but omitting the other fields entirely (not sending `null`) —
  confirm this reproduces the crash, to prove the wrinkle is real and the fix (sending explicit
  nulls) is what avoids it.
- Manual UI test: click "Düzenle" on a lot, confirm the modal pre-fills the current SKT, change
  it, save, confirm the table updates immediately without a reload.
- Manual UI test: confirm the button is visible for the roles it should be (ADMIN,
  SATINAL_LOJISTIK, canReceive users) and hidden otherwise.
- Cleanup: any disposable test item/lot created for live verification is deleted afterward.

## Change log

`updates/UPDATE_2026-07-04_lot-skt-edit.md` per CLAUDE.md rule 5.
