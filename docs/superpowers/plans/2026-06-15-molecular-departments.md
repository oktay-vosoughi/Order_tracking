# Molecular Departments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename current `Molecular` stock departments to `Molecular Micro` and add `Molecular Genetic` as a selectable department.

**Architecture:** Department options are centralized in a small tested frontend module, then re-exported through `labUtils.js` to preserve existing imports. Current stock DB rows are migrated with exact-value updates against `item_definitions` and `lots`.

**Tech Stack:** React 18 + Vite, Node built-in `node:test`, MySQL SQL migrations.

---

### Task 1: Department Constants

**Files:**
- Create: `src/labDepartments.mjs`
- Create: `src/labDepartments.test.mjs`
- Modify: `src/labUtils.js`

- [ ] **Step 1: Write the failing test**

Create `src/labDepartments.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEPARTMENTS } from './labDepartments.mjs';

test('exports the active laboratory department options', () => {
  assert.deepEqual(Object.values(DEPARTMENTS), [
    'Cytogenetic',
    'Molecular Micro',
    'Molecular Genetic',
    'Numune Kabul',
    'Diğer'
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/labDepartments.test.mjs`

Expected: FAIL because `src/labDepartments.mjs` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/labDepartments.mjs`:

```js
export const DEPARTMENTS = {
  CYTOGENETIC: 'Cytogenetic',
  MOLECULAR_MICRO: 'Molecular Micro',
  MOLECULAR_GENETIC: 'Molecular Genetic',
  NUMUNE_KABUL: 'Numune Kabul',
  OTHER: 'Diğer'
};
```

Modify `src/labUtils.js` to import and re-export `DEPARTMENTS`:

```js
import { DEPARTMENTS } from './labDepartments.mjs';
export { DEPARTMENTS };
```

Remove the old inline `DEPARTMENTS` object from `src/labUtils.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/labDepartments.test.mjs`

Expected: PASS.

### Task 2: DB Backfill And Templates

**Files:**
- Create: `server/migrations/2026_06_15_rename_molecular_departments.sql`
- Modify: `src/App.jsx`
- Modify: `src/LotInventory.jsx`
- Modify: `updates/EXCEL_IMPORT_GUIDE.md`
- Modify: `updates/LOT_IMPORT_GUIDE.md`
- Modify: `updates/MIGRATION_EXCEL_FORMAT.md`
- Modify: `docs/06-domain-logic.md`
- Create: `updates/UPDATE_2026-06-15_molecular_departments.md`

- [ ] **Step 1: Add migration**

Create `server/migrations/2026_06_15_rename_molecular_departments.sql`:

```sql
UPDATE item_definitions
SET department = 'Molecular Micro'
WHERE department = 'Molecular';

UPDATE lots
SET department = 'Molecular Micro'
WHERE department = 'Molecular';
```

- [ ] **Step 2: Update active templates**

Replace template examples using `'Departman': 'Molecular'` with `'Departman': 'Molecular Micro'`. Replace the current Turkish sample `'Moleküler Genetik'` with `'Molecular Genetic'`.

- [ ] **Step 3: Update docs and changelog**

Update department docs to list `Cytogenetic`, `Molecular Micro`, `Molecular Genetic`, `Numune Kabul`, `Diğer`. Add an `updates/` entry with summary, files touched, DB changes, rollback SQL, test steps, and risks.

- [ ] **Step 4: Verify**

Run:

```bash
node --test src/labDepartments.test.mjs src/mobileUi.test.mjs
npm run build
```

Expected: both commands exit 0.
