# UPDATE 2026-07-20 — KALITE read-only role

## Summary
Added a new `KALITE` role: sees every section and every action button across the
app (same as ADMIN in terms of visibility, and bypasses department scoping like
ADMIN/SATINAL/SATINAL_LOJISTIK/KURUMSAL), but cannot mutate any data. Every
button renders normally for this role; clicking one never succeeds.

Two independent layers enforce the "cannot modify anything" guarantee:
1. **Backend (authoritative):** `KALITE` was added to `ROLES`/`ALL_ROLES` in
   `server/index.js` but deliberately **not** added to any `requireRole(...)`
   allowlist or inline role check on any mutating route. Every `POST`/`PUT`/
   `PATCH`/`DELETE` route in the app already default-denies roles absent from
   its allowlist, so this role is blocked everywhere without touching a single
   route handler.
2. **Frontend (UX, defense in depth):** `src/api.js`'s `apiFetch` now checks
   the signed-in role (kept in sync via `setApiRole()`, called from a
   `useEffect` in `App.jsx`) and throws before any non-GET request reaches the
   network if the role is `KALITE`. `LotInventory.jsx` has its own historical
   `apiCall` wrapper (pre-existing tech debt, not touched otherwise) and got
   the same guard so its buttons behave identically.

## Files touched
- `server/index.js` — added `ROLES.KALITE` / `ALL_ROLES` entry (comment
  explains why it's absent from every allowlist).
- `server/departmentScope.cjs` — added `KALITE` to `DEPARTMENT_BYPASS_ROLES`
  (full cross-department read visibility, matching "sees all sections").
- `server/departmentScope.test.cjs` — updated the two tests asserting the
  bypass-role set.
- `src/api.js` — added `setApiRole`/`getApiRole` and a write-guard inside
  `apiFetch`.
- `src/LotInventory.jsx` — same write-guard added to its local `apiCall`;
  `canEditLotSkt` now includes `KALITE` so the SKT-edit button shows.
- `src/CepDepo.jsx` — `isPrivileged` and a new `canReviewCepRequests` flag
  include `KALITE` so the CEP DEPO "All" view's action buttons/sections render
  for this role.
- `src/App.jsx` — new `isKalite` flag folded into every capability boolean
  (`canManageUsers`, `canModifyInventory`, `canCreateRequest`, `canApprove`,
  `canOrder`, `canReceive`, `canExportIsoForm`, `canDistribute`,
  `canViewPrices`, `canViewAllDagit`, `canViewTalep`) and into the handful of
  raw `isAdmin &&`-gated buttons (Excel Yükle, Düzelt ×2, Sil ×2, Tümünü
  Temizle, birim/stok düzeltme modal). Added `KALITE` to the user-creation
  role `<select>`, the users-table role badge color, and `roleChipClass()`.
- `src/theme.css` — added `.role-chip--kalite`.

## DB changes
None. `users.role` is `VARCHAR(20)` with app-level validation against
`ALL_ROLES` only (no CHECK constraint) — `'KALITE'` fits without a migration.

## Rollback
No schema change to roll back. To remove the role in code: revert this
commit. Any already-created `KALITE` users would keep that role string in the
`users` table (harmless — `ALL_ROLES` validation would just reject creating
new ones, and login would still succeed, landing them in a UI that no longer
recognizes the role as anything special — closest to `OBSERVER`-like
behavior since none of the `canX` flags would resolve true for it anymore).

## Test steps
1. `node --test server/departmentScope.test.cjs` — all 10 pass.
2. `npm run build` — succeeds, no errors.
3. As ADMIN, create a user with role `KALITE`.
4. Log in as that user:
   - Every nav tab (Stok, Talepler, Siparişler, Dağıtım, Atık, Genel Stok,
     LOT Stok, CEP DEPO, Fiyatlar, ISO Formları, Kullanıcılar, Hesabım) is
     visible.
   - Every action button (Malzeme Ekle, Düzelt, Sil, Onayla/Reddet, Siparişe
     Al, Teslim Al, Dağıt, Tümünü Temizle, CEP DEPO Dağıt/Override/Onayla,
     LOT Ekle/Tüket/Sil, Kullanıcı ekle/düzenle) is visible and clickable.
   - Clicking any of the above shows a "salt görüntüleme modundadır" error
     alert (or a silent no-op where the component doesn't surface the
     rejection) and produces **zero** state change in the DB.
5. Confirm via `curl`/Postman with a KALITE JWT that a direct call to e.g.
   `POST /api/item-definitions` or `POST /api/purchases/:id/approve` returns
   `403 FORBIDDEN` — proves the backend blocks mutation independent of the
   frontend.

## Risks
- Two enforcement layers (frontend + backend) must stay in sync going
  forward: any new mutating route must continue to use an explicit allowlist
  that does not include `KALITE` (the existing pattern already does this
  correctly everywhere).
- `LotInventory.jsx` still uses its own `apiCall` instead of `src/api.js`
  (pre-existing, tracked separately) — its guard was duplicated rather than
  unified; if that file is ever refactored onto `api.js`, the duplicate guard
  in it should be removed.
