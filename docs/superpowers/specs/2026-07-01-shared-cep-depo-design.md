# Design Spec — Department-Shared CEP DEPO

**Date:** 2026-07-01
**Author:** Oktay Vosoughi (with Claude)
**Status:** Approved for planning
**Change log target:** `updates/UPDATE_2026-07-01_shared_cep_depo.md`

> **Revision (2026-07-02):** During implementation we discovered the app already uses `department`
> as a free-text **string** (canonical list in `src/labDepartments.mjs`: Cytogenetic, Molecular Micro,
> Molecular Genetic, Numune Kabul, Diğer) on `item_definitions`, `lots`, `purchases`, `distributions`.
> To avoid a parallel vocabulary, the design is revised: the CEP pool and `users.department` are keyed by
> the department **name string** (not a UUID). A `departments` registry table is still kept — seeded from
> `labDepartments.mjs` — so ADMIN can add new department **names** at runtime; but the value stored on
> users/balances/history is the string, consistent with `item_definitions.department`. Decisions #2, #3
> and the data model below are superseded by this note where they mention `departmentId`.

---

## 1. Problem & Goal

Today CEP DEPO is a **private pocket per lab technician**. Each `LAB_TECHNICIAN` has isolated balances
(`cep_depo_balances` keyed `UNIQUE(labTechnicianId, itemId)`), sees only their own stock, and consumes only
from their own pocket. There is no lab/department concept in the schema.

**Goal:** Replace the per-technician model with a **shared pool per department**. Every lab technician in a
department draws from and records usage against one shared balance per item. The balance is shared; the
history (who distributed-to / consumed / returned) stays individually attributed for accountability.

---

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope | **Per-department** pools (not one global pool). |
| 2 | Department model | **Field on user** — one department per user, backed by an ADMIN-extensible `departments` reference list. |
| 3 | Seed departments | Numune Kabul, Moleküler Mikrobiyoloji, Moleküler Genetik, Sitogenetik (+ ADMIN can add more). |
| 4 | Who records usage (consume) | **Only LAB_TECHNICIANs assigned to that department** (ADMIN may act on behalf). |
| 5 | Request-block rule | Reaction items: allow only if remaining reactions `< item.minReactionThreshold` (default 3). Non-reaction items: block if department pool has **any** stock. |
| 6 | Threshold source | **Configurable per item** (`minReactionThreshold`, default 3). |
| 7 | Existing data | **Merge** each tech's balances into their department's pool; backfill history with `departmentId`; retain tech attribution. |
| 8 | Distribution target | **Auto-route to requester's department**; record `recipientTechnicianId`. Manual distributions take an explicit department. |
| 9 | Visibility | Lab techs see **their department's** pool only. ADMIN / SATINAL / SATINAL_LOJISTIK / OBSERVER see **all** departments. |
| 10 | CEP DEPO UI unit | **Remove the "Ana Birim (Koli)" column**; show a single quantity column (alt birim / consumption unit). Pack-only items fall back to their pack figure. |

---

## 3. Data Model

### 3.1 New table `departments`
```sql
CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(150) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_department_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
Seeded rows: Numune Kabul, Moleküler Mikrobiyoloji, Moleküler Genetik, Sitogenetik.

### 3.2 `users`
- Add `departmentId VARCHAR(64) NULL` (FK-by-convention to `departments.id`; nullable so non-lab roles/ADMIN
  need not belong to a department).

### 3.3 `item_definitions`
- Add `minReactionThreshold INT NOT NULL DEFAULT 3` — used only for reaction-based items in the request-block rule.

### 3.4 `cep_depo_balances` — **re-keyed to department**
- Remove `labTechnicianId`, `labTechnicianUsername`.
- Add `departmentId VARCHAR(64) NOT NULL`, `departmentName VARCHAR(150) NOT NULL`.
- Change unique key: `UNIQUE(departmentId, itemId)` (was `UNIQUE(labTechnicianId, itemId)`).
- Replace index `idx_cep_balance_tech` with `idx_cep_balance_dept (departmentId)`.

### 3.5 `cep_depo_distributions` — attribute the recipient
- Add `departmentId VARCHAR(64) NOT NULL`.
- Rename intent of `labTechnicianId` → **`recipientTechnicianId`** (the tech the goods were distributed for; may be
  null for manual dept-level distributions). Keep `labTechnicianUsername` as the recipient's username label.
- Add index `idx_cep_dist_dept (departmentId)`.

### 3.6 `cep_depo_consumptions` — attribute the consumer
- Add `departmentId VARCHAR(64) NOT NULL`.
- Keep `labTechnicianId` / `labTechnicianUsername` = **who consumed**.
- Add index `idx_cep_cons_dept (departmentId)`.

### 3.7 `stock_movements`
- Add `departmentId VARCHAR(64) NULL`.
- Keep `performedByUserId` / `labTechnicianId`.
- Add index `idx_sm_dept (departmentId)`.

---

## 4. Server / API

All CEP DEPO mutations remain inside `withTransaction`; lot decrements keep `SELECT ... FOR UPDATE` (unchanged
invariants). Turkish status enums unchanged.

### 4.1 Balances / reads
- `GET /api/cep-depo/balances` — returns one row per `(department, item)`. LAB_TECHNICIAN filtered to their
  `departmentId`; ADMIN/SATINAL/SATINAL_LOJISTIK/OBSERVER see all departments (optional `?departmentId=` filter).
- `GET /api/cep-depo/my-balances` — becomes "my **department's** balances" (`WHERE departmentId = <caller's dept>`).
  Returns 409/empty guidance if the caller has no department assigned.
- `GET /api/cep-depo/movements|distributions|consumptions` — filter by `departmentId` instead of `labTechnicianId`;
  lab techs forced to their own department.

### 4.2 Distribute
- `POST /api/cep-depo/distribute` and the auto-distribution path in `POST /api/distribute` / receive-goods:
  - Resolve target **department**: request-driven → requester's `departmentId`; manual → `departmentId` from body.
  - Upsert `cep_depo_balances` by `(departmentId, itemId)` (`ON DUPLICATE KEY UPDATE packQty/unitQty += …`).
  - Write `cep_depo_distributions` with `departmentId` + `recipientTechnicianId`.
  - Write `stock_movements` (`DISTRIBUTE_CEP`) with `departmentId`.
  - Reject with 400 if no department can be resolved.

### 4.3 Consume / Return
- `POST /api/cep-depo/consume` — guard: caller is a LAB_TECHNICIAN **whose `departmentId` matches the pool**, or ADMIN.
  Debit the department pool; write `cep_depo_consumptions` with `departmentId` + acting `labTechnicianId`; write
  `stock_movements` (`CONSUME`).
- `POST /api/cep-depo/return` — same department guard (plus ADMIN/SATINAL/SATINAL_LOJISTIK); credit main depot, debit
  department pool; record acting tech.

### 4.4 Departments CRUD (ADMIN)
- `GET /api/departments`, `POST /api/departments`, `PUT /api/departments/:id` (rename / active toggle). Parameterized
  queries only. ADMIN-guarded.
- User create/update accepts `departmentId`.

### 4.5 `unified-stock`
- `cepDepoTotal` / `cepDepoUnitTotal` still `SUM(...)` per item across department pools — **output unchanged**, so the
  dashboard aggregate keeps working with no frontend change there.

---

## 5. Business Rule — Request Block

On `POST /api/purchases` (and any CEP DEPO request creation) by a LAB_TECHNICIAN, look up the **department pool** for
the item (`cep_depo_balances WHERE departmentId = <tech's dept> AND itemId = ?`):

- **Reaction-based item** (`consumptionUnitType`/sub-unit = reaksiyon): allow only if remaining reactions
  (`unitQty`, or reaction-equivalent) `< item.minReactionThreshold`. Otherwise **409 `CEP_DEPO_HAS_STOCK`** with a
  Turkish message stating remaining reactions and the threshold.
- **Non-reaction item**: **409** if the department pool has **any** stock (`packQty > 0 || unitQty > 0`) — current
  behavior, evaluated at department level.
- If the tech has **no department assigned**: block with a clear "önce bir bölüme atanmalısınız" style 409 (or defer to
  ADMIN). Decided at plan time; default = block.

---

## 6. Frontend / UX (`src/CepDepo.jsx`, user form, new Departments screen)

### 6.1 CepDepo balance view
- Rename "My CEP DEPO" → **"Bölüm CEP DEPO"** (the caller's department pool).
- **Remove the "Ana Birim (Koli)" column** (current header line ~289; render ~311-314). Replace the two quantity
  columns with **one "Miktar" column** showing the alt birim (consumption unit) quantity; for pack-only items
  (`consumptionUnitType === 'PACK'`) show the pack quantity so it is never blank.
- Drop the per-tech "Lab Teknisyeni" column for the lab-tech view; for privileged view, group/filter by **department**.
- Add a **search/filter box** above the table (by item name/code) so a tech can quickly find an item to consume — the
  "easy to find and use" requirement.
- Consume action stays inline per item row for lab techs of that department.

### 6.2 Distribute form
- Replace "Lab Technician" selector with **"Bölüm" (Department)** selector; auto-filled and locked when the
  distribution is request-driven. Optional "teslim alan teknisyen" (recipient technician) field → `recipientTechnicianId`.

### 6.3 User form (ADMIN)
- Add **"Bölüm" dropdown** (from `GET /api/departments`).

### 6.4 Departments admin screen (ADMIN)
- List / add / rename / activate-deactivate departments.

All new UI text Turkish; identifiers English; status enums unchanged.

---

## 7. Migration Plan

Order matters (no migration-tracking table — maintain manually per project rules).

1. Create `departments`; seed the four names.
2. `ALTER users ADD departmentId`; `ALTER item_definitions ADD minReactionThreshold DEFAULT 3`.
3. **Assign departments to existing lab techs.** Migration flags any `LAB_TECHNICIAN` with `departmentId IS NULL`
   (these must be resolved before merge; provide the list to ADMIN).
4. Add `departmentId`/`departmentName` columns to the four CEP DEPO tables + `stock_movements`; add new indexes.
5. **Merge balances:** for each existing `cep_depo_balances` row, resolve the tech's `departmentId`, then
   upsert-sum into a `(departmentId, itemId)` row. Backfill `cep_depo_distributions` / `cep_depo_consumptions` /
   `stock_movements` `departmentId` from the tech's department (retain `recipientTechnicianId` / consumer id).
6. Swap the `cep_depo_balances` unique key from `(labTechnicianId, itemId)` to `(departmentId, itemId)`; drop the
   old tech columns from `cep_depo_balances` after the merge.
7. Write `updates/UPDATE_2026-07-01_shared_cep_depo.md`: summary, files touched, DB changes, **rollback SQL**,
   test steps, risks.

**Rollback:** documented reverse SQL (restore tech columns from a pre-migration backup of `cep_depo_balances`;
drop new columns/tables). Because merge is destructive of per-tech granularity, take a DB snapshot before step 5.

---

## 8. Definition of Done

- A lab tech sees exactly one shared balance per item for their department, with a working search box and the
  Ana Birim column gone.
- Two techs in the same department consume the same pool; balance decrements are visible to both.
- A tech in department A cannot consume department B's pool; ADMIN can act on any.
- Distribution routes goods to the requester's department pool and records the recipient technician.
- Request block: reaction item blocked when remaining ≥ threshold, allowed when below; non-reaction blocked on any stock.
- Existing balances are merged with no stock lost; history retains who did what.
- `unified-stock` dashboard totals unchanged.
- Change-log file created with rollback SQL.

---

## 9. Risks & Coupling

- **Destructive merge** of per-tech balances → require DB snapshot before migration; rollback SQL documented.
- **Unassigned techs** would silently lose their pocket stock in the merge → migration must hard-flag and stop.
- **Auto-distribution path** (`POST /api/distribute` → CEP DEPO) is coupled to purchase status transitions
  (`TESLIM_ALINDI`); re-verify that flow after re-keying to department.
- **Reaction detection**: relies on `consumptionUnitType`/sub-unit correctly marking reaksiyon items; audit item
  definitions before enforcing the threshold rule.
- **JWT role/department**: `departmentId` should be resolved server-side per request from the DB (not trusted from a
  stale token), since department can change without re-login.
