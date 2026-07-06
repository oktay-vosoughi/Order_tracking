# Multi-Department Stock & CEP DEPO Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope `/api/unified-stock`, `/api/lots`, and CEP DEPO reads to the caller's department membership (many-to-many, with a global-item flag), while `ADMIN`/`SATINAL`/`SATINAL_LOJISTIK`/`KURUMSAL` keep full cross-department visibility, per `docs/superpowers/specs/2026-07-06-multi-department-visibility-design.md`.

**Architecture:** Two new join tables (`user_departments`, `item_departments`) plus an `isGlobal` flag on `item_definitions`, backfilled from the existing single-value `department` scalar columns (which stay untouched as a deprecated fallback). A single server-side helper (`getUserDepartments`) resolves a caller's department list (or `null` for bypass roles) fresh on every request — never from the JWT or a client-supplied query param. Existing read endpoints get a `WHERE`/`EXISTS` filter built from that list; write paths are untouched.

**Tech Stack:** Node.js + Express 4 (CommonJS), MySQL 8 via `mysql2/promise`, React 18 + Vite plain JSX. No test framework is wired up (`npm test` doesn't exist) — this repo's existing test convention is colocated `*.test.cjs`/`*.test.mjs` files using Node's built-in `node:test` + `node:assert/strict`, run directly (e.g. `node --test server/departmentScope.test.cjs`), and they only cover **pure logic** extracted out of DB-touching route handlers (see `server/lotSplit.cjs`/`server/lotSplit.test.cjs` for the existing precedent). This plan follows that same pattern: pure filter-building logic gets a real `node:test` suite; DB-touching endpoint behavior gets a manual live-DB verification checklist in the final task, matching how the last two features in this repo (`shared-cep-depo`, `distribute-lot-skt-selection`) were verified before merge.

## Global Constraints

- No TypeScript — JS/JSX only.
- No new state libraries (no Redux/Context/React Query).
- No ORM — raw `mysql2/promise` with parameterized (`?`) queries only, never string-concatenated SQL.
- Turkish status enums (`ACTIVE`, `TALEP_EDILDI`, etc.) — never renamed.
- Stock truth is `lots.currentQuantity` only — this feature must not touch any write path that mutates it.
- All multi-row mutations go inside `withTransaction`; lot decrements keep `SELECT ... FOR UPDATE` (unaffected here — no lot decrements in this feature).
- All frontend HTTP calls go through `src/api.js` — never raw `fetch()` from a component.
- UI text is Turkish; code identifiers are English; Turkish status enums are never translated.
- Every substantive change ships with `updates/UPDATE_2026-07-06_department_scoping.md` (summary, files touched, DB changes, rollback SQL, test steps, risks).

---

## File Structure

**New files:**
- `server/migrations/2026-07-06-department-scoping.sql` — idempotent schema migration + backfill + documented rollback.
- `server/departmentScope.cjs` — pure, DB-free logic: which roles bypass filtering, and how to build the `WHERE`/`EXISTS` SQL fragments for item-based and CEP-DEPO-based department filtering.
- `server/departmentScope.test.cjs` — `node:test` suite for the above.
- `updates/UPDATE_2026-07-06_department_scoping.md` — change log per project rule.

**Modified files:**
- `server/index.js` — boot-time `ensureCepDepoTables()` mirror of the migration; new `getUserDepartments()` DB helper; new `canManageDepartmentMemberships` middleware; filtering added to `/api/unified-stock`, `/api/lots`, and the 5 CEP DEPO read endpoints; two new endpoints (`PUT /api/users/:id/departments`, `PUT /api/item-definitions/:id/departments`); `sanitizeUser` and the `GET /api/users` / `GET /api/item-definitions` listing queries extended to return department arrays + `isGlobal`.
- `src/api.js` — two new exports: `updateUserDepartments`, `updateItemDepartments`.
- `src/App.jsx` — user form: single department `<select>` → multi-select checkboxes; unified-stock table/mobile card: department badges read from the new array field.
- `src/LabComponents.jsx` — `AddItemFormLab`: add multi-select department checkboxes + "Tüm Departmanlara Açık" (global) checkbox.
- `src/CepDepo.jsx` — fix `isPrivileged` to include `KURUMSAL`; show the "Bölüm" column for lab techs who belong to more than one department.

---

## Task 1: Database migration — join tables, `isGlobal` column, backfill

**Files:**
- Create: `server/migrations/2026-07-06-department-scoping.sql`
- Modify: `server/index.js:3238-3283` (inside `ensureCepDepoTables()`, right after the existing `departments` table setup)

**Interfaces:**
- Produces: tables `user_departments(userId BIGINT UNSIGNED, department VARCHAR(150))`, `item_departments(itemDefinitionId VARCHAR(64), department VARCHAR(150))`; column `item_definitions.isGlobal TINYINT(1) NOT NULL DEFAULT 0`. All later tasks read/write these three names exactly.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration: 2026-07-06-department-scoping.sql
-- Adds multi-department membership for users and items, plus a global-item visibility flag.
-- Design: docs/superpowers/specs/2026-07-06-multi-department-visibility-design.md
-- Plan:   docs/superpowers/plans/2026-07-06-multi-department-visibility.md
-- IDEMPOTENT: safe to re-run (deploy.sh re-runs every migration on each deploy).

CREATE TABLE IF NOT EXISTS user_departments (
  userId BIGINT UNSIGNED NOT NULL,
  department VARCHAR(150) NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userId, department),
  FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_departments (
  itemDefinitionId VARCHAR(64) NOT NULL,
  department VARCHAR(150) NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (itemDefinitionId, department),
  FOREIGN KEY (itemDefinitionId) REFERENCES item_definitions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additive column guard (MySQL has no ADD COLUMN IF NOT EXISTS in all versions used here)
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'item_definitions' AND COLUMN_NAME = 'isGlobal'
);
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE item_definitions ADD COLUMN isGlobal TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill: copy existing single-value department scalars into the new join tables (idempotent via INSERT IGNORE)
INSERT IGNORE INTO user_departments (userId, department)
SELECT id, department FROM users WHERE department IS NOT NULL AND department <> '';

INSERT IGNORE INTO item_departments (itemDefinitionId, department)
SELECT id, department FROM item_definitions WHERE department IS NOT NULL AND department <> '';

-- ROLLBACK:
-- DROP TABLE IF EXISTS user_departments;
-- DROP TABLE IF EXISTS item_departments;
-- ALTER TABLE item_definitions DROP COLUMN isGlobal;
```

- [ ] **Step 2: Mirror the same schema changes into the boot-time idempotent setup**

Open `server/index.js` and find `ensureCepDepoTables()`. Locate the existing `departments` table block (search for `CREATE TABLE IF NOT EXISTS departments`, around line 3238) and the department-seed block right after it (around line 3274-3283). Immediately after that seed block, insert:

```javascript
  // Multi-department membership (user_departments / item_departments) — see
  // docs/superpowers/specs/2026-07-06-multi-department-visibility-design.md
  await pool.query(`CREATE TABLE IF NOT EXISTS user_departments (
    userId BIGINT UNSIGNED NOT NULL,
    department VARCHAR(150) NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userId, department),
    FOREIGN KEY (userId) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await pool.query(`CREATE TABLE IF NOT EXISTS item_departments (
    itemDefinitionId VARCHAR(64) NOT NULL,
    department VARCHAR(150) NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (itemDefinitionId, department),
    FOREIGN KEY (itemDefinitionId) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

  await ensureColumn('item_definitions', 'isGlobal', 'isGlobal TINYINT(1) NOT NULL DEFAULT 0');

  // Backfill from the legacy scalar columns (idempotent — INSERT IGNORE skips rows already migrated)
  await pool.query(`
    INSERT IGNORE INTO user_departments (userId, department)
    SELECT id, department FROM users WHERE department IS NOT NULL AND department <> ''
  `);
  await pool.query(`
    INSERT IGNORE INTO item_departments (itemDefinitionId, department)
    SELECT id, department FROM item_definitions WHERE department IS NOT NULL AND department <> ''
  `);
```

(This uses the `ensureColumn` helper already defined earlier in the same function, at `server/index.js:3120-3128` — do not redefine it.)

- [ ] **Step 3: Verify against a running dev DB**

Start the server (`npm run server`) against your dev DB and confirm boot logs show no errors. Then run:

```bash
mysql -u <DB_USER> <DB_NAME> -e "SHOW TABLES LIKE '%departments%';"
mysql -u <DB_USER> <DB_NAME> -e "SELECT COUNT(*) FROM user_departments;"
mysql -u <DB_USER> <DB_NAME> -e "SELECT COUNT(*) FROM item_departments;"
mysql -u <DB_USER> <DB_NAME> -e "SELECT COUNT(*) FROM users WHERE department IS NOT NULL AND department <> '';"
mysql -u <DB_USER> <DB_NAME> -e "SELECT COUNT(DISTINCT userId) FROM user_departments;"
```

Expected: `user_departments`, `item_departments` tables exist; the two `COUNT`/`COUNT(DISTINCT userId)` pairs match (row-count parity per the design spec's §8.1).

- [ ] **Step 4: Commit**

```bash
git add server/migrations/2026-07-06-department-scoping.sql server/index.js
git commit -m "feat(db): add user_departments/item_departments join tables + isGlobal flag"
```

---

## Task 2: Pure department-filter helper module + unit tests

**Files:**
- Create: `server/departmentScope.cjs`
- Create: `server/departmentScope.test.cjs`

**Interfaces:**
- Produces: `DEPARTMENT_BYPASS_ROLES: string[]`, `isBypassRole(role: string): boolean`, `buildItemDepartmentFilter(departments: string[]|null): { clause: string, params: any[] }`, `buildDeptInClause(departments: string[], columnRef: string): { clause: string, params: any[] }`.
- Consumed by: Task 3 (`getUserDepartments`), Tasks 4-6 (endpoint filtering).

- [ ] **Step 1: Write the failing test**

```javascript
// server/departmentScope.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEPARTMENT_BYPASS_ROLES,
  isBypassRole,
  buildItemDepartmentFilter,
  buildDeptInClause,
} = require('./departmentScope.cjs');

test('isBypassRole returns true for ADMIN, SATINAL, SATINAL_LOJISTIK, KURUMSAL', () => {
  assert.equal(isBypassRole('ADMIN'), true);
  assert.equal(isBypassRole('SATINAL'), true);
  assert.equal(isBypassRole('SATINAL_LOJISTIK'), true);
  assert.equal(isBypassRole('KURUMSAL'), true);
});

test('isBypassRole returns false for LAB_TECHNICIAN and OBSERVER', () => {
  assert.equal(isBypassRole('LAB_TECHNICIAN'), false);
  assert.equal(isBypassRole('OBSERVER'), false);
});

test('DEPARTMENT_BYPASS_ROLES contains exactly the four bypass roles', () => {
  assert.deepEqual(
    [...DEPARTMENT_BYPASS_ROLES].sort(),
    ['ADMIN', 'KURUMSAL', 'SATINAL', 'SATINAL_LOJISTIK'].sort()
  );
});

test('buildItemDepartmentFilter returns an empty clause for null (bypass)', () => {
  const result = buildItemDepartmentFilter(null);
  assert.equal(result.clause, '');
  assert.deepEqual(result.params, []);
});

test('buildItemDepartmentFilter returns an isGlobal-only clause for an empty array', () => {
  const result = buildItemDepartmentFilter([]);
  assert.equal(result.clause, 'AND (id.isGlobal = 1)');
  assert.deepEqual(result.params, []);
});

test('buildItemDepartmentFilter returns an EXISTS clause with placeholders for one department', () => {
  const result = buildItemDepartmentFilter(['Numune Kabul']);
  assert.equal(
    result.clause,
    "AND (id.isGlobal = 1 OR EXISTS (SELECT 1 FROM item_departments d WHERE d.itemDefinitionId = id.id AND d.department IN (?)))"
  );
  assert.deepEqual(result.params, ['Numune Kabul']);
});

test('buildItemDepartmentFilter handles multiple departments with matching placeholder count', () => {
  const result = buildItemDepartmentFilter(['Numune Kabul', 'Molecular Micro']);
  assert.equal(
    result.clause,
    "AND (id.isGlobal = 1 OR EXISTS (SELECT 1 FROM item_departments d WHERE d.itemDefinitionId = id.id AND d.department IN (?,?)))"
  );
  assert.deepEqual(result.params, ['Numune Kabul', 'Molecular Micro']);
});

test('buildDeptInClause returns an empty clause for null (bypass)', () => {
  const result = buildDeptInClause(null, 'b.department');
  assert.equal(result.clause, '');
  assert.deepEqual(result.params, []);
});

test('buildDeptInClause builds an IN clause for a non-empty department list', () => {
  const result = buildDeptInClause(['Sitogenetik', 'Diğer'], 'b.department');
  assert.equal(result.clause, 'AND b.department IN (?,?)');
  assert.deepEqual(result.params, ['Sitogenetik', 'Diğer']);
});

test('buildDeptInClause throws on an empty array — callers must short-circuit before calling', () => {
  assert.throws(() => buildDeptInClause([], 'b.department'), /non-empty/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/departmentScope.test.cjs`
Expected: FAIL with `Cannot find module './departmentScope.cjs'`.

- [ ] **Step 3: Write the implementation**

```javascript
// server/departmentScope.cjs
// Pure, DB-free logic for department-scoped visibility filtering.
// See docs/superpowers/specs/2026-07-06-multi-department-visibility-design.md

const DEPARTMENT_BYPASS_ROLES = ['ADMIN', 'SATINAL', 'SATINAL_LOJISTIK', 'KURUMSAL'];

function isBypassRole(role) {
  return DEPARTMENT_BYPASS_ROLES.includes(role);
}

// departments: string[] (caller's memberships) or null (bypass — caller sees everything).
// Used for item_definitions-backed queries (unified-stock, lots) where a global-item
// flag also grants visibility regardless of department membership.
function buildItemDepartmentFilter(departments) {
  if (departments === null) return { clause: '', params: [] };
  if (departments.length === 0) return { clause: 'AND (id.isGlobal = 1)', params: [] };
  const placeholders = departments.map(() => '?').join(',');
  return {
    clause: `AND (id.isGlobal = 1 OR EXISTS (SELECT 1 FROM item_departments d WHERE d.itemDefinitionId = id.id AND d.department IN (${placeholders})))`,
    params: [...departments],
  };
}

// departments: string[] (must be non-empty — callers with zero departments should
// short-circuit to an empty result before calling this) or null (bypass).
// Used for CEP DEPO tables, which have no isGlobal concept — a balance/movement/
// distribution/consumption row always belongs to exactly one department.
function buildDeptInClause(departments, columnRef) {
  if (departments === null) return { clause: '', params: [] };
  if (departments.length === 0) throw new Error('buildDeptInClause requires a non-empty department list; caller must short-circuit first');
  const placeholders = departments.map(() => '?').join(',');
  return { clause: `AND ${columnRef} IN (${placeholders})`, params: [...departments] };
}

module.exports = { DEPARTMENT_BYPASS_ROLES, isBypassRole, buildItemDepartmentFilter, buildDeptInClause };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/departmentScope.test.cjs`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/departmentScope.cjs server/departmentScope.test.cjs
git commit -m "feat(server): add pure department-filter builder + unit tests"
```

---

## Task 3: Wire `getUserDepartments()` + `canManageDepartmentMemberships` into `server/index.js`

**Files:**
- Modify: `server/index.js:1-20` (top-of-file `require`s), `server/index.js:173-205` (capability helpers), `server/index.js:3296-3300` (next to `getUserDeptId`)

**Interfaces:**
- Consumes: `isBypassRole` from `server/departmentScope.cjs` (Task 2).
- Produces: `async function getUserDepartments(userId, role): Promise<string[]|null>`, `canManageDepartmentMemberships(req, res, next)` middleware. Consumed by Tasks 4-8.

- [ ] **Step 1: Import the new module**

Find the top of `server/index.js` where other local modules are required (e.g. search for `require('./lotSplit`). Add:

```javascript
const { isBypassRole, buildItemDepartmentFilter, buildDeptInClause } = require('./departmentScope.cjs');
```

- [ ] **Step 2: Add the department-resolution helper next to `getUserDeptId`**

Find `getUserDeptId` at `server/index.js:3296-3300`. Immediately after it, add:

```javascript
// Resolve a caller's department memberships — null means "no filter" (bypass role).
// Always resolved fresh from the DB per request; never trust JWT or query params.
async function getUserDepartments(userId, role) {
  if (isBypassRole(role)) return null;
  const rows = await all(pool, 'SELECT department FROM user_departments WHERE userId = ?', [userId]);
  return rows.map((r) => r.department);
}
```

- [ ] **Step 3: Add the new capability middleware**

Find the block of `can*` capability helpers at `server/index.js:173-205` (e.g. `canManageItems`, `canViewPrices`). Immediately after `canManageItems`, add:

```javascript
// Who can assign user<->department and item<->department memberships (distinct
// from canManageItems, which is broader — SATINAL/KURUMSAL manage item catalog
// fields but not department assignment scope).
const canManageDepartmentMemberships = (req, res, next) =>
  requireRole([ROLES.ADMIN, ROLES.SATINAL_LOJISTIK])(req, res, next);
```

- [ ] **Step 4: Manually verify**

Restart the server (`npm run server`), confirm it boots without errors (a syntax error in the new code would crash startup immediately — check the terminal output).

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(server): add getUserDepartments helper + canManageDepartmentMemberships middleware"
```

---

## Task 4: Filter `GET /api/unified-stock` by department

**Files:**
- Modify: `server/index.js:1518-1588`

**Interfaces:**
- Consumes: `getUserDepartments`, `buildItemDepartmentFilter` (Tasks 2-3).
- Produces: each item in the `items` response array now includes `isGlobal: boolean` and `departments: string[]` (parsed from a `GROUP_CONCAT`). Consumed by Task 12 (frontend badges).

- [ ] **Step 1: Change the handler signature and add the filter**

Find `app.get('/api/unified-stock', authRequired, async (_req, res) => {` at `server/index.js:1518`. Change `_req` to `req` (it currently ignores the request entirely). Inside the `try` block, before the `all(pool, ...)` call, add:

```javascript
    const departments = await getUserDepartments(req.user.id, req.user.role);
    const deptFilter = buildItemDepartmentFilter(departments);
```

- [ ] **Step 2: Add the filter clause and new SELECT columns to the query**

In the same query string, change:
```sql
        id.createdAt,
        id.createdBy,
```
to:
```sql
        id.createdAt,
        id.createdBy,
        id.isGlobal,
        (SELECT GROUP_CONCAT(department SEPARATOR '||') FROM item_departments WHERE itemDefinitionId = id.id) AS departmentsRaw,
```

Then change the `WHERE` clause from:
```sql
      WHERE id.status = 'ACTIVE'
```
to:
```sql
      WHERE id.status = 'ACTIVE'
      ${deptFilter.clause}
```

And change the `all(pool, ...)` call from a single-argument template-string call to pass `deptFilter.params`:
```javascript
    const items = await all(pool, `
      ...(the existing SQL, with the deptFilter.clause interpolated in place above)...
    `, deptFilter.params);
```

- [ ] **Step 3: Map `departmentsRaw` into a `departments` array before responding**

After the `all(...)` call and before `res.json({ items })`, add:

```javascript
    const mapped = items.map((item) => {
      const { departmentsRaw, ...rest } = item;
      return {
        ...rest,
        isGlobal: !!item.isGlobal,
        departments: departmentsRaw ? departmentsRaw.split('||') : [],
      };
    });
    res.json({ items: mapped });
```

Remove the old `res.json({ items })` line.

- [ ] **Step 4: Manually verify against the dev DB**

With the server running, log in as `ADMIN` and hit the endpoint:
```bash
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:4000/api/unified-stock | head -c 2000
```
Expected: `items` array present, each item has `isGlobal` (boolean) and `departments` (array) fields, and the full item list is unfiltered (ADMIN bypasses).

Then log in as a `LAB_TECHNICIAN` test account with a known single department and repeat — expected: only items where `departments` includes that department, or `isGlobal: true`.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(server): department-filter /api/unified-stock"
```

---

## Task 5: Filter `GET /api/lots` by department

**Files:**
- Modify: `server/index.js:1064-1095`

**Interfaces:**
- Consumes: `getUserDepartments`, `buildItemDepartmentFilter` (Tasks 2-3).

- [ ] **Step 1: Add the filter**

Find `app.get('/api/lots', authRequired, async (req, res) => {` at `server/index.js:1064` (this one already receives `req`, no signature change needed). Immediately inside the `try` block, before `let sql = ...`, add:

```javascript
    const departments = await getUserDepartments(req.user.id, req.user.role);
    const deptFilter = buildItemDepartmentFilter(departments);
```

- [ ] **Step 2: Append the filter clause to the existing dynamic `sql` string**

The existing code builds `sql` starting with `WHERE 1=1` and appends `AND ...` clauses conditionally. After the existing `if (expiringSoon === 'true') { ... }` block and before `sql += ' ORDER BY ...'`, add:

```javascript
    if (deptFilter.clause) {
      sql += ` ${deptFilter.clause}`;
      params.push(...deptFilter.params);
    }
```

(The join already aliases `item_definitions` as `id` — see the existing `JOIN item_definitions id ON l.itemId = id.id` in the base query — so `buildItemDepartmentFilter`'s `id.`-prefixed clause resolves correctly with no further changes.)

- [ ] **Step 3: Manually verify against the dev DB**

```bash
curl -s -H "Authorization: Bearer <LAB_TECH_TOKEN>" "http://localhost:4000/api/lots" | head -c 2000
```
Expected: only lots whose item belongs to the caller's department(s) or is global. Repeat as `ADMIN` — expected: all lots, unfiltered.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(server): department-filter /api/lots"
```

---

## Task 6: Filter the 5 CEP DEPO read endpoints; remove the query-param trust gap

**Files:**
- Modify: `server/index.js:3302-3323` (`/api/cep-depo/balances`), `server/index.js:3325-3342` (`/api/cep-depo/my-balances`), `server/index.js:3742-3763` (`/api/cep-depo/movements`), `server/index.js:3765-3785` (`/api/cep-depo/distributions`), `server/index.js:3787-3807` (`/api/cep-depo/consumptions`)

**Interfaces:**
- Consumes: `getUserDepartments`, `buildDeptInClause` (Tasks 2-3).
- Removes the existing `isLabTechnicianRole(role) ? await getUserDeptId(...) : (req.query.department || null)` idiom everywhere it appears — that pattern let any non-lab-tech role (including `OBSERVER`, which is supposed to be scoped) pass an arbitrary `?department=` query param and have it trusted. The new helper ignores query params entirely for scoping purposes.

- [ ] **Step 1: Update `GET /api/cep-depo/balances`**

Replace the body of the handler at `server/index.js:3302-3323`:

```javascript
app.get('/api/cep-depo/balances', authRequired, async (req, res) => {
  try {
    const departments = await getUserDepartments(req.user.id, req.user.role);
    if (departments !== null && departments.length === 0) return res.json({ balances: [] });
    const deptFilter = buildDeptInClause(departments, 'b.department');
    const sql = `
      SELECT b.*, i.code AS itemCode, i.name AS itemName, i.packageUnit, i.consumptionUnit, i.unitsPerPackage, i.consumptionUnitType
      FROM cep_depo_balances b
      LEFT JOIN item_definitions i ON i.id = b.itemId
      WHERE 1=1 ${deptFilter.clause}
      ORDER BY b.department, i.name
    `;
    const balances = await all(pool, sql, deptFilter.params);
    res.json({ balances });
  } catch (error) {
    console.error('Failed to list cep-depo balances', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 2: Update `GET /api/cep-depo/my-balances`**

Replace the body of the handler at `server/index.js:3325-3342`:

```javascript
app.get('/api/cep-depo/my-balances', authRequired, async (req, res) => {
  try {
    const departments = await getUserDepartments(req.user.id, req.user.role);
    if (departments !== null && departments.length === 0) return res.json({ balances: [] });
    const deptFilter = buildDeptInClause(departments, 'b.department');
    const balances = await all(pool, `
      SELECT b.*, i.code AS itemCode, i.name AS itemName, i.packageUnit, i.consumptionUnit, i.unitsPerPackage, i.consumptionUnitType
      FROM cep_depo_balances b
      LEFT JOIN item_definitions i ON i.id = b.itemId
      WHERE 1=1 ${deptFilter.clause}
      ORDER BY i.name
    `, deptFilter.params);
    res.json({ balances });
  } catch (error) {
    console.error('Failed to list my cep-depo balances', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 3: Update `GET /api/cep-depo/movements`**

Replace the body of the handler at `server/index.js:3742-3763`:

```javascript
app.get('/api/cep-depo/movements', authRequired, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    const departments = await getUserDepartments(req.user.id, req.user.role);
    if (departments !== null && departments.length === 0) return res.json({ movements: [] });
    const deptFilter = buildDeptInClause(departments, 'm.department');
    const sql = `
      SELECT m.*, i.code AS itemCode, i.name AS itemName
      FROM stock_movements m
      LEFT JOIN item_definitions i ON i.id = m.itemId
      WHERE 1=1 ${deptFilter.clause}
      ORDER BY m.createdAt DESC
      LIMIT ${limit}
    `;
    const movements = await all(pool, sql, deptFilter.params);
    res.json({ movements });
  } catch (error) {
    console.error('Failed to list stock_movements', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 4: Update `GET /api/cep-depo/distributions`**

Replace the body of the handler at `server/index.js:3765-3785`:

```javascript
app.get('/api/cep-depo/distributions', authRequired, async (req, res) => {
  try {
    const departments = await getUserDepartments(req.user.id, req.user.role);
    if (departments !== null && departments.length === 0) return res.json({ distributions: [] });
    const deptFilter = buildDeptInClause(departments, 'd.department');
    const sql = `
      SELECT d.*, i.code AS itemCode, i.name AS itemName
      FROM cep_depo_distributions d
      LEFT JOIN item_definitions i ON i.id = d.itemId
      WHERE 1=1 ${deptFilter.clause}
      ORDER BY d.distributedAt DESC
    `;
    const distributions = await all(pool, sql, deptFilter.params);
    res.json({ distributions });
  } catch (error) {
    console.error('Failed to list cep distributions', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 5: Update `GET /api/cep-depo/consumptions`**

Replace the body of the handler at `server/index.js:3787-3807`:

```javascript
app.get('/api/cep-depo/consumptions', authRequired, async (req, res) => {
  try {
    const departments = await getUserDepartments(req.user.id, req.user.role);
    if (departments !== null && departments.length === 0) return res.json({ consumptions: [] });
    const deptFilter = buildDeptInClause(departments, 'c.department');
    const sql = `
      SELECT c.*, i.code AS itemCode, i.name AS itemName
      FROM cep_depo_consumptions c
      LEFT JOIN item_definitions i ON i.id = c.itemId
      WHERE 1=1 ${deptFilter.clause}
      ORDER BY c.performedAt DESC
    `;
    const consumptions = await all(pool, sql, deptFilter.params);
    res.json({ consumptions });
  } catch (error) {
    console.error('Failed to list cep consumptions', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 6: Manually verify against the dev DB — including the negative security test**

```bash
# As a scoped LAB_TECHNICIAN with department "Numune Kabul":
curl -s -H "Authorization: Bearer <LAB_TECH_TOKEN>" "http://localhost:4000/api/cep-depo/balances" | head -c 1000
# Expected: only "Numune Kabul" rows.

# Negative test — the exact gap this task closes: attempt to see another department
# via a manipulated query param (this endpoint no longer reads req.query.department at all):
curl -s -H "Authorization: Bearer <LAB_TECH_TOKEN>" "http://localhost:4000/api/cep-depo/balances?department=Sitogenetik" | head -c 1000
# Expected: IDENTICAL to the first call — the query param must be silently ignored, not honored.

# As ADMIN:
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" "http://localhost:4000/api/cep-depo/balances" | head -c 1000
# Expected: rows across every department, unfiltered.
```

- [ ] **Step 7: Commit**

```bash
git add server/index.js
git commit -m "fix(server): department-scope CEP DEPO reads, stop trusting client-supplied ?department="
```

---

## Task 7: New endpoint `PUT /api/users/:id/departments` + `sanitizeUser`/`GET /api/users` updates

**Files:**
- Modify: `server/index.js:217-226` (`sanitizeUser`), `server/index.js:508-516` (`GET /api/users`), `server/index.js` (new route, placed near `PATCH /api/users/:id` at line 356)

**Interfaces:**
- Produces: `PUT /api/users/:id/departments` (body `{ departments: string[] }`) → `{ ok: true }`. `sanitizeUser` output now includes `departments: string[]`. Consumed by Task 10 (frontend user form).

- [ ] **Step 1: Update `GET /api/users` to fetch department memberships**

Find `server/index.js:508-516`:
```javascript
app.get('/api/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const users = await all(pool, 'SELECT id, username, role, department, can_receive, can_view_prices, createdAt, createdBy FROM users ORDER BY createdAt DESC');
```
Change to fetch each user's departments in a second query and attach before mapping through `sanitizeUser`:
```javascript
app.get('/api/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const users = await all(pool, 'SELECT id, username, role, department, can_receive, can_view_prices, createdAt, createdBy FROM users ORDER BY createdAt DESC');
    const deptRows = await all(pool, 'SELECT userId, department FROM user_departments');
    const deptsByUser = new Map();
    for (const row of deptRows) {
      if (!deptsByUser.has(row.userId)) deptsByUser.set(row.userId, []);
      deptsByUser.get(row.userId).push(row.department);
    }
    for (const u of users) u.departments = deptsByUser.get(u.id) || [];
```
(Leave the rest of the handler — the `res.json({ users: users.map(sanitizeUser) })` line — unchanged; it will now pick up the attached `.departments` via Step 2.)

- [ ] **Step 2: Update `sanitizeUser` to pass through `departments`**

Find `server/index.js:217-226`:
```javascript
const sanitizeUser = (u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  canReceive: u.can_receive === 1 || u.can_receive === true || u.can_receive === '1',
  canViewPrices: u.can_view_prices === 1 || u.can_view_prices === true || u.can_view_prices === '1',
  department: u.department || null,
  createdAt: u.createdAt,
  createdBy: u.createdBy
});
```
Add one field:
```javascript
const sanitizeUser = (u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  canReceive: u.can_receive === 1 || u.can_receive === true || u.can_receive === '1',
  canViewPrices: u.can_view_prices === 1 || u.can_view_prices === true || u.can_view_prices === '1',
  department: u.department || null,
  departments: Array.isArray(u.departments) ? u.departments : [],
  createdAt: u.createdAt,
  createdBy: u.createdBy
});
```

- [ ] **Step 3: Also attach `departments` in `PATCH /api/users/:id` and `POST /api/users`'s response queries**

Both handlers re-fetch the full user list after mutating (`const users = await all(pool, 'SELECT id, username, role, department, ...')` at lines ~391 and ~537) and return `users.map(sanitizeUser)`. Apply the exact same two-query-then-attach pattern from Step 1 to both of these re-fetch blocks (copy the `deptRows`/`deptsByUser`/attach-loop lines verbatim before the `.map(sanitizeUser)` call in each).

- [ ] **Step 4: Add the new route**

Place this near `PATCH /api/users/:id` (after it, around line 420):

```javascript
// PUT /api/users/:id/departments — replace a user's department memberships wholesale.
app.put('/api/users/:id/departments', authRequired, canManageDepartmentMemberships, async (req, res) => {
  const { departments } = req.body || {};
  if (!Array.isArray(departments)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'departments must be an array' });
  }
  const cleaned = [...new Set(departments.map((d) => String(d).trim()).filter(Boolean))];
  try {
    await withTransaction(async (conn) => {
      await run(conn, 'DELETE FROM user_departments WHERE userId = ?', [req.params.id]);
      for (const dept of cleaned) {
        await run(conn, 'INSERT INTO user_departments (userId, department) VALUES (?, ?)', [req.params.id, dept]);
      }
    });
    res.json({ ok: true, departments: cleaned });
  } catch (error) {
    console.error('Failed to update user departments', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 5: Manually verify against the dev DB**

```bash
curl -s -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"departments":["Numune Kabul","Molecular Micro"]}' \
  http://localhost:4000/api/users/<TEST_USER_ID>/departments
# Expected: {"ok":true,"departments":["Numune Kabul","Molecular Micro"]}

curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:4000/api/users | grep -A2 "<TEST_USER_ID>"
# Expected: that user's "departments" array in the response now shows both values.

# As SATINAL_LOJISTIK (should also succeed):
curl -s -X PUT -H "Authorization: Bearer <SATINAL_LOJISTIK_TOKEN>" -H "Content-Type: application/json" \
  -d '{"departments":["Sitogenetik"]}' \
  http://localhost:4000/api/users/<TEST_USER_ID>/departments
# Expected: 200 ok.

# As a LAB_TECHNICIAN (should be forbidden):
curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "Authorization: Bearer <LAB_TECH_TOKEN>" -H "Content-Type: application/json" \
  -d '{"departments":["Sitogenetik"]}' \
  http://localhost:4000/api/users/<TEST_USER_ID>/departments
# Expected: 403
```

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat(server): add PUT /api/users/:id/departments, return departments[] from user endpoints"
```

---

## Task 8: New endpoint `PUT /api/item-definitions/:id/departments` + listing updates

**Files:**
- Modify: `server/index.js:701-717` (`GET /api/item-definitions`), `server/index.js` (new route, placed near `PUT /api/item-definitions/:id` after its closing `});`)

**Interfaces:**
- Produces: `PUT /api/item-definitions/:id/departments` (body `{ departments: string[], isGlobal: boolean }`) → `{ ok: true }`. `GET /api/item-definitions` response items include `isGlobal: boolean` and `departments: string[]`. Consumed by Task 11 (frontend item form).

- [ ] **Step 1: Update the `GET /api/item-definitions` listing query**

Find `server/index.js:701-717`:
```javascript
app.get('/api/item-definitions', authRequired, async (_req, res) => {
  try {
    const items = await all(pool, `
      SELECT 
        id.*, 
        COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) AS totalStock,
        COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.id END) AS activeLotCount
      FROM item_definitions id
      LEFT JOIN lots l ON id.id = l.itemId
      GROUP BY id.id
      ORDER BY id.name ASC
    `);
    res.json({ items });
  } catch (error) {
    console.error('Failed to get item definitions', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
```
`SELECT id.*` already includes the new `isGlobal` column automatically once Task 1 lands — no SQL change needed for that part. Replace `res.json({ items });` with:
```javascript
    const deptRows = await all(pool, 'SELECT itemDefinitionId, department FROM item_departments');
    const deptsByItem = new Map();
    for (const row of deptRows) {
      if (!deptsByItem.has(row.itemDefinitionId)) deptsByItem.set(row.itemDefinitionId, []);
      deptsByItem.get(row.itemDefinitionId).push(row.department);
    }
    const mapped = items.map((item) => ({
      ...item,
      isGlobal: !!item.isGlobal,
      departments: deptsByItem.get(item.id) || [],
    }));
    res.json({ items: mapped });
```

- [ ] **Step 2: Add the new route**

Place this near `PUT /api/item-definitions/:id` (after its closing `});`, so search for the end of that handler first):

```javascript
// PUT /api/item-definitions/:id/departments — replace an item's department tags + global flag.
app.put('/api/item-definitions/:id/departments', authRequired, canManageDepartmentMemberships, async (req, res) => {
  const { departments, isGlobal } = req.body || {};
  if (!Array.isArray(departments)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'departments must be an array' });
  }
  const cleaned = [...new Set(departments.map((d) => String(d).trim()).filter(Boolean))];
  try {
    await withTransaction(async (conn) => {
      await run(conn, 'UPDATE item_definitions SET isGlobal = ? WHERE id = ?', [isGlobal ? 1 : 0, req.params.id]);
      await run(conn, 'DELETE FROM item_departments WHERE itemDefinitionId = ?', [req.params.id]);
      for (const dept of cleaned) {
        await run(conn, 'INSERT INTO item_departments (itemDefinitionId, department) VALUES (?, ?)', [req.params.id, dept]);
      }
    });
    res.json({ ok: true, departments: cleaned, isGlobal: !!isGlobal });
  } catch (error) {
    console.error('Failed to update item departments', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 3: Manually verify against the dev DB**

```bash
curl -s -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"departments":["Numune Kabul"],"isGlobal":false}' \
  http://localhost:4000/api/item-definitions/<TEST_ITEM_ID>/departments
# Expected: {"ok":true,"departments":["Numune Kabul"],"isGlobal":false}

curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:4000/api/item-definitions | grep -A3 "<TEST_ITEM_ID>"
# Expected: that item's "departments" and "isGlobal" fields reflect the update.

# Toggle isGlobal on, confirm it now appears for a LAB_TECHNICIAN in an unrelated department (Task 4's filter):
curl -s -X PUT -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"departments":[],"isGlobal":true}' \
  http://localhost:4000/api/item-definitions/<TEST_ITEM_ID>/departments
curl -s -H "Authorization: Bearer <LAB_TECH_TOKEN_DIFFERENT_DEPT>" http://localhost:4000/api/unified-stock | grep "<TEST_ITEM_ID>"
# Expected: item now appears for that lab tech.
```

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(server): add PUT /api/item-definitions/:id/departments, return departments[]/isGlobal from listing"
```

---

## Task 9: `src/api.js` — add `updateUserDepartments` and `updateItemDepartments`

**Files:**
- Modify: `src/api.js` (near `updateUser`, line 94; near `updateItemDefinition`, line 220)

**Interfaces:**
- Consumes: `PUT /api/users/:id/departments`, `PUT /api/item-definitions/:id/departments` (Tasks 7-8); the file's existing `apiFetch(path, options)` helper (`src/api.js:18-46`).
- Produces: `updateUserDepartments(id, departments)`, `updateItemDepartments(id, { departments, isGlobal })`. Consumed by Tasks 10-11.

- [ ] **Step 1: Add `updateUserDepartments` immediately after `updateUser`**

Find `src/api.js:94-108` (the `updateUser` export). Immediately after its closing `}`, add:
```javascript
export async function updateUserDepartments(id, departments) {
  return apiFetch(`/users/${id}/departments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ departments })
  });
}
```

- [ ] **Step 2: Add `updateItemDepartments` immediately after `updateItemDefinition`**

Find `src/api.js:220-226` (the `updateItemDefinition` export). Immediately after its closing `}`, add:
```javascript
export async function updateItemDepartments(id, { departments, isGlobal }) {
  return apiFetch(`/item-definitions/${id}/departments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ departments, isGlobal })
  });
}
```

- [ ] **Step 3: Manually verify**

Start the frontend dev server (`npm run dev`) and confirm no build errors from the new exports (a syntax error would fail Vite's build immediately — check the terminal).

- [ ] **Step 4: Commit**

```bash
git add src/api.js
git commit -m "feat(api): add updateUserDepartments, updateItemDepartments"
```

---

## Task 10: Frontend — user form multi-select department checkboxes

**Files:**
- Modify: `src/App.jsx:171-172` (state), `src/App.jsx:2089-2099` (the `<select>`), `src/App.jsx:2192` (table display), `src/App.jsx:2202-2212` (edit-button prefill), `src/App.jsx` save handler (~line 589-592)

**Interfaces:**
- Consumes: `updateUserDepartments` (Task 9), `departments` field from `GET /api/users` (Task 7).

- [ ] **Step 1: Update form state to hold an array**

Find `App.jsx:171-172`:
```javascript
const [userCreateForm, setUserCreateForm] = useState({ username: '', password: '', role: 'SATINAL_LOJISTIK', canReceive: false, department: '' });
```
Change to add a `departments` array alongside the existing (deprecated but untouched) `department` field:
```javascript
const [userCreateForm, setUserCreateForm] = useState({ username: '', password: '', role: 'SATINAL_LOJISTIK', canReceive: false, department: '', departments: [] });
```

- [ ] **Step 2: Replace the single `<select>` with multi-select checkboxes**

Find `App.jsx:2089-2099`:
```jsx
<select
  value={userCreateForm.department}
  onChange={(e) => setUserCreateForm({ ...userCreateForm, department: e.target.value })}
  className="px-4 py-2 border rounded-lg"
  title="Bölüm (CEP DEPO havuzu bu bölüme göre paylaşılır)"
>
  <option value="">Bölüm seç… (opsiyonel)</option>
  {departments.filter((d) => d.active).map((d) => (
    <option key={d.id} value={d.name}>{d.name}</option>
  ))}
</select>
```
Replace with:
```jsx
<div className="px-4 py-2 border rounded-lg" title="Kullanıcının erişebileceği bölümler">
  <div className="text-xs font-medium text-gray-500 mb-1">Bölümler (birden fazla seçilebilir)</div>
  <div className="flex flex-wrap gap-3">
    {departments.filter((d) => d.active).map((d) => (
      <label key={d.id} className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={userCreateForm.departments.includes(d.name)}
          onChange={(e) => {
            const next = e.target.checked
              ? [...userCreateForm.departments, d.name]
              : userCreateForm.departments.filter((x) => x !== d.name);
            setUserCreateForm({ ...userCreateForm, departments: next });
          }}
        />
        {d.name}
      </label>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Update the edit-button prefill**

Find `App.jsx:2202-2212`:
```jsx
onClick={() => {
  setUserCreateForm({ username: u.username, password: '', role: u.role, canReceive: !!u.canReceive, canViewPrices: !!u.canViewPrices, department: u.department || '' });
  setEditingUserId(u.id);
}}
```
Change to:
```jsx
onClick={() => {
  setUserCreateForm({ username: u.username, password: '', role: u.role, canReceive: !!u.canReceive, canViewPrices: !!u.canViewPrices, department: u.department || '', departments: Array.isArray(u.departments) ? u.departments : [] });
  setEditingUserId(u.id);
}}
```

- [ ] **Step 4: Update the table's read-only department display**

Find `App.jsx:2192`:
```jsx
<td className="px-3 py-2 text-xs text-gray-600">{u.department || '-'}</td>
```
Change to show all memberships:
```jsx
<td className="px-3 py-2 text-xs text-gray-600">{(u.departments || []).join(', ') || '-'}</td>
```

- [ ] **Step 5: Wire the save handler to call the new endpoint**

Find `handleSaveUser` at `App.jsx:569-600`:
```javascript
  const handleSaveUser = async () => {
    const trimmedUsername = userCreateForm.username.trim();
    if (!trimmedUsername) {
      alert('Kullanıcı adı zorunludur');
      return;
    }

    if (!editingUserId && !userCreateForm.password) {
      alert('Yeni kullanıcı için şifre gereklidir');
      return;
    }

    if (editingUserId && userCreateForm.password && userCreateForm.password.length < 8) {
      alert('Yeni şifre en az 8 karakter olmalıdır');
      return;
    }

    try {
      let res;
      if (editingUserId) {
        res = await updateUser(editingUserId, trimmedUsername, userCreateForm.role, userCreateForm.password || undefined, userCreateForm.canReceive, userCreateForm.canViewPrices, userCreateForm.department || '');
        alert('Kullanıcı güncellendi');
      } else {
        res = await createUser(trimmedUsername, userCreateForm.password, userCreateForm.role, userCreateForm.department || null);
        alert('Kullanıcı oluşturuldu');
      }
      setUsers(res.users || []);
      resetUserForm();
    } catch (error) {
      alert((editingUserId ? 'Kullanıcı güncellenemedi: ' : 'Kullanıcı oluşturma hatası: ') + (error?.message || 'HATA'));
    }
```
Both branches already return `{ users: [...] }` (the full list — per Task 7's `sanitizeUser` update, each entry now carries `departments`). Change the body of the `try` block to resolve the target user's id and call `updateUserDepartments` before the success alert:
```javascript
    try {
      let res;
      if (editingUserId) {
        res = await updateUser(editingUserId, trimmedUsername, userCreateForm.role, userCreateForm.password || undefined, userCreateForm.canReceive, userCreateForm.canViewPrices, userCreateForm.department || '');
        await updateUserDepartments(editingUserId, userCreateForm.departments);
        alert('Kullanıcı güncellendi');
      } else {
        res = await createUser(trimmedUsername, userCreateForm.password, userCreateForm.role, userCreateForm.department || null);
        const created = (res.users || []).find((u) => u.username === trimmedUsername);
        if (created) {
          await updateUserDepartments(created.id, userCreateForm.departments);
        }
        alert('Kullanıcı oluşturuldu');
      }
      const refreshed = await listUsers();
      setUsers(refreshed.users || []);
      resetUserForm();
    } catch (error) {
      alert((editingUserId ? 'Kullanıcı güncellenemedi: ' : 'Kullanıcı oluşturma hatası: ') + (error?.message || 'HATA'));
    }
```
(Re-fetching via `listUsers()` after the department call, instead of using the stale `res.users` from before `updateUserDepartments` ran, ensures the table reflects the just-saved department memberships immediately.)

Add `updateUserDepartments` to the existing `import { ... } from './api'` block at `App.jsx:4` (alongside `updateUser`, `createUser`, `listUsers`, which are already imported there).

- [ ] **Step 6: Manually verify in the browser**

Start both servers (`npm run server`, `npm run dev`). Log in as `ADMIN`, go to Kullanıcı Yönetimi, create a new user checking two department boxes, save, and confirm the table row shows both department names. Edit an existing user, uncheck one department, save, and confirm the table updates. Reload the page and confirm the change persisted (re-fetch from server, not just local state).

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat(users): multi-select department checkboxes on user form"
```

---

## Task 11: Frontend — item form department checkboxes + global flag

**Files:**
- Modify: `src/LabComponents.jsx:1-60` (imports + department field in `AddItemFormLab`), `src/App.jsx:738-742` (`newItem` state), `src/App.jsx:744-804` (`addItem`), `src/App.jsx:1951-1957` (`<AddItemFormLab>` render site), `src/App.jsx:602-636` (`unitEditForm`/`handleSaveUnitFields`), `src/App.jsx:4416-4487` (unit-fields edit modal JSX)

**Interfaces:**
- Consumes: `updateItemDepartments` (Task 9), dynamic `/api/departments` list (already fetched into `departments` state per Task 10's file, reused here — do not reintroduce the static `DEPARTMENTS` enum from `src/labDepartments.mjs` for this new multi-select, since that list can silently drift out of sync with the runtime-editable registry, per the design spec's flagged inconsistency).

- [ ] **Step 1: Add `departments` (array) and `isGlobal` to `newItem` state**

Find `App.jsx:738-742`:
```javascript
const [newItem, setNewItem] = useState({
  code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: '',
  packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK', minReactionThreshold: 3
});
```
Add two fields:
```javascript
const [newItem, setNewItem] = useState({
  code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: '',
  packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK', minReactionThreshold: 3,
  departmentTags: [], isGlobal: false
});
```
(Named `departmentTags` — not `departments` — to avoid clashing with the existing `department` single-value field already in this same state object, which stays untouched as the deprecated fallback per the migration design.)

- [ ] **Step 2: Replace/extend the department field in `AddItemFormLab`**

Find `src/LabComponents.jsx:48-60`:
```jsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Departman *</label>
  <select
    value={newItem.department}
    onChange={(e) => setNewItem({...newItem, department: e.target.value})}
    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
  >
    <option value="">Seçiniz</option>
    {Object.entries(DEPARTMENTS).map(([key, label]) => (
      <option key={key} value={label}>{label}</option>
    ))}
  </select>
</div>
```
This component's prop signature is `export const AddItemFormLab = ({ newItem, setNewItem, onAdd, onCancel }) => {` (`src/LabComponents.jsx:16`) — it has no access to the dynamic `/api/departments` list today. Change the signature to accept it:
```javascript
export const AddItemFormLab = ({ newItem, setNewItem, onAdd, onCancel, departmentsList }) => {
```
Then find the render site at `src/App.jsx:1951-1957`:
```jsx
        {showAddForm && canModifyInventory && (
          <AddItemFormLab
            newItem={newItem}
            setNewItem={setNewItem}
            onAdd={addItem}
            onCancel={() => setShowAddForm(false)}
          />
        )}
```
Add the prop, passing `App.jsx`'s existing `departments` state (already populated by `fetchDepartments()` at `App.jsx:544`, and already used by the user form's checkboxes from Task 10):
```jsx
        {showAddForm && canModifyInventory && (
          <AddItemFormLab
            newItem={newItem}
            setNewItem={setNewItem}
            onAdd={addItem}
            onCancel={() => setShowAddForm(false)}
            departmentsList={departments}
          />
        )}
```
Now replace the department field block in `src/LabComponents.jsx:48-60` with:
```jsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Departman *</label>
  <select
    value={newItem.department}
    onChange={(e) => setNewItem({...newItem, department: e.target.value})}
    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
  >
    <option value="">Seçiniz</option>
    {Object.entries(DEPARTMENTS).map(([key, label]) => (
      <option key={key} value={label}>{label}</option>
    ))}
  </select>
</div>
<div>
  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
    <input
      type="checkbox"
      checked={newItem.isGlobal}
      onChange={(e) => setNewItem({ ...newItem, isGlobal: e.target.checked, departmentTags: e.target.checked ? [] : newItem.departmentTags })}
    />
    Tüm Departmanlara Açık
  </label>
  {!newItem.isGlobal && (
    <div className="flex flex-wrap gap-3 mt-1">
      {(departmentsList || []).filter((d) => d.active).map((d) => (
        <label key={d.id} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={newItem.departmentTags.includes(d.name)}
            onChange={(e) => {
              const next = e.target.checked
                ? [...newItem.departmentTags, d.name]
                : newItem.departmentTags.filter((x) => x !== d.name);
              setNewItem({ ...newItem, departmentTags: next });
            }}
          />
          {d.name}
        </label>
      ))}
    </div>
  )}
</div>
```
(Left the original single-value `Departman *` select untouched — it still populates the legacy `item_definitions.department` scalar fallback column, per the migration's keep-old-columns decision. The new checkboxes below it populate `item_departments` + `isGlobal` via the separate endpoint.)

- [ ] **Step 3: Wire item creation to call `updateItemDepartments` after creation**

Find `addItem()` at `App.jsx:744-804`. It currently does not capture `createItemDefinition`'s return value:
```javascript
    try {
      await createItemDefinition({
        code: newItem.code,
        name: newItem.name,
        category: newItem.category || '',
        department: newItem.department || '',
        unit: newItem.unit || '',
        minStock: newItem.minStock || 0,
        supplier: newItem.supplier || '',
        catalogNo: newItem.catalogNo || '',
        brand: newItem.brand || '',
        storageLocation: newItem.storageLocation || '',
        storageTemp: newItem.storageTemp || '',
        chemicalType: newItem.chemicalType || '',
        msdsUrl: newItem.msdsUrl || '',
        notes: newItem.wasteStatus || '',
        // CEP DEPO main/sub-unit fields
        packageUnit: newItem.packageUnit || null,
        consumptionUnit: newItem.consumptionUnit || null,
        unitsPerPackage: newItem.unitsPerPackage === '' ? null : Number(newItem.unitsPerPackage) || null,
        consumptionUnitType: newItem.consumptionUnitType || 'PACK',
        minReactionThreshold: newItem.minReactionThreshold === '' ? 3 : Number(newItem.minReactionThreshold)
      });

      await loadUnifiedData();

      setNewItem({
        code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: '',
        packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK', minReactionThreshold: 3
      });
      setShowAddForm(false);
      alert('Malzeme başarıyla eklendi!');
    } catch (error) {
      console.error('Add item error:', error);
      alert('Malzeme eklenemedi: ' + (error?.message || 'Bilinmeyen hata'));
    }
```
Change the first line to capture the result, add the `updateItemDepartments` call right after it, and reset the two new state fields:
```javascript
    try {
      const created = await createItemDefinition({
        code: newItem.code,
        name: newItem.name,
        category: newItem.category || '',
        department: newItem.department || '',
        unit: newItem.unit || '',
        minStock: newItem.minStock || 0,
        supplier: newItem.supplier || '',
        catalogNo: newItem.catalogNo || '',
        brand: newItem.brand || '',
        storageLocation: newItem.storageLocation || '',
        storageTemp: newItem.storageTemp || '',
        chemicalType: newItem.chemicalType || '',
        msdsUrl: newItem.msdsUrl || '',
        notes: newItem.wasteStatus || '',
        // CEP DEPO main/sub-unit fields
        packageUnit: newItem.packageUnit || null,
        consumptionUnit: newItem.consumptionUnit || null,
        unitsPerPackage: newItem.unitsPerPackage === '' ? null : Number(newItem.unitsPerPackage) || null,
        consumptionUnitType: newItem.consumptionUnitType || 'PACK',
        minReactionThreshold: newItem.minReactionThreshold === '' ? 3 : Number(newItem.minReactionThreshold)
      });

      if (created?.item?.id) {
        await updateItemDepartments(created.item.id, { departments: newItem.departmentTags, isGlobal: newItem.isGlobal });
      }

      await loadUnifiedData();

      setNewItem({
        code: '', name: '', category: '', department: '', unit: '', minStock: 0, currentStock: 0, location: '', supplier: '', catalogNo: '', lotNo: '', brand: '', storageLocation: '', expiryDate: '', openingDate: '', storageTemp: '', chemicalType: '', msdsUrl: '', wasteStatus: '',
        packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK', minReactionThreshold: 3,
        departmentTags: [], isGlobal: false
      });
      setShowAddForm(false);
      alert('Malzeme başarıyla eklendi!');
    } catch (error) {
      console.error('Add item error:', error);
      alert('Malzeme eklenemedi: ' + (error?.message || 'Bilinmeyen hata'));
    }
```

Add `updateItemDepartments` to the existing `import { ... } from './api'` block at `App.jsx:4` (alongside `createItemDefinition`, `updateItemDefinition`, which are already imported there).

- [ ] **Step 4: Add department/global editing to the existing unit-fields edit modal**

Find the edit-modal state and save handler at `App.jsx:602-636`:
```javascript
  const [unitEditItem, setUnitEditItem] = useState(null);
  const [unitEditForm, setUnitEditForm] = useState({ packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK' });
```
Add two fields to `unitEditForm`'s initial state:
```javascript
  const [unitEditItem, setUnitEditItem] = useState(null);
  const [unitEditForm, setUnitEditForm] = useState({ packageUnit: '', consumptionUnit: '', unitsPerPackage: '', consumptionUnitType: 'PACK', departmentTags: [], isGlobal: false });
```
There are two call sites that open this modal (mobile card actions and desktop table actions), both seeding `unitEditForm` the same way. First, at `App.jsx:2849-2859`:
```jsx
                          {canModifyInventory && (
                            <button
                              onClick={() => {
                                setUnitEditItem(item);
                                setUnitEditForm({
                                  packageUnit: item.packageUnit || '',
                                  consumptionUnit: item.consumptionUnit || '',
                                  unitsPerPackage: item.unitsPerPackage ?? '',
                                  consumptionUnitType: item.consumptionUnitType || 'PACK'
                                });
                              }}
                              className="status-action status-action--muted"
```
Add the two new fields to the `setUnitEditForm` call:
```jsx
                          {canModifyInventory && (
                            <button
                              onClick={() => {
                                setUnitEditItem(item);
                                setUnitEditForm({
                                  packageUnit: item.packageUnit || '',
                                  consumptionUnit: item.consumptionUnit || '',
                                  unitsPerPackage: item.unitsPerPackage ?? '',
                                  consumptionUnitType: item.consumptionUnitType || 'PACK',
                                  departmentTags: item.departments || [],
                                  isGlobal: !!item.isGlobal
                                });
                              }}
                              className="status-action status-action--muted"
```
Second, the identical pattern at `App.jsx:3045-3056`:
```jsx
                            {canModifyInventory && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUnitEditItem(item);
                                  setUnitEditForm({
                                    packageUnit: item.packageUnit || '',
                                    consumptionUnit: item.consumptionUnit || '',
                                    unitsPerPackage: item.unitsPerPackage ?? '',
                                    consumptionUnitType: item.consumptionUnitType || 'PACK'
                                  });
                                }}
```
Apply the same addition:
```jsx
                            {canModifyInventory && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUnitEditItem(item);
                                  setUnitEditForm({
                                    packageUnit: item.packageUnit || '',
                                    consumptionUnit: item.consumptionUnit || '',
                                    unitsPerPackage: item.unitsPerPackage ?? '',
                                    consumptionUnitType: item.consumptionUnitType || 'PACK',
                                    departmentTags: item.departments || [],
                                    isGlobal: !!item.isGlobal
                                  });
                                }}
```

Find `handleSaveUnitFields` at `App.jsx:621-636`:
```javascript
  const handleSaveUnitFields = async () => {
    if (!unitEditItem) return;
    try {
      await updateItemDefinition(unitEditItem.id, {
        packageUnit: unitEditForm.packageUnit || null,
        consumptionUnit: unitEditForm.consumptionUnit || null,
        unitsPerPackage: unitEditForm.unitsPerPackage === '' ? null : Number(unitEditForm.unitsPerPackage) || null,
        consumptionUnitType: unitEditForm.consumptionUnitType || 'PACK'
      });
      await loadUnifiedData();
      setUnitEditItem(null);
      alert('Birim bilgileri güncellendi. CEP DEPO bakiyeleri otomatik yeniden hesaplandı.');
    } catch (err) {
      alert('Güncelleme başarısız: ' + (err?.message || 'HATA'));
    }
  };
```
Add the `updateItemDepartments` call right after the existing `updateItemDefinition` call:
```javascript
  const handleSaveUnitFields = async () => {
    if (!unitEditItem) return;
    try {
      await updateItemDefinition(unitEditItem.id, {
        packageUnit: unitEditForm.packageUnit || null,
        consumptionUnit: unitEditForm.consumptionUnit || null,
        unitsPerPackage: unitEditForm.unitsPerPackage === '' ? null : Number(unitEditForm.unitsPerPackage) || null,
        consumptionUnitType: unitEditForm.consumptionUnitType || 'PACK'
      });
      await updateItemDepartments(unitEditItem.id, { departments: unitEditForm.departmentTags, isGlobal: unitEditForm.isGlobal });
      await loadUnifiedData();
      setUnitEditItem(null);
      alert('Birim bilgileri güncellendi. CEP DEPO bakiyeleri otomatik yeniden hesaplandı.');
    } catch (err) {
      alert('Güncelleme başarısız: ' + (err?.message || 'HATA'));
    }
  };
```
Finally, add the same two-part UI block used in Step 2 (global checkbox + conditional department checkboxes, reading from `unitEditForm`/`setUnitEditForm` instead of `newItem`/`setNewItem`, and from `departments` — `App.jsx`'s own state, already in scope here, not a `departmentsList` prop) into the modal JSX at `App.jsx:4416-4487`, right after the closing `</div>` of the "Tüketim Tipi" `<select>` block (before the amber warning `{unitEditForm.consumptionUnit && !unitEditForm.unitsPerPackage && (...)}`):
```jsx
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <input
                    type="checkbox"
                    checked={unitEditForm.isGlobal}
                    onChange={(e) => setUnitEditForm({ ...unitEditForm, isGlobal: e.target.checked, departmentTags: e.target.checked ? [] : unitEditForm.departmentTags })}
                  />
                  Tüm Departmanlara Açık
                </label>
                {!unitEditForm.isGlobal && (
                  <div className="flex flex-wrap gap-3 mt-1">
                    {departments.filter((d) => d.active).map((d) => (
                      <label key={d.id} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={unitEditForm.departmentTags.includes(d.name)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...unitEditForm.departmentTags, d.name]
                              : unitEditForm.departmentTags.filter((x) => x !== d.name);
                            setUnitEditForm({ ...unitEditForm, departmentTags: next });
                          }}
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
```

- [ ] **Step 5: Manually verify in the browser**

Log in as `ADMIN`, open Stok tab, create a new item, check "Tüm Departmanlara Açık", save — confirm no per-department checkboxes were required. Create a second item, leave global unchecked, check two department boxes, save. Then edit an existing item via the unit-fields modal and toggle its department tags — confirm the change persists after reload (re-fetch, not just local state) by checking `GET /api/item-definitions` response in DevTools network tab.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/LabComponents.jsx
git commit -m "feat(items): department checkboxes + global-visibility flag on item create/edit"
```

---

## Task 12: Frontend — department badges on the Stok tab

**Files:**
- Modify: `src/App.jsx:2730-2734` (mobile card), `src/App.jsx:2938-2947` (desktop table)

**Interfaces:**
- Consumes: `item.departments: string[]`, `item.isGlobal: boolean` (Task 4).

- [ ] **Step 1: Update the mobile card meta row**

Find `App.jsx:2730-2734`:
```jsx
<div className="mobile-meta-row">
  {item.brand && <span>{item.brand}</span>}
  {item.department && <span>{item.department}</span>}
  {item.activeLotCount > 0 && <span>{item.activeLotCount} LOT</span>}
</div>
```
Change to render the new array (falling back to the legacy scalar only if the array is empty, for any item not yet migrated/tagged):
```jsx
<div className="mobile-meta-row">
  {item.brand && <span>{item.brand}</span>}
  {item.isGlobal && <span>Genel</span>}
  {!item.isGlobal && (item.departments?.length ? item.departments : item.department ? [item.department] : []).map((d) => (
    <span key={d}>{d}</span>
  ))}
  {item.activeLotCount > 0 && <span>{item.activeLotCount} LOT</span>}
</div>
```

- [ ] **Step 2: Update the desktop table badge row**

Find `App.jsx:2938-2947`:
```jsx
<div className="flex flex-wrap gap-1 mt-1">
  {item.brand && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{item.brand}</span>}
  {item.department && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{item.department}</span>}
  {item.category && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">{item.category}</span>}
  {item.activeLotCount > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">{item.activeLotCount} LOT</span>}
</div>
```
Change to:
```jsx
<div className="flex flex-wrap gap-1 mt-1">
  {item.brand && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{item.brand}</span>}
  {item.isGlobal && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Genel</span>}
  {!item.isGlobal && (item.departments?.length ? item.departments : item.department ? [item.department] : []).map((d) => (
    <span key={d} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{d}</span>
  ))}
  {item.category && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">{item.category}</span>}
  {item.activeLotCount > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">{item.activeLotCount} LOT</span>}
</div>
```

- [ ] **Step 3: Manually verify in the browser**

Reload the Stok tab as `ADMIN` — confirm items with multiple department tags show multiple blue badges, global items show a single green "Genel" badge instead, and items with only the legacy scalar (not yet re-tagged) still show their one badge via the fallback.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(stock): render multi-department/global badges on Stok tab"
```

---

## Task 13: Frontend — `CepDepo.jsx` fixes (`KURUMSAL` bypass, multi-department Bölüm column)

**Files:**
- Modify: `src/CepDepo.jsx:28-33` (`isPrivileged`, new `showDeptColumn`), `src/CepDepo.jsx:283-332` (`balanceTable`)

**Interfaces:**
- Consumes: `currentUser.role`, `currentUser.departments` (prop already passed into `CepDepo`, now carrying the array per Task 7).

- [ ] **Step 1: Fix `isPrivileged` to include `KURUMSAL`**

Find `src/CepDepo.jsx:28-33`:
```javascript
export default function CepDepo({ currentUser }) {
  const role = currentUser?.role;
  const isLabTech = role === 'LAB_TECHNICIAN';
  const isAdmin = role === 'ADMIN';
  const isSatinal = role === 'SATINAL';
  const isPrivileged = isAdmin || isSatinal || role === 'SATINAL_LOJISTIK';
```
Change the last line to:
```javascript
export default function CepDepo({ currentUser }) {
  const role = currentUser?.role;
  const isLabTech = role === 'LAB_TECHNICIAN';
  const isAdmin = role === 'ADMIN';
  const isSatinal = role === 'SATINAL';
  const isPrivileged = isAdmin || isSatinal || role === 'SATINAL_LOJISTIK' || role === 'KURUMSAL';
  const showDeptColumn = !isLabTech || (Array.isArray(currentUser?.departments) && currentUser.departments.length > 1);
```

- [ ] **Step 2: Show the Bölüm column for multi-department lab techs too**

Find `balanceTable` at `src/CepDepo.jsx:283-332`:
```javascript
  const balanceTable = (rows) => {
    const q = balanceSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter((b) =>
          String(b.itemName || '').toLowerCase().includes(q) ||
          String(b.itemCode || '').toLowerCase().includes(q))
      : rows;
    // Columns: [Bölüm if !isLabTech] + Ürün + Miktar + Son Dağıtım + Durum + [action if privileged]
    const colSpan = 4 + (!isLabTech ? 1 : 0) + (isPrivileged ? 1 : 0);
    return (
      <div>
        <input
          type="text"
          value={balanceSearch}
          onChange={(e) => setBalanceSearch(e.target.value)}
          placeholder="Ürün ara (ad veya kod)..."
          className="mb-3 w-full sm:w-72 px-3 py-2 border rounded text-sm"
        />
        <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {!isLabTech && <th className="px-3 py-2 text-left">Bölüm</th>}
              <th className="px-3 py-2 text-left">Ürün</th>
              <th className="px-3 py-2 text-right">Miktar</th>
              <th className="px-3 py-2 text-left">Son Dağıtım</th>
              <th className="px-3 py-2 text-left">Durum</th>
              {isPrivileged && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={colSpan} className="px-3 py-4 text-center text-gray-500">Kayıt yok.</td></tr>
            )}
            {filtered.map((b) => {
              const pkgLabel = b.packageUnit || 'koli';
              const hasSubUnit = b.consumptionUnitType !== 'PACK' && b.consumptionUnit;
              const conLabel = hasSubUnit ? b.consumptionUnit : pkgLabel;
              const qty = hasSubUnit
                ? (isFinite(Number(b.unitQty)) ? Number(b.unitQty) : 0).toFixed(0)
                : (isFinite(Number(b.packQty)) ? Number(b.packQty) : 0).toFixed(2);
              return (
                <tr key={b.id} className="border-t">
                  {!isLabTech && <td className="px-3 py-2">{b.department || '-'}</td>}
                  <td className="px-3 py-2">
```
Replace the four `!isLabTech` occurrences (the comment, the `colSpan` calculation, the `<th>`, and the `<td>`) with `showDeptColumn`:
```javascript
  const balanceTable = (rows) => {
    const q = balanceSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter((b) =>
          String(b.itemName || '').toLowerCase().includes(q) ||
          String(b.itemCode || '').toLowerCase().includes(q))
      : rows;
    // Columns: [Bölüm if showDeptColumn] + Ürün + Miktar + Son Dağıtım + Durum + [action if privileged]
    const colSpan = 4 + (showDeptColumn ? 1 : 0) + (isPrivileged ? 1 : 0);
    return (
      <div>
        <input
          type="text"
          value={balanceSearch}
          onChange={(e) => setBalanceSearch(e.target.value)}
          placeholder="Ürün ara (ad veya kod)..."
          className="mb-3 w-full sm:w-72 px-3 py-2 border rounded text-sm"
        />
        <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {showDeptColumn && <th className="px-3 py-2 text-left">Bölüm</th>}
              <th className="px-3 py-2 text-left">Ürün</th>
              <th className="px-3 py-2 text-right">Miktar</th>
              <th className="px-3 py-2 text-left">Son Dağıtım</th>
              <th className="px-3 py-2 text-left">Durum</th>
              {isPrivileged && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={colSpan} className="px-3 py-4 text-center text-gray-500">Kayıt yok.</td></tr>
            )}
            {filtered.map((b) => {
              const pkgLabel = b.packageUnit || 'koli';
              const hasSubUnit = b.consumptionUnitType !== 'PACK' && b.consumptionUnit;
              const conLabel = hasSubUnit ? b.consumptionUnit : pkgLabel;
              const qty = hasSubUnit
                ? (isFinite(Number(b.unitQty)) ? Number(b.unitQty) : 0).toFixed(0)
                : (isFinite(Number(b.packQty)) ? Number(b.packQty) : 0).toFixed(2);
              return (
                <tr key={b.id} className="border-t">
                  {showDeptColumn && <td className="px-3 py-2">{b.department || '-'}</td>}
                  <td className="px-3 py-2">
```

- [ ] **Step 3: Manually verify in the browser**

Using a test `LAB_TECHNICIAN` account assigned to exactly one department (via Task 10's admin UI), confirm CEP DEPO's balance table still hides the Bölüm column (unchanged single-department behavior). Assign that same account a second department, reload, and confirm the Bölüm column now appears showing each row's department. Log in as `KURUMSAL` and confirm the privileged UI (distribute button, cross-department view) now renders, matching `ADMIN`/`SATINAL_LOJISTIK`.

- [ ] **Step 4: Commit**

```bash
git add src/CepDepo.jsx
git commit -m "fix(cep-depo): include KURUMSAL in privileged view, show Bölüm column for multi-dept lab techs"
```

---

## Task 14: Change log + full live-DB verification pass

**Files:**
- Create: `updates/UPDATE_2026-07-06_department_scoping.md`

- [ ] **Step 1: Write the change log**

```markdown
# UPDATE 2026-07-06 — Multi-Department Stock & CEP DEPO Visibility

## Summary
Scoped `/api/unified-stock`, `/api/lots`, and all 5 CEP DEPO read endpoints to the
caller's department membership. Users and items can now belong to multiple
departments (new `user_departments`/`item_departments` join tables), and items can
be flagged `isGlobal` to bypass scoping entirely. `ADMIN`/`SATINAL`/`SATINAL_LOJISTIK`/
`KURUMSAL` keep full cross-department visibility (unchanged from today). Also fixes
a pre-existing gap where CEP DEPO read endpoints trusted a client-supplied
`?department=` query param for non-lab-tech roles.

## Files touched
- `server/migrations/2026-07-06-department-scoping.sql` (new)
- `server/departmentScope.cjs`, `server/departmentScope.test.cjs` (new)
- `server/index.js` — schema bootstrap, `getUserDepartments`, `canManageDepartmentMemberships`,
  `/api/unified-stock`, `/api/lots`, 5 CEP DEPO read endpoints, 2 new department-membership
  endpoints, `sanitizeUser` + user/item listing queries
- `src/api.js` — `updateUserDepartments`, `updateItemDepartments`
- `src/App.jsx` — user form checkboxes, item form checkboxes + global flag, Stok badges
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

## Test steps
See full checklist in Step 2 below and §8 of
`docs/superpowers/specs/2026-07-06-multi-department-visibility-design.md`.

## Risks
- **Immediate access narrowing**: any `LAB_TECHNICIAN`/`OBSERVER` account not yet
  re-assigned departments after this deploys will see only `isGlobal` items — this is
  intentional (not grandfathered), but requires an ADMIN pass to re-assign real users
  immediately after deploy (see design spec §7 step 6).
- Free-text department name mismatches (typos/casing) between legacy scalar values and
  the `departments` registry will silently exclude items/users from filtering — audit
  before relying on this in production.
```

- [ ] **Step 2: Execute the full live-DB testing checklist from the design spec**

Work through every item in `docs/superpowers/specs/2026-07-06-multi-department-visibility-design.md` §8 (Testing Plan) against the dev DB and dev frontend: migration integrity, the role×department matrix (bypass roles unfiltered, zero/one/multi-department `LAB_TECHNICIAN`/`OBSERVER`, global items, CEP DEPO end-to-end cycle, the negative query-param test), the frontend manual pass (regression check for already-migrated single-department accounts, combined view + badges for multi-department accounts, admin checkbox flows, DevTools network-tab confirmation that unauthorized data never leaves the server), and the existing-feature regression sweep (multi-lot distribute picker, LOT split/SKT edit/multi-lot Düzelt correction, unfiltered Talep). Check off each item; do not consider this task done until every item has been run and passed.

- [ ] **Step 3: Commit**

```bash
git add updates/UPDATE_2026-07-06_department_scoping.md
git commit -m "docs: change log for multi-department visibility feature"
```

---

## Definition of Done (mirrors design spec §10)

- `ADMIN`/`SATINAL`/`SATINAL_LOJISTIK`/`KURUMSAL` see all stock/CEP DEPO across every department, unchanged from today.
- A `LAB_TECHNICIAN`/`OBSERVER` with one department sees exactly what they see today, once migrated department is confirmed correct.
- A `LAB_TECHNICIAN`/`OBSERVER` in multiple departments sees the combined, correctly-tagged, deduplicated union.
- A `LAB_TECHNICIAN`/`OBSERVER` with zero departments sees only `isGlobal` items.
- `ADMIN`/`SATINAL_LOJISTIK` can assign multi-department memberships to users and items, and toggle `isGlobal`, via the updated forms.
- No write path, `lots.currentQuantity` truth, or Talep visibility changed.
- Change-log file created with rollback SQL; row-count parity verified; full testing plan executed and passing.
