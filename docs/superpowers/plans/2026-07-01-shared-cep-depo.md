# Department-Shared CEP DEPO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-technician CEP DEPO pockets with one shared pool per department; every lab tech in a department sees and records usage against it.

**Architecture:** CEP DEPO balance is re-keyed from `(labTechnicianId, itemId)` to `(departmentId, itemId)`. A `departments` reference table is added; users get a single `departmentId`. History tables (`cep_depo_distributions`, `cep_depo_consumptions`, `stock_movements`) gain `departmentId` while retaining the acting/recipient technician for accountability. Existing per-tech balances are merged into department pools via a one-time migration.

**Tech Stack:** Node.js + Express 4 (CommonJS), MySQL 8 (`mysql2/promise`, raw parameterized SQL), React 18 + Vite (plain JSX), Tailwind CDN. **No test framework** — verification is manual exercise paths (`npm run server`, then curl / UI checks).

## Global Constraints (verbatim from CLAUDE.md + spec)

- No TypeScript; JS/JSX only. No new state libraries. No ORM. Raw `mysql2/promise` only.
- No SQL string concatenation of user input — all values via `?` placeholders. (Dynamic SQL is only assembled from server-controlled identifiers, never request data.)
- Turkish status enums unchanged (`ACTIVE`/`ZERO`, purchase/lot/dist statuses). UI text Turkish, identifiers English.
- Stock truth = `lots.currentQuantity`. Multi-row mutations inside `withTransaction`; lot decrements use `SELECT ... FOR UPDATE`.
- All HTTP calls via `src/api.js` only.
- Every substantive change → `updates/UPDATE_2026-07-01_shared_cep_depo.md` (summary, files, DB changes, rollback SQL, test steps, risks).
- Schema additions go through the existing `ensureColumn(table, column, ddl)` upgrade path in `server/index.js` (defined ~line 2871) and `CREATE TABLE IF NOT EXISTS`, so startup stays idempotent.
- Resolve a user's `departmentId` **server-side from the DB per request** — never trust it from the JWT (department can change without re-login; token TTL 7 days).

---

## Task 1: Schema — departments, user/item columns, department columns on CEP tables

**Files:**
- Modify: `server/index.js` — the CEP DEPO bootstrap block (`CREATE TABLE` at ~2900-2994) and the `ensureColumn` upgrade section.

**Interfaces:**
- Produces: table `departments(id, name, active, createdAt, updatedAt)`; columns `users.departmentId`, `item_definitions.minReactionThreshold`, and `departmentId`/`departmentName` on `cep_depo_balances`, `departmentId` on `cep_depo_distributions`/`cep_depo_consumptions`/`stock_movements`; `recipientTechnicianId` on `cep_depo_distributions`.

- [ ] **Step 1: Add `departments` CREATE TABLE** in the CEP bootstrap block (after the `stock_movements` create, before the upgrade `try`):

```js
  await pool.query(`CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(64) NOT NULL,
    name VARCHAR(150) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_department_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
```

- [ ] **Step 2: Add the additive columns via `ensureColumn`** (in the upgrade `try` block near 2989). These are additive so they are safe on existing tables; the unique-key swap and old-column drop happen in the migration (Task 2), NOT here:

```js
  try {
    await ensureColumn('users', 'departmentId', '`departmentId` VARCHAR(64) NULL');
    await ensureColumn('item_definitions', 'minReactionThreshold', '`minReactionThreshold` INT NOT NULL DEFAULT 3');
    await ensureColumn('cep_depo_balances', 'departmentId', '`departmentId` VARCHAR(64) NULL');
    await ensureColumn('cep_depo_balances', 'departmentName', '`departmentName` VARCHAR(150) NULL');
    await ensureColumn('cep_depo_distributions', 'departmentId', '`departmentId` VARCHAR(64) NULL');
    await ensureColumn('cep_depo_distributions', 'recipientTechnicianId', '`recipientTechnicianId` BIGINT UNSIGNED NULL');
    await ensureColumn('cep_depo_consumptions', 'departmentId', '`departmentId` VARCHAR(64) NULL');
    await ensureColumn('stock_movements', 'departmentId', '`departmentId` VARCHAR(64) NULL');
  } catch (e) { console.warn('[ensureCepDepo] department columns upgrade skipped:', e?.code || e?.message); }
```

> Note: for a brand-new DB the `CREATE TABLE IF NOT EXISTS cep_depo_balances` still declares `labTechnicianId` etc.; that's fine — Task 2's migration is a no-op when there is no legacy data, and reads/writes (Tasks 4-6) use `departmentId`. Leave the CREATE statements as-is to avoid a divergent fresh-vs-upgraded schema; the unique key is enforced/rebuilt in Task 2.

- [ ] **Step 3: Verify startup is clean.** Run: `npm run server`
  Expected: server boots, no `[ensureCepDepo]` error warnings; `SHOW COLUMNS FROM cep_depo_balances` includes `departmentId`, `departmentName`.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(cep-depo): add departments table and department columns"
```

---

## Task 2: One-time migration — seed departments, assign techs, merge balances, swap unique key

**Files:**
- Create: `server/migrations/2026-07-01-shared-cep-depo.sql` (run manually; documented in the update log).

**Interfaces:**
- Consumes: columns from Task 1.
- Produces: seeded departments; `cep_depo_balances` re-keyed `UNIQUE(departmentId, itemId)` with per-department merged quantities; backfilled `departmentId` on history rows.

- [ ] **Step 1: Take a DB snapshot first** (destructive merge). Run (adjust creds):

```bash
mysqldump -u <user> -p <db> cep_depo_balances cep_depo_distributions cep_depo_consumptions stock_movements users > backup_pre_cep_migration_2026-07-01.sql
```

- [ ] **Step 2: Write the migration SQL** to `server/migrations/2026-07-01-shared-cep-depo.sql`:

```sql
-- 1. Seed departments (idempotent on name)
INSERT IGNORE INTO departments (id, name, active) VALUES
  (LOWER(REPLACE(UUID(),'-','')), 'Numune Kabul', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Moleküler Mikrobiyoloji', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Moleküler Genetik', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Sitogenetik', 1);

-- 2. SAFETY: list lab techs with no department. Migration MUST NOT proceed
--    past step 3 while this returns rows — assign them first (ADMIN via UI or UPDATE).
SELECT id, username FROM users
WHERE role = 'LAB_TECHNICIAN' AND (departmentId IS NULL OR departmentId = '');

-- 3. Backfill departmentName label on users for convenience (optional)
UPDATE users u JOIN departments d ON d.id = u.departmentId
  SET u.departmentId = d.id;  -- no-op safeguard; departmentId already the FK

-- 4. Merge existing per-tech balances into per-department pools.
--    Create/accumulate a (departmentId, itemId) row summing every tech's packQty/unitQty.
INSERT INTO cep_depo_balances
  (id, labTechnicianId, labTechnicianUsername, itemId, packQty, unitQty, status,
   consumptionUnitType, departmentId, departmentName, createdAt, updatedAt)
SELECT LOWER(REPLACE(UUID(),'-','')), 0, 'MERGED', b.itemId,
       SUM(b.packQty), SUM(b.unitQty),
       CASE WHEN SUM(b.packQty) > 0 OR SUM(b.unitQty) > 0 THEN 'ACTIVE' ELSE 'ZERO' END,
       MAX(b.consumptionUnitType), u.departmentId, d.name, NOW(), NOW()
FROM cep_depo_balances b
JOIN users u ON u.id = b.labTechnicianId
JOIN departments d ON d.id = u.departmentId
WHERE b.departmentId IS NULL          -- only legacy per-tech rows
GROUP BY u.departmentId, b.itemId;

-- 5. Delete the legacy per-tech rows now that they are merged.
DELETE FROM cep_depo_balances WHERE departmentId IS NULL;

-- 6. Backfill departmentId on history rows from the (recipient/acting) technician.
UPDATE cep_depo_distributions x JOIN users u ON u.id = x.labTechnicianId
  SET x.departmentId = u.departmentId, x.recipientTechnicianId = x.labTechnicianId
  WHERE x.departmentId IS NULL;
UPDATE cep_depo_consumptions x JOIN users u ON u.id = x.labTechnicianId
  SET x.departmentId = u.departmentId WHERE x.departmentId IS NULL;
UPDATE stock_movements x JOIN users u ON u.id = x.labTechnicianId
  SET x.departmentId = u.departmentId WHERE x.departmentId IS NULL AND x.labTechnicianId IS NOT NULL;

-- 7. Swap the unique key: drop per-tech uniqueness, add per-department uniqueness.
ALTER TABLE cep_depo_balances DROP INDEX uniq_cep_balance_tech_item;
ALTER TABLE cep_depo_balances ADD UNIQUE KEY uniq_cep_balance_dept_item (departmentId, itemId);
ALTER TABLE cep_depo_balances ADD INDEX idx_cep_balance_dept (departmentId);

-- 8. Make departmentId NOT NULL on balances now that all rows have it.
ALTER TABLE cep_depo_balances MODIFY departmentId VARCHAR(64) NOT NULL;
```

- [ ] **Step 3: Run the migration** against the target DB after confirming step-2/#2 returns no unassigned techs:

```bash
mysql -u <user> -p <db> < server/migrations/2026-07-01-shared-cep-depo.sql
```
Expected: no errors; `SELECT departmentId, itemId, packQty, unitQty FROM cep_depo_balances` shows one row per (dept,item) with summed quantities.

- [ ] **Step 4: Commit**

```bash
git add server/migrations/2026-07-01-shared-cep-depo.sql
git commit -m "feat(cep-depo): one-time migration merging pockets into department pools"
```

---

## Task 3: Departments CRUD + department on user create/update/login/me

**Files:**
- Modify: `server/index.js` — user routes (`POST /api/users` ~437, `PATCH /api/users/:id` ~283), `sanitizeUser`, login/`/auth/me` payloads, and add department routes near the CEP routes (~3007). Also `/api/lab-technicians` (~3414) to return `departmentId`.

**Interfaces:**
- Produces: `GET /api/departments` → `{ departments: [{id,name,active}] }`; `POST /api/departments {name}`; `PUT /api/departments/:id {name?, active?}`. User objects now include `departmentId`.

- [ ] **Step 1: Add department routes** (ADMIN-guarded, parameterized):

```js
// GET /api/departments — list (all authed users; techs need it for labels)
app.get('/api/departments', authRequired, async (_req, res) => {
  try {
    const departments = await all(pool, 'SELECT id, name, active FROM departments ORDER BY name');
    res.json({ departments });
  } catch (e) { console.error('list departments', e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

// POST /api/departments — create (ADMIN)
app.post('/api/departments', authRequired, adminRequired, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'INVALID_INPUT', message: 'Bölüm adı zorunludur.' });
  try {
    const id = generateId();
    await run(pool, 'INSERT INTO departments (id, name, active) VALUES (?, ?, 1)', [id, name]);
    res.json({ department: { id, name, active: 1 } });
  } catch (e) {
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DEPARTMENT_EXISTS' });
    console.error('create department', e); res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// PUT /api/departments/:id — rename / toggle active (ADMIN)
app.put('/api/departments/:id', authRequired, adminRequired, async (req, res) => {
  const { name, active } = req.body || {};
  const updates = []; const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: 'INVALID_INPUT' });
  params.push(req.params.id);
  try {
    await run(pool, `UPDATE departments SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DEPARTMENT_EXISTS' });
    console.error('update department', e); res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
```

- [ ] **Step 2: Accept `departmentId` in `POST /api/users`.** Change destructure to include `departmentId` and the INSERT:

```js
  const { username, password, role, departmentId } = req.body || {};
  // ...existing validation...
    await run(pool, 'INSERT INTO users (username, passwordHash, role, departmentId, createdBy) VALUES (?, ?, ?, ?, ?)',
      [String(username), passwordHash, String(role), departmentId || null, String(req.user.username)]);
```

- [ ] **Step 3: Accept `departmentId` in `PATCH /api/users/:id`.** Add to destructure and the dynamic `updates`:

```js
  const { username, role, password, canReceive, canViewPrices, departmentId } = req.body || {};
  // in the null-check guard, add: && departmentId === undefined
  // then:
  if (departmentId !== undefined) { updates.push('departmentId = ?'); params.push(departmentId || null); }
```

- [ ] **Step 4: Include `departmentId` in reads.** Update `sanitizeUser` and every `SELECT ... FROM users` used for listing / `/auth/me` / login to select `departmentId` (and the list query in `POST /api/users` response ~451). Add `departmentId` to the selected columns and to `sanitizeUser`'s returned object.

- [ ] **Step 5: `/api/lab-technicians` returns departmentId** (~3414): change to `SELECT id, username, departmentId FROM users WHERE role = 'LAB_TECHNICIAN' ORDER BY username`.

- [ ] **Step 6: Verify.** Run server; `curl` create a department, assign it to a tech via PATCH, `GET /api/departments`, `GET /api/auth/me` shows `departmentId`.

- [ ] **Step 7: Commit** `feat(cep-depo): departments CRUD and department on users`

---

## Task 4: Re-key distribution to department (both distribute paths)

**Files:**
- Modify: `server/index.js` — `POST /api/cep-depo/distribute` (~3047-3162) and the CEP auto-routing block inside `POST /api/distribute` (~1657-1753).

**Interfaces:**
- Consumes: department columns (Task 1), `resolveUnitFactor`, `withTransaction`, `all/run`.
- Produces: distributions that upsert `cep_depo_balances` by `(departmentId, itemId)` and record `recipientTechnicianId`.

- [ ] **Step 1: Resolve target department in `/api/cep-depo/distribute`.** After loading `tech` (line ~3057), resolve the department:

```js
      if (!tech.departmentId) throw { status: 400, error: 'NO_DEPARTMENT', message: 'Teknisyenin bağlı olduğu bölüm yok.' };
      const deptRows = await all(conn, 'SELECT id, name FROM departments WHERE id = ?', [tech.departmentId]);
      const dept = deptRows?.[0];
      if (!dept) throw { status: 400, error: 'DEPARTMENT_NOT_FOUND' };
```
(Also add `departmentId` to the `SELECT ... FROM users` for `tech` at ~3056.)

- [ ] **Step 2: Write distribution header with department + recipient.** Replace the `cep_depo_distributions` INSERT (~3120) to include the new columns:

```js
      await run(conn, `
        INSERT INTO cep_depo_distributions
          (id, labTechnicianId, labTechnicianUsername, recipientTechnicianId, departmentId, itemId, packQty, unitQty, purchaseId, distributedBy, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [cepDistributionId, tech.id, tech.username, tech.id, dept.id, itemId, packQtyNum, totalUnitQty, purchaseId || null, req.user.username, notes || null]);
```

- [ ] **Step 3: Upsert balance by department.** Replace the `cep_depo_balances` upsert (~3127) to key on department:

```js
      await run(conn, `
        INSERT INTO cep_depo_balances
          (id, departmentId, departmentName, itemId, packQty, unitQty, status, lastDistributedAt, lastDistributionId)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(), ?)
        ON DUPLICATE KEY UPDATE
          packQty = packQty + VALUES(packQty),
          unitQty = unitQty + VALUES(unitQty),
          status = 'ACTIVE',
          departmentName = VALUES(departmentName),
          lastDistributedAt = VALUES(lastDistributedAt),
          lastDistributionId = VALUES(lastDistributionId)
      `, [generateId(), dept.id, dept.name, itemId, packQtyNum, totalUnitQty, cepDistributionId]);
```

- [ ] **Step 4: Record department on the movement.** In the `stock_movements` INSERT (~3141), add `departmentId` column + value (`dept.id`); keep `labTechnicianId = tech.id`.

- [ ] **Step 5: Mirror the same three changes in the auto-routing block of `POST /api/distribute`** (~1707-1731): resolve `targetTech.departmentId` → dept (throw `NO_DEPARTMENT` if missing), write header with `recipientTechnicianId`/`departmentId`, upsert balance by department, add `departmentId` to the movement. Add `departmentId` to the `SELECT ... FROM users` at ~1669 and ~1673.

- [ ] **Step 6: Verify.** Run server; distribute to a tech whose department has an existing pool → balance row for that `(departmentId,itemId)` increments (not a new per-tech row); `recipientTechnicianId` set.

- [ ] **Step 7: Commit** `feat(cep-depo): distribute into shared department pool`

---

## Task 5: Re-key consume + return to department pool

**Files:**
- Modify: `server/index.js` — `POST /api/cep-depo/consume` (~3167-3271) and `POST /api/cep-depo/return` (~3275-3349).

**Interfaces:**
- Consumes: department columns; `resolveUnitFactor`.
- Produces: consume/return that debit the caller's department pool; guard = LAB_TECHNICIAN in that department (ADMIN on behalf).

- [ ] **Step 1: Resolve caller's department in consume.** Replace the tech-scoped balance lookup. After validating role, load the acting user's department (ADMIN acting on behalf may pass `departmentId` explicitly):

```js
      const actorRows = await all(conn, 'SELECT id, username, role, departmentId FROM users WHERE id = ?', [req.user.id]);
      const actor = actorRows?.[0];
      const deptId = isAdmin && req.body?.departmentId ? req.body.departmentId : actor?.departmentId;
      if (!deptId) throw { status: 400, error: 'NO_DEPARTMENT', message: 'Bir bölüme atanmış olmalısınız.' };
      const balRows = await all(conn,
        'SELECT * FROM cep_depo_balances WHERE departmentId = ? AND itemId = ? FOR UPDATE',
        [deptId, itemId]);
```

- [ ] **Step 2: Write consumption with department + acting tech.** Update the `cep_depo_consumptions` INSERT (~3249) to add `departmentId` (value `deptId`); keep `labTechnicianId`/`labTechnicianUsername` = the acting user (`req.user.id`/`req.user.username`). Add `departmentId` to the `stock_movements` INSERT (~3255).

- [ ] **Step 3: Same for return.** In `POST /api/cep-depo/return`, resolve `deptId` the same way, change the balance SELECT to `WHERE departmentId = ? AND itemId = ?`, and add `departmentId` to the `stock_movements` INSERT (~3333). Keep the FEFO credit-back-to-lot logic unchanged.

- [ ] **Step 4: Verify.** Two techs in the same department: tech A consumes, tech B sees the reduced shared balance. A tech in another department gets `INSUFFICIENT_CEP_BALANCE`/`NO_DEPARTMENT` for that pool.

- [ ] **Step 5: Commit** `feat(cep-depo): consume/return against shared department pool`

---

## Task 6: Re-key read endpoints to department scoping

**Files:**
- Modify: `server/index.js` — `GET /api/cep-depo/balances` (~3008), `/my-balances` (~3028), `/movements` (~3352), `/distributions` (~3375), `/consumptions` (~3395).

**Interfaces:**
- Produces: reads scoped by department; lab techs see only their department, privileged see all (optional `?departmentId=` filter).

- [ ] **Step 1: `balances`** — join department name and scope for techs. Replace the WHERE logic:

```js
    const deptId = isLabTechnicianRole(role) ? await getUserDeptId(req.user.id) : (req.query.departmentId || null);
    const sql = `
      SELECT b.*, i.code AS itemCode, i.name AS itemName, i.packageUnit, i.consumptionUnit, i.unitsPerPackage, i.consumptionUnitType
      FROM cep_depo_balances b
      LEFT JOIN item_definitions i ON i.id = b.itemId
      ${deptId ? 'WHERE b.departmentId = ?' : ''}
      ORDER BY b.departmentName, i.name`;
    const params = deptId ? [deptId] : [];
```
Add a small helper near the CEP routes: `async function getUserDeptId(userId){ const r = await all(pool,'SELECT departmentId FROM users WHERE id = ?',[userId]); return r?.[0]?.departmentId || null; }`

- [ ] **Step 2: `my-balances`** — return the caller's **department** pool: `WHERE b.departmentId = ?` with `getUserDeptId(req.user.id)`; if null, return `{ balances: [] }`.

- [ ] **Step 3: `movements` / `distributions` / `consumptions`** — replace each `labTechnicianId` filter with a `departmentId` filter: lab techs forced to `getUserDeptId`, others optional `?departmentId=`. (In `movements`, replace `filterTech` logic; keep the `LIMIT ${limit}` which is a server-clamped integer, not user text.)

- [ ] **Step 4: Verify.** Tech GET `/api/cep-depo/balances` returns only their department rows; ADMIN sees all; `?departmentId=` filters.

- [ ] **Step 5: Commit** `feat(cep-depo): department-scoped read endpoints`

---

## Task 7: Request-block rule (reaction threshold vs any-stock)

**Files:**
- Modify: `server/index.js` — the lab-tech branch of `POST /api/purchases` (~1834-1850).

**Interfaces:**
- Consumes: department pool + `item_definitions.minReactionThreshold` + `consumptionUnit`/`consumptionUnitType`.

- [ ] **Step 1: Replace the block check** (the `else if (isLabTech)` branch's balance lookup) with a department-pool lookup plus the reaction/non-reaction rule:

```js
    } else if (isLabTech) {
      effectiveLabTechUsername = requesterUsername;
      effectiveLabTechId = req.user.id;
      const deptRows = await all(pool, 'SELECT departmentId FROM users WHERE id = ?', [req.user.id]);
      const deptId = deptRows?.[0]?.departmentId;
      if (!deptId) {
        return res.status(409).json({ error: 'NO_DEPARTMENT', message: 'Talep oluşturmadan önce bir bölüme atanmalısınız.' });
      }
      const balRows = await all(pool,
        'SELECT packQty, unitQty FROM cep_depo_balances WHERE departmentId = ? AND itemId = ?',
        [deptId, itemId]);
      const bal = balRows?.[0];
      if (bal) {
        const itemRows = await all(pool, 'SELECT consumptionUnit, minReactionThreshold FROM item_definitions WHERE id = ?', [itemId]);
        const item = itemRows?.[0] || {};
        const isReaction = String(item.consumptionUnit || '').toLowerCase().includes('reak');
        if (isReaction) {
          const threshold = Number(item.minReactionThreshold) > 0 ? Number(item.minReactionThreshold) : 3;
          const remainingReactions = Number(bal.unitQty) || 0;
          if (remainingReactions >= threshold) {
            return res.status(409).json({
              error: 'CEP_DEPO_HAS_STOCK',
              message: `Bölüm CEP DEPO stoğu yeterli (kalan ${remainingReactions} reaksiyon, eşik ${threshold}). Eşiğin altına inince talep oluşturabilirsiniz.`,
              remainingReactions, threshold
            });
          }
        } else if (Number(bal.packQty) > 0 || Number(bal.unitQty) > 0) {
          return res.status(409).json({
            error: 'CEP_DEPO_HAS_STOCK',
            message: 'Bu ürün için bölüm CEP DEPO stoğu mevcut. Önce mevcut stoğu tüketmeli veya iade etmelisiniz.',
            remainingPackQty: Number(bal.packQty), remainingUnitQty: Number(bal.unitQty)
          });
        }
      }
    }
```

- [ ] **Step 2: Verify.** Reaction item with dept pool `unitQty=5`, threshold 3 → 409. Set threshold to 6 → request allowed. Non-reaction item with any stock → 409.

- [ ] **Step 3: Commit** `feat(cep-depo): department-level request block with reaction threshold`

---

## Task 8: unified-stock aggregate — confirm unchanged

**Files:**
- Inspect: `server/index.js` ~1376-1387 (`cepDepoTotal`/`cepDepoUnitTotal` subqueries).

- [ ] **Step 1:** Confirm the subqueries `SUM(b.packQty)/SUM(b.unitQty) WHERE b.itemId = id.id AND b.status='ACTIVE'` do **not** reference `labTechnicianId`. They don't → they now naturally sum across department pools. No code change needed. If any join to `labTechnicianId` exists there, remove it.
- [ ] **Step 2:** Verify `/api/unified-stock` still returns per-item CEP totals after migration. No commit unless changed.

---

## Task 9: Frontend API layer — department params

**Files:**
- Modify: `src/api.js` — CEP DEPO exports (~353-419), `createUser`/`updateUser` (~86-107); add department fns.

- [ ] **Step 1: Add department API fns:**

```js
export async function fetchDepartments() { return apiFetch('/departments'); }
export async function createDepartment(name) {
  return apiFetch('/departments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
}
export async function updateDepartment(id, data) {
  return apiFetch(`/departments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
```

- [ ] **Step 2:** Add `departmentId` to `createUser` and `updateUser` payloads (extra optional arg / field).
- [ ] **Step 3:** In `distributeToCepDepo`/`distributeApprovedRequest`, keep `labTechnicianId` (server resolves dept from it) — no signature break. In `consumeFromCepDepo`/`returnFromCepDepo`, allow optional `departmentId` passthrough for ADMIN.
- [ ] **Step 4: Commit** `feat(cep-depo): api.js department endpoints`

---

## Task 10: Frontend CepDepo.jsx — shared view, remove Ana Birim, add search

**Files:**
- Modify: `src/CepDepo.jsx` — `balanceTable` (~282-346), fetch logic (~79), sub-tab labels, distribute form.

- [ ] **Step 1: Remove the "Ana Birim (Koli)" column.** Delete the `<th>Ana Birim (Koli)</th>` (line ~289) and its `<td>` (lines ~311-314). Keep one quantity column: show `unitQty` with `conLabel` when `hasSubUnit`, else show `packQty` with `pkgLabel` (so pack-only items still display a number). Rename the remaining header to `Miktar`.
- [ ] **Step 2: Drop the per-tech column for lab techs** and, for privileged view, relabel "Lab Teknisyeni" column to "Bölüm" bound to `b.departmentName`. Update `colSpan` on the empty-state row accordingly.
- [ ] **Step 3: Add a search box** above the table filtering rows by `itemName`/`itemCode` (client-side `useState` filter). Turkish placeholder `Ürün ara...`.
- [ ] **Step 4: Rename sub-tab** "CEP DEPO'm" / "My CEP DEPO" → "Bölüm CEP DEPO".
- [ ] **Step 5: Distribute form** — the target selector stays a technician picker (server routes to that tech's department); add a read-only note showing the resolved department if available. (No department dropdown needed here since dept is derived from tech.)
- [ ] **Step 6: Verify in browser** (`npm run dev` + `npm run server`): tech sees a single shared table, no Ana Birim column, search works, consume decrements the shared pool.
- [ ] **Step 7: Commit** `feat(cep-depo): shared department view, remove ana birim, add search`

---

## Task 11: Frontend App.jsx — user dept dropdown, item threshold, departments admin

**Files:**
- Modify: `src/App.jsx` — user create/edit form, item-definition form, and a new ADMIN "Bölümler" section (or a small `src/Departments.jsx` component rendered from App).

- [ ] **Step 1:** Load departments (`fetchDepartments`) on admin screens; add a **Bölüm** `<select>` to the user create/edit form bound to `departmentId`; pass it through `createUser`/`updateUser`.
- [ ] **Step 2:** Add a **Min. Reaksiyon Eşiği** number input (default 3) to the item-definition create/edit form bound to `minReactionThreshold`; include it in `createItemDefinition`/`updateItemDefinition` payloads. (Confirm server item-definition create/update accepts/persists the column — add it there if not.)
- [ ] **Step 3:** Add an ADMIN **Bölümler** management panel: list departments, add (name), rename, activate/deactivate — via `fetchDepartments`/`createDepartment`/`updateDepartment`.
- [ ] **Step 4: Verify in browser:** create a department, assign to a user, set an item threshold; confirm persisted via reload.
- [ ] **Step 5: Commit** `feat(cep-depo): user dept dropdown, item threshold, departments admin`

---

## Task 12: Change log

**Files:**
- Create: `updates/UPDATE_2026-07-01_shared_cep_depo.md`.

- [ ] **Step 1:** Write the update doc: summary, files touched (server/index.js, src/api.js, src/CepDepo.jsx, src/App.jsx, migration SQL), DB changes (new table + columns + unique-key swap), **rollback SQL** (restore from `backup_pre_cep_migration_2026-07-01.sql`; drop `departments`; drop added columns; re-add `uniq_cep_balance_tech_item`), test steps, risks.
- [ ] **Step 2: Commit** `docs: change log for shared CEP DEPO`

---

## Self-Review Notes

- **Spec coverage:** §3 data model → Task 1/2; §4 API → Tasks 3-6,8; §5 request block → Task 7; §6 UX → Tasks 10-11; §7 migration → Task 2; ana-birim removal (decision #10) → Task 10 Step 1. All covered.
- **Type consistency:** `getUserDeptId(userId)` used in Task 6; `deptId`/`dept.id`/`dept.name` naming consistent across Tasks 4-7. `recipientTechnicianId` consistent (Task 1 column ↔ Task 4 insert).
- **No automated tests:** project has no test runner; every "Verify" step is a manual exercise path, consistent with repo conventions.
- **Open item deferred to execution:** whether the server item-definition create/update route already persists arbitrary columns (Task 11 Step 2 confirms and patches if needed).
