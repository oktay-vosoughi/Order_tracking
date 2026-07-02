# UPDATE 2026-07-01 — Department-Shared CEP DEPO

## Summary
CEP DEPO changed from a **private pocket per lab technician** to a **shared pool per department**.
Every lab technician assigned to a department now sees and records usage against one shared balance
per item for that department. The balance is shared; distribution/consumption/return history stays
attributed to the acting/recipient technician.

- Departments are a **name string** (same vocabulary as `item_definitions.department` /
  `src/labDepartments.mjs`: Cytogenetic, Molecular Micro, Molecular Genetic, Numune Kabul, Diğer).
- A `departments` registry table makes the list **runtime-editable** by ADMIN (add / activate / deactivate).
- `users.department` (one department per user) determines which pool a user sees/consumes.
- Purchase-request block is now department-level: **reaction** items (alt birim contains "reak") may be
  requested only when remaining reactions `< item.minReactionThreshold` (default 3); **non-reaction**
  items are blocked while the department pool has any stock.
- CEP DEPO UI: the **"Ana Birim (Koli)" column was removed**; a single "Miktar" column shows the
  consumption (alt birim) quantity, plus a product search box.

Design: `docs/superpowers/specs/2026-07-01-shared-cep-depo-design.md`
Plan:   `docs/superpowers/plans/2026-07-01-shared-cep-depo.md`

## Files touched
- `server/index.js` — schema bootstrap (departments table, additive columns, registry seed);
  departments CRUD; `department` on user create/update/list + `sanitizeUser`; `/api/lab-technicians`
  returns `department`; distribute (both `/api/cep-depo/distribute` and the auto-route inside
  `/api/distribute`), consume, return, balances, my-balances, movements, distributions, consumptions
  all re-keyed to `department`; `getUserDeptId` helper; reaction-threshold request block in
  `/api/purchases`; `minReactionThreshold` on item create/update.
- `server/migrations/2026-07-01-shared-cep-depo.sql` — one-time destructive migration.
- `src/api.js` — `fetchDepartments`/`createDepartment`/`updateDepartment`; `department` on
  `createUser`/`updateUser`.
- `src/CepDepo.jsx` — shared "Bölüm CEP DEPO" view; Ana Birim column removed; search box; department
  labels; distribute form shows resolved department pool.
- `src/App.jsx` — user-form department dropdown; department column in users table; Departments admin
  panel; `minReactionThreshold` wiring on item create.
- `src/LabComponents.jsx` — "Min Reaksiyon Eşiği" input on the item form.

## DB changes
Additive (applied automatically on server boot via `ensureColumn` / `CREATE TABLE IF NOT EXISTS`):
- New table `departments (id, name UNIQUE, active, createdAt, updatedAt)`, seeded with the 5 names.
- `users.department VARCHAR(150) NULL`
- `item_definitions.minReactionThreshold INT NOT NULL DEFAULT 3`
- `cep_depo_balances.department`, `cep_depo_distributions.department` + `recipientTechnicianId`,
  `cep_depo_consumptions.department`, `stock_movements.department`

Destructive (run the migration SQL manually, after assigning departments):
- Merge per-tech `cep_depo_balances` rows into `(department, itemId)` pools; delete legacy rows.
- Backfill `department` on the history tables from the technician.
- Swap unique key `uniq_cep_balance_tech_item` → `uniq_cep_balance_dept_item (department, itemId)`.
- Drop `cep_depo_balances.labTechnicianId` and `.labTechnicianUsername`; make `department` NOT NULL.

## Deployment (step by step, on the server)

> Assumes you deploy the new code, boot once to add columns, then run the one-time migration.

1. **Pull / deploy the new code** to the server.
2. **Back up the database** (the migration is destructive):
   ```
   mysqldump -u <user> -p <db> cep_depo_balances cep_depo_distributions cep_depo_consumptions \
     stock_movements users item_definitions departments > backup_pre_cep_migration_2026-07-01.sql
   ```
3. **Boot the server once** (`npm run server`). On startup it will:
   - create the `departments` table and seed the 5 names,
   - add `users.department`, `item_definitions.minReactionThreshold`, and the `department` /
     `recipientTechnicianId` columns on the CEP tables.
   Confirm the log shows `[ensureCepDepo] CEP DEPO schema verified.` with no `skipped` warnings for
   these columns. (If you see `skipped: ER_NO_SUCH_TABLE`, the base tables weren't present yet —
   ensure the app's base schema exists, then reboot.)
4. **Assign every lab technician a department** — in the app: Users tab → Düzenle → pick a **Bölüm**,
   or by SQL, e.g. `UPDATE users SET department='Molecular Micro' WHERE username='lab1';`
   (Add any missing department names first via the Users tab → Bölümler → "Bölüm Ekle".)
5. **Verify no unassigned techs** (must return 0 rows):
   ```
   SELECT id, username FROM users WHERE role='LAB_TECHNICIAN' AND (department IS NULL OR department='');
   ```
6. **Run the one-time migration**:
   ```
   mysql -u <user> -p <db> < server/migrations/2026-07-01-shared-cep-depo.sql
   ```
7. **Restart the server** and verify (below).

## Test steps (post-deploy)
- A lab tech opens CEP DEPO → sees one shared "Bölüm CEP DEPO" table (no Ana Birim column), search works.
- Two techs in the same department: one consumes; the other sees the reduced shared balance.
- A tech in another department cannot consume the first department's pool.
- Distribute goods to a tech → they land in that tech's **department** pool; `recipientTechnicianId` recorded.
- Reaction item: request blocked while remaining reactions ≥ threshold; allowed once below.
- Non-reaction item: request blocked while any stock remains.
- Dashboard per-item CEP totals (`/api/unified-stock`) unchanged.

(Verified pre-deploy end-to-end against an isolated scratch DB: 20/20 assertions passed.)

## Rollback
1. Restore the balance table + data from the backup:
   `mysql -u <user> -p <db> < backup_pre_cep_migration_2026-07-01.sql`
2. Drop the added artifacts:
   ```sql
   ALTER TABLE cep_depo_balances DROP COLUMN department;
   ALTER TABLE cep_depo_distributions DROP COLUMN department, DROP COLUMN recipientTechnicianId;
   ALTER TABLE cep_depo_consumptions DROP COLUMN department;
   ALTER TABLE stock_movements DROP COLUMN department;
   ALTER TABLE users DROP COLUMN department;
   ALTER TABLE item_definitions DROP COLUMN minReactionThreshold;
   DROP TABLE departments;
   ```
3. Deploy the previous code revision.

## Risks
- **Destructive merge** of per-tech balances — always take the backup first (step 2).
- **Unassigned techs**: the migration's INNER JOIN skips techs with no department; the safety check
  (step 5) must return zero rows or their pocket stock is lost.
- **Reaction detection** relies on `consumptionUnit` containing "reak" — audit item definitions so
  reaction items are labelled consistently (e.g. "reaksiyon").
- **Department is resolved server-side per request** (not from the JWT), so department changes take
  effect immediately without re-login.
- Legacy `cep_depo_distributions/consumptions/stock_movements` still carry `labTechnicianId` for
  attribution; only `cep_depo_balances` drops the per-tech columns.
