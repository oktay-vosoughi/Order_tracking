# UPDATE 2026-07-06 — Multi-Department Stock & CEP DEPO Visibility

## Summary
Scoped `/api/unified-stock`, `/api/lots`, and all 5 CEP DEPO read endpoints to the
caller's department membership. Users and items can now belong to multiple
departments (new `user_departments`/`item_departments` join tables), and items can
be flagged `isGlobal` to bypass scoping entirely. `ADMIN`/`SATINAL`/`SATINAL_LOJISTIK`/
`KURUMSAL` keep full cross-department visibility (unchanged from today). Also fixes
a pre-existing gap where CEP DEPO read endpoints trusted a client-supplied
`?department=` query param for non-lab-tech roles.

Three real defects were found and fixed by review during this work, not shipped:

1. **Task 10 review**: `resetUserForm()` in `src/App.jsx` was not resetting the new
   `departments` field. A save-then-cancel (or repeated add-user) cycle would have left
   stale department checkbox state behind, which would have crashed the user-management
   panel's checkbox rendering on the next open. Fixed within the same commit before it
   ever reached a shared branch.
2. **Task 13 review**: `POST /api/auth/login` and `GET /api/auth/me` were never updated
   (a gap in Task 7's original scope) to attach a user's `departments` array before
   calling `sanitizeUser` — matching the pattern already used by `GET /api/users`. As a
   result `currentUser.departments` was `[]` for every logged-in session regardless of
   actual membership, which silently broke Task 13's `CepDepo.jsx` multi-department
   Bölüm-column logic (it always rendered as if the user had zero departments). Fixed in
   a follow-up commit; both endpoints now query `user_departments` and attach the array
   before sanitizing.
3. **Task 14 close-out**: the same gap existed at a third call site, `POST /api/auth/bootstrap`
   (the first-admin-creation endpoint). A `grep` for every remaining `sanitizeUser(` call
   site — prompted by the pattern in #2 — found it and confirmed it was the last one. This
   one is currently harmless in practice (the bootstrapped user is always `ADMIN`, which
   bypasses department filtering everywhere), but was fixed anyway for consistency, since
   `sanitizeUser`'s output should reliably reflect real DB state regardless of role. All
   3 `sanitizeUser(` call sites in `server/index.js` now attach `departments` first.

All three were caught by review before merge to `main`, not discovered in production, but
are recorded here because they were real, live bugs during the branch's development history.

## Files touched
- `server/migrations/2026-07-06-department-scoping.sql` (new)
- `server/departmentScope.cjs`, `server/departmentScope.test.cjs` (new)
- `server/index.js` — schema bootstrap, `getUserDepartments`, `canManageDepartmentMemberships`,
  `/api/unified-stock`, `/api/lots`, 5 CEP DEPO read endpoints, 2 new department-membership
  endpoints, `sanitizeUser` + user/item listing queries, `POST /api/auth/login`,
  `GET /api/auth/me`, and `POST /api/auth/bootstrap` (all 3 now attach departments before
  `sanitizeUser`; the latter two were follow-up fixes)
- `src/api.js` — `updateUserDepartments`, `updateItemDepartments`
- `src/App.jsx` — user form checkboxes, `resetUserForm()` departments reset (follow-up fix),
  item form checkboxes + global flag, Stok badges
- `src/LabComponents.jsx` — item form global/department checkboxes
- `src/CepDepo.jsx` — `KURUMSAL` bypass fix, multi-department Bölüm column

## DB changes
- New tables: `user_departments(userId, department)`, `item_departments(itemDefinitionId, department)`.
- New column: `item_definitions.isGlobal TINYINT(1) NOT NULL DEFAULT 0`.
- Backfilled from existing `users.department` / `item_definitions.department` scalars.
- Old scalar columns (`users.department`, `item_definitions.department`, `lots.department`) untouched.

## Rollback SQL
```sql
DROP TABLE IF EXISTS user_departments;
DROP TABLE IF EXISTS item_departments;
ALTER TABLE item_definitions DROP COLUMN isGlobal;
```
Non-destructive to existing data — the old scalar `department` columns were never touched
and remain intact if this is rolled back.

## Live-DB testing log (2026-07-07, local copy of production)

Testing has since started against a real local MySQL copy identical to production
(schema + data, root/local credentials — not production itself). Findings:

1. **Migration applied cleanly to the local copy.** `2026-07-06-department-scoping.sql`
   ran with zero errors; every pre-existing table, row, and column survived untouched;
   backfill row counts matched exactly (`user_departments`: 1 row / 1 distinct user
   pre-normalization; `item_departments`: 120 rows / 120 distinct items — both matching
   the pre-migration scalar counts exactly). Full `mysqldump` backup taken immediately
   before applying, kept alongside the worktree.
2. **Found a real, production-affecting data problem — the department name mismatch
   the design spec's Risks section warned about actually occurred.** The `departments`
   registry was seeded with English names (`Cytogenetic`, `Molecular Micro`,
   `Molecular Genetic`) that do not match the real strings already in use across
   `item_definitions`/`users`/CEP DEPO tables (`SİTOGENETİK`, `Molecular mikro`,
   `Molecular`). Since department filtering is exact-string, this would have left
   ~97% of real items (117 of 120) permanently invisible to any department-scoped
   user assigned via the new checkboxes — only the 3 "Numune Kabul" items would have
   worked. New migration `server/migrations/2026-07-07-normalize-department-names.sql`
   normalizes all 12 affected tables plus the registry to the canonical Turkish names
   (`SİTOGENETİK`, `Moleküler Mikro`, `Moleküler Genetik`, `Numune Kabul`, `Diğer`),
   confirmed against the owner directly. **Must run after the department-scoping
   migration, on production too, before this feature is usable for real.**
3. Confirmed live end-to-end: `POST /api/auth/login` and `GET /api/auth/me` now
   correctly return a populated `departments` array (previously `[]` for every user,
   per the Task 13 fix above) — verified directly against a real admin account.

## Test steps

**PARTIALLY EXECUTED against a local copy of production — see log above. Production
itself has NOT been touched. Re-run the full checklist below against production (or
this same verified local copy) before merging; items marked done below were actually
observed, not assumed.**

### Migration integrity
- [x] Row-count parity: count of non-null/non-empty `users.department` equals
      `COUNT(DISTINCT userId)` in `user_departments`; same check for
      `item_definitions.department` vs. `item_departments`. — verified against local
      copy, exact match both before and after department-name normalization.
- [x] Spot-check a sample of migrated rows by hand against the original scalar
      `department` values. — done for all 10 users and cross-checked item counts.
- [ ] Verify the rollback SQL above actually runs clean on a scratch copy of the DB.

### Backend — exhaustive role x department matrix
- [ ] `ADMIN`, `SATINAL`, `SATINAL_LOJISTIK`, `KURUMSAL`: confirm `unified-stock`, `lots`,
      and every `cep-depo/*` read endpoint return full, unfiltered results — including
      confirming `getUserDepartments` truly returns `null` (filter skipped), not an
      accidentally-passing filter.
- [ ] `LAB_TECHNICIAN`/`OBSERVER` with **zero** departments: see only `isGlobal = 1` items.
- [ ] `LAB_TECHNICIAN`/`OBSERVER` with **one** department: parity check against that same
      account's pre-migration behavior (regression guard — majority of real accounts
      right after migration).
- [ ] `LAB_TECHNICIAN`/`OBSERVER` with **multiple** departments: result set is the union
      of each department's items/CEP DEPO balances, correctly tagged, no duplicates for
      items tagged to more than one of their departments.
- [ ] Global items appear for every role/department combination including zero-department
      users; toggling `isGlobal` off makes them disappear from non-assigned departments'
      views on the very next request.
- [ ] CEP DEPO end-to-end: run an actual distribute -> consume cycle for a multi-department
      test user and confirm `stock_movements`/`cep_depo_consumptions` still attribute the
      correct single department per transaction.
- [ ] Negative/security test: as a scoped `LAB_TECHNICIAN`, attempt to fetch another
      department's data via a manipulated `?department=X` query param — confirm the server
      ignores it and derives the filter from `userId` server-side only.

### Frontend — manual pass through the actual UI
- [ ] Freshly-migrated single-department `LAB_TECHNICIAN` login: Stok/LOT Stok/CEP DEPO
      look identical to pre-migration (visual regression check).
- [ ] New multi-department test user (created via the new admin checkboxes): combined view
      + department badges render correctly on every affected list.
- [ ] As `ADMIN`/`SATINAL_LOJISTIK`: create/edit a user and toggle department checkboxes,
      create/edit an item and toggle department checkboxes + global flag, confirm changes
      persist and the affected user's very next fetch reflects them (no caching/staleness).
- [ ] DevTools network tab, logged in as a scoped `LAB_TECHNICIAN`/`OBSERVER`: confirm the
      raw JSON response itself excludes unauthorized departments' data — the actual
      security assertion, not just a hidden-in-UI cosmetic check.
- [ ] Specifically re-verify the Task 13 `CepDepo.jsx` Bölüm-column fix: confirm a
      logged-in multi-department user's `currentUser.departments` is populated (not `[]`)
      immediately after login and after a page refresh via `GET /api/auth/me`.
- [ ] Specifically re-verify the Task 10 `resetUserForm()` fix: open the user-management
      panel, edit a user's departments, cancel, then open "add user" — confirm the
      department checkboxes start empty/default rather than carrying over stale state.

### Existing-feature regression sweep
- [ ] Distribute multi-lot picker still works end-to-end for a department-scoped recipient.
- [ ] LOT split / SKT edit / multi-lot Düzelt correction unaffected (write-path, but
      renders from the now-filtered lot lists — verify it still renders what it should for
      the acting user's role).
- [ ] Talep (purchase requests) confirmed unfiltered/unchanged for every role.

## Risks
- **Immediate access narrowing**: any `LAB_TECHNICIAN`/`OBSERVER` account not yet
  re-assigned departments after this deploys will see only `isGlobal` items — this is
  intentional (not grandfathered), but requires an ADMIN pass to re-assign real users
  immediately after deploy (see design spec §7 step 6).
- Free-text department name mismatches (typos/casing) between legacy scalar values and
  the `departments` registry will silently exclude items/users from filtering — audit
  before relying on this in production.
- **Untested against live data as of this commit**: the full checklist above has not been
  executed against production or any real dataset. Everything in this feature — including
  the three review-caught bugs already fixed — has only been verified by code reading and
  unit-level review, not by exercising the running system end-to-end. Treat this branch as
  unverified for merge purposes until a human runs the checklist and updates this file.
- The three review-caught bugs (`resetUserForm()` departments reset; `login`/`me`/`bootstrap`
  missing `departments` before `sanitizeUser`) are strong evidence that this feature area
  has several call sites that all need the same "attach departments" treatment. A `grep`
  for every `sanitizeUser(` call site was run during close-out and confirmed exactly 3
  exist, all now fixed — but other places `users.department` (the legacy scalar) is read
  directly, outside `sanitizeUser`, were not re-audited and are worth a final look before
  sign-off.
