# UPDATE 2026-08-10 — Fix: department dropdown/checkboxes empty on the Stok tab

## Summary

Reported: the CEP DEPO department picker (added in the previous fix) showed
no options — and the same turned out to be true for "Birim"'s existing
department checkboxes too.

Root cause: `loadDepartments()` was only called from the `useEffect` gated on
`activeTab === 'users'` (`src/App.jsx:440-449`) — i.e. the `departments` list
was only ever fetched when an admin visited the Kullanıcılar (Users) tab.
Every other consumer of that same `departments` state — the "Birim" modal's
department checkboxes and the new Düzelt CEP DEPO department `<select>`, both
on the Stok tab — rendered against an empty array unless Users had already
been visited once in that session.

## Fix

`src/App.jsx`: added a separate `useEffect` that calls `loadDepartments()`
once whenever `currentUser` becomes set, independent of which tab is active.
`GET /api/departments` requires only `authRequired` (no role restriction), so
this is safe to call for every logged-in role. The original effect still
loads `loadUsers()`/`loadLoginLockouts()` only on the Users tab (unchanged —
those are heavier/role-specific).

## Test steps

1. `npx vite build` — clean.
2. `node --test server/*.test.cjs server/*.test.js` — 55/56 pass (same 1
   pre-existing unrelated failure as before).
3. Confirmed `GET /api/departments` returns the full list for a plain
   authenticated call with no special role — the endpoint side was always
   fine, this was purely a frontend load-timing gap.

## Risks

Very low — purely additive data fetch on login; no existing behavior changed,
no new endpoint, no schema change.
