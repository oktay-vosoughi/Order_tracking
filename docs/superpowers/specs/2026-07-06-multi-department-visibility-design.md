# Design Spec — Multi-Department Stock & CEP DEPO Visibility

**Date:** 2026-07-06
**Author:** Oktay Vosoughi (with Claude)
**Status:** Approved for planning
**Change log target:** `updates/UPDATE_2026-07-06_department_scoping.md`

---

## 1. Problem & Goal

Today, department is a **single scalar value** everywhere it appears: one department per user
(`users.department`), one per item (`item_definitions.department`, `lots.department`), and CEP DEPO
balances are keyed one department per row (`cep_depo_balances` unique on `(department, itemId)` —
see `docs/superpowers/specs/2026-07-01-shared-cep-depo-design.md`). The two general stock views,
`GET /api/unified-stock` and `GET /api/lots`, are currently **unfiltered by department for any role** —
every authenticated user sees all stock regardless of department.

**Goal:** Scope stock and CEP DEPO visibility to department membership, where:
- A user can belong to **multiple** departments.
- An item can be tagged as relevant to **multiple** departments.
- Some items are **global** — visible to every department, including ones created later.
- This is a **read/visibility filter only** — it does not change how stock quantity is tracked,
  written, or how CEP DEPO distribution/consumption transactions work.

---

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope of filtering | Both general stock (`unified-stock`, `lots`) **and** CEP DEPO get department-filtered. Purchase requests (Talep) stay unfiltered. |
| 2 | Who manages assignments | `ADMIN` and `SATINAL_LOJISTIK` can assign users↔departments and items↔departments. |
| 3 | Role visibility | `ADMIN`, `SATINAL`, `SATINAL_LOJISTIK`, `KURUMSAL` bypass filtering entirely (see all departments). `KURUMSAL` is grouped with `SATINAL`/`SATINAL_LOJISTIK` throughout the codebase's existing permission checks (`server/index.js:175-204` — approval, ordering, price visibility), so the same procurement-needs-cross-department-visibility reasoning applies. Only `LAB_TECHNICIAN` and `OBSERVER` are scoped to their assigned department(s). |
| 4 | Department entity | Reuses the existing `departments` registry table (`server/migrations/2026-07-01-shared-cep-depo.sql`) — not a new concept. |
| 5 | Item multi-department meaning | **Visibility/usability only.** An item tagged to multiple departments is just catalog-visible to each; `lots.department` (physical location) is untouched, and CEP DEPO balances remain one row per `(department, item)` as today — a multi-department item can simply have a balance row in more than one department. |
| 6 | Multi-department UX | **Combined view**, not a switcher. A user in N departments sees one merged list across all of them, each row tagged with its department(s). |
| 7 | Global items | Explicit `isGlobal` flag on `item_definitions`. Auto-applies to every department, including ones created after the flag is set — not a manual "assign to all current departments" list. |
| 8 | Migration | Auto-migrate: backfill new join tables from the existing scalar `department` columns. Old scalar columns are kept, untouched, as a deprecated fallback — no code that reads them today needs to change. |
| 9 | Unassigned users | **Not grandfathered.** Any user with zero department memberships (including everyone, right after this migration, since no one has join-table rows yet) sees only `isGlobal` items. `ADMIN`/`SATINAL`/`SATINAL_LOJISTIK` are unaffected (rule #3). This is an intentional, immediate access change — see rollout step in §7. |

---

## 3. Data Model

### 3.1 New table `user_departments`
```sql
CREATE TABLE IF NOT EXISTS user_departments (
  userId INT NOT NULL,
  department VARCHAR(150) NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userId, department),
  FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 New table `item_departments`
```sql
CREATE TABLE IF NOT EXISTS item_departments (
  itemDefinitionId INT NOT NULL,
  department VARCHAR(150) NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (itemDefinitionId, department),
  FOREIGN KEY (itemDefinitionId) REFERENCES item_definitions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Department is stored as the existing free-text name string (matching `cep_depo_balances.department`,
`item_definitions.department`, `users.department`), **not** an id — consistent with the precedent set
in §2 of the shared-CEP-DEPO design (avoids a parallel vocabulary).

### 3.3 `item_definitions`
```sql
ALTER TABLE item_definitions ADD COLUMN isGlobal TINYINT(1) NOT NULL DEFAULT 0;
```

### 3.4 Untouched
- `users.department`, `item_definitions.department`, `lots.department` — kept as deprecated fallback columns.
- `cep_depo_balances`, `cep_depo_distributions`, `cep_depo_consumptions`, `stock_movements` — **no schema change**. Their existing `department` column is reused; filtering widens from `= ?` to `IN (?, ?, ...)`.

---

## 4. Server / API

### 4.1 Department resolution helper
Extends the existing `getUserDeptId()` pattern (`server/index.js:3296`):

```js
async function getUserDepartments(userId, role) {
  if (['ADMIN', 'SATINAL', 'SATINAL_LOJISTIK', 'KURUMSAL'].includes(role)) return null; // null = no filter
  const rows = await query('SELECT department FROM user_departments WHERE userId = ?', [userId]);
  return rows.map(r => r.department); // [] is valid — means global-only
}
```

Resolved server-side from `userId` on every request — never trusted from JWT or request params (JWT/role
staleness is already a documented issue; department membership will change more often than roles).

### 4.2 `GET /api/unified-stock`, `GET /api/lots`
Add a filter, skipped entirely when `getUserDepartments` returns `null`:
```sql
WHERE item_definitions.isGlobal = 1
   OR EXISTS (
     SELECT 1 FROM item_departments d
     WHERE d.itemDefinitionId = item_definitions.id
       AND d.department IN (?, ?, ...)
   )
```
If the resolved department list is empty (`[]`), the `EXISTS` clause naturally matches nothing — only
`isGlobal = 1` items return. No special-case code needed for the empty-list case.

### 4.3 `GET /api/cep-depo/balances|my-balances|movements|distributions|consumptions`
Change existing `WHERE department = ?` to `WHERE department IN (?, ?, ...)` (or skip when `null`). No
other logic changes — write paths (distribute/consume/return) are untouched.

### 4.4 New admin endpoints (`ADMIN`, `SATINAL_LOJISTIK` only)
- `PUT /api/users/:id/departments` — replace a user's department memberships (body: `{ departments: [...] }`).
- `PUT /api/item-definitions/:id/departments` — replace an item's department tags + `isGlobal` flag.

Both wrapped in `withTransaction` (delete-then-insert the join rows), parameterized queries only.

---

## 5. Frontend / UX

- **User edit form** (`ADMIN`/`SATINAL_LOJISTIK`): single department dropdown → multi-select checkboxes.
- **Item definition edit form**: multi-select department checkboxes + an "Tüm Departmanlara Açık" (global)
  checkbox. Checking global disables/clears the per-department picks (mutually exclusive in the UI, though
  the backend just treats `isGlobal=1` as an OR condition).
- **Stok / LOT Stok / CEP DEPO tabs**: each row gets small department badge(s), so a multi-department user
  understands why a row appears (combined view — no department switcher, per decision #6).
- No client-side filtering logic — the server returns exactly what the user is allowed to see.

All new UI text Turkish; identifiers English; existing status enums unchanged.

---

## 6. Business Rule Interaction

CEP DEPO's existing request-block rule (§5 of the shared-CEP-DEPO design) keys off the caller's
department pool — unaffected, since a `LAB_TECHNICIAN`'s department list now just widens the `IN (...)`
filter used to find their pool(s); the block logic itself (reaction threshold / any-stock check) is
per-department and unchanged.

---

## 7. Migration Plan

New file: `server/migrations/2026-07-06-department-scoping.sql`. Order matters (no migration-tracking
table — maintain manually per project rules).

1. `CREATE TABLE user_departments`, `CREATE TABLE item_departments`.
2. `ALTER TABLE item_definitions ADD COLUMN isGlobal TINYINT(1) NOT NULL DEFAULT 0`.
3. Backfill: `INSERT INTO user_departments (userId, department) SELECT id, department FROM users WHERE department IS NOT NULL AND department <> ''`.
4. Backfill: `INSERT INTO item_departments (itemDefinitionId, department) SELECT id, department FROM item_definitions WHERE department IS NOT NULL AND department <> ''`.
5. **Row-count parity check** (manual, before considering migration done): count of non-null/non-empty
   `users.department` must equal `COUNT(DISTINCT userId)` in `user_departments`; same for items.
6. **Rollout step — do this immediately after deploying, before real users are affected:**
   `ADMIN` reviews every existing user (especially `LAB_TECHNICIAN`/`OBSERVER`) and confirms their
   migrated department(s) are correct, since per decision #9 anyone whose department didn't carry over
   cleanly (e.g. was blank, or free-text that didn't match `departments.name` exactly) will otherwise be
   restricted to global-only items with no grandfathering.
7. Write `updates/UPDATE_2026-07-06_department_scoping.md`: summary, files touched, DB changes,
   **rollback SQL**, test steps, risks.

**Rollback:** `DROP TABLE user_departments, item_departments; ALTER TABLE item_definitions DROP COLUMN isGlobal;`
— non-destructive to existing data (old scalar columns were never touched), safe to run at any time.

---

## 8. Testing Plan (must be executed live against the dev DB before merge)

### 8.1 Migration integrity
- Row-count parity (§7.5) for both `user_departments` and `item_departments`.
- Spot-check a sample of migrated rows by hand against the original scalar `department` values.
- Verify the rollback SQL (§7 Rollback) actually runs clean on a scratch copy of the DB.

### 8.2 Backend — exhaustive role × department matrix
- `ADMIN`, `SATINAL`, `SATINAL_LOJISTIK`, `KURUMSAL`: confirm `unified-stock`, `lots`, and every
  `cep-depo/*` read endpoint return full, unfiltered results — including verifying the filter is truly
  skipped (`getUserDepartments` returns `null`), not accidentally applied and passing.
- `LAB_TECHNICIAN`/`OBSERVER` with **zero** departments: see only `isGlobal = 1` items — confirms
  least-privilege default rather than an empty-filter-means-everything bug.
- `LAB_TECHNICIAN`/`OBSERVER` with **one** department: parity check against pre-migration behavior for
  that same account (regression guard — this is the majority of real accounts right after migration).
- `LAB_TECHNICIAN`/`OBSERVER` with **multiple** departments: confirm the result set is the union of each
  department's items/CEP DEPO balances, correctly tagged, no duplicates for items in more than one of
  their departments.
- Global items: appear for every role/department combination including zero-department users; toggling
  `isGlobal` off makes them disappear from non-assigned departments' views on the very next request.
- CEP DEPO end-to-end: run an actual distribute → consume cycle for a multi-department test user and
  confirm `stock_movements`/`cep_depo_consumptions` still attribute the correct single department per
  transaction (write paths must stay unaffected by the read-side scoping change).
- Negative/security test: as a scoped `LAB_TECHNICIAN`, attempt to fetch another department's data via a
  manipulated query param (e.g. `?department=X`) — confirm the server ignores it and still derives the
  filter from `userId` server-side, never from client input.

### 8.3 Frontend — manual pass through the actual UI
- Log in as a freshly-migrated single-department `LAB_TECHNICIAN` → Stok/LOT Stok/CEP DEPO look identical
  to pre-migration (visual regression check).
- Log in as a new multi-department test user (created via the new admin checkboxes) → combined view +
  department badges render correctly on every affected list.
- As `ADMIN`/`SATINAL_LOJISTIK`: create/edit a user and toggle department checkboxes, create/edit an item
  and toggle department checkboxes + global flag, confirm changes persist and the affected user's very
  next fetch reflects them (no caching/staleness).
- DevTools network tab, logged in as a scoped `LAB_TECHNICIAN`/`OBSERVER`: confirm the raw JSON response
  itself excludes unauthorized departments' data — the actual security assertion, not just a hidden-in-UI
  cosmetic check.

### 8.4 Existing-feature regression sweep
- Distribute multi-lot picker still works end-to-end for a department-scoped recipient.
- LOT split / SKT edit / multi-lot Düzelt correction unaffected (write-path, but renders from the same
  now-filtered lot lists — verify it still renders what it should for the acting user's role).
- Talep (purchase requests) confirmed unfiltered/unchanged for every role.

---

## 9. Edge Cases

- Item created with zero departments and not global → invisible to all non-bypass roles. Item form shows
  a soft warning (not a hard block) on save if this state is reached.
- A `LAB_TECHNICIAN` in departments A and B sees the union of A's and B's items/CEP DEPO balances, with
  no duplicate rows for items tagged to both.
- Toggling `isGlobal` on/off takes effect immediately on the next request (no caching, no re-login needed)
  — consistent with resolving department/role state fresh per request rather than trusting the JWT.
- Existing write paths (receive, distribute, consume, return, corrections, LOT split/SKT edit) are
  completely unaffected — this feature only adds `WHERE`/`EXISTS` clauses to read endpoints.

---

## 10. Definition of Done

- `ADMIN`/`SATINAL`/`SATINAL_LOJISTIK`/`KURUMSAL` see all stock/CEP DEPO across every department, unchanged from today.
- A `LAB_TECHNICIAN`/`OBSERVER` with one department sees exactly what they see today (regression parity)
  once their migrated department is confirmed correct.
- A `LAB_TECHNICIAN`/`OBSERVER` in multiple departments sees the combined, correctly-tagged, deduplicated
  union of their departments' stock/CEP DEPO.
- A `LAB_TECHNICIAN`/`OBSERVER` with zero departments sees only `isGlobal` items.
- `ADMIN`/`SATINAL_LOJISTIK` can assign multi-department memberships to users and items, and toggle
  `isGlobal`, via the updated forms.
- No write path, stock quantity truth (`lots.currentQuantity`), or Talep visibility changed.
- Change-log file created with rollback SQL; row-count parity verified post-migration.
- Full testing plan (§8) executed and passing against the live dev DB.

---

## 11. Risks & Coupling

- **Immediate access narrowing** for `LAB_TECHNICIAN`/`OBSERVER` accounts right after deploy (decision #9)
  — mitigated by the mandatory rollout review step (§7.6), but this is a real, intentional behavior change
  that must be communicated before shipping, not discovered by a locked-out user.
- **Free-text department mismatch**: since department is a string (not an id), a user's scalar
  `department` value must exactly match a value already used by at least one `item_departments` row (or
  the seeded `departments.name` list) to have any effect. Audit for typos/casing drift before migrating.
- **`getUserDepartments` becomes a new hot-path dependency** for `unified-stock`, `lots`, and all CEP DEPO
  reads — same coupling risk profile as the existing `getUserDeptId()` helper it extends; keep it a single
  source of truth rather than duplicating the role-bypass check per endpoint.
- **Docs already stale**: `docs/05-database-model.md` and `docs/09-risky-areas-and-coupling.md` don't
  document the department model at all (per CLAUDE.md known issues) — this feature makes that gap worse;
  not in scope to fix here, but worth flagging for a future docs pass.
