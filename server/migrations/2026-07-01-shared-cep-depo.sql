-- ============================================================================
-- One-time migration: per-technician CEP DEPO pockets -> shared department pools
-- Date: 2026-07-01   Plan: docs/superpowers/plans/2026-07-01-shared-cep-depo.md
--
-- Departments are keyed by NAME STRING (same vocabulary as item_definitions.department
-- and src/labDepartments.mjs). The `departments` table is a runtime-editable registry
-- of valid names; users.department / cep_depo_balances.department store the name string.
--
-- PREREQUISITES (do these first, in order):
--   1. Deploy the new server code and boot it once (npm run server). Startup adds the
--      additive `department` / `minReactionThreshold` / `recipientTechnicianId` columns
--      and seeds the departments registry. This migration only does the destructive
--      re-key + merge that startup intentionally does NOT do.
--   2. Take a backup:
--        mysqldump -u <user> -p <db> cep_depo_balances cep_depo_distributions \
--          cep_depo_consumptions stock_movements users item_definitions departments \
--          > backup_pre_cep_migration_2026-07-01.sql
--   3. Assign every LAB_TECHNICIAN a department (via the Users admin UI, or UPDATE
--      users SET department='Molecular Micro' WHERE username='lab1';). Then confirm
--      step 2 below returns NO rows.
--
-- Safe to run on a fresh/empty DB (all data statements no-op).
-- ============================================================================

-- 1. Ensure the registry contains the canonical names (idempotent; ADMIN may add more).
INSERT IGNORE INTO departments (id, name, active) VALUES
  (LOWER(REPLACE(UUID(),'-','')), 'Cytogenetic', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Molecular Micro', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Molecular Genetic', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Numune Kabul', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Diğer', 1);

-- 2. SAFETY CHECK — must return zero rows before proceeding past step 3.
--    Any lab tech here has no department; their pocket stock would be lost by the
--    merge/delete below. Assign them a department first.
SELECT id, username FROM users
WHERE role = 'LAB_TECHNICIAN' AND (department IS NULL OR department = '');

-- 3. Merge each tech's existing per-tech balances into a per-department pool.
--    Sums packQty/unitQty across all techs in the same department per item.
--    Only touches legacy rows (department IS NULL on the balance). INNER JOIN on the
--    tech's department means rows for unassigned techs are skipped (see safety check).
INSERT INTO cep_depo_balances
  (id, labTechnicianId, labTechnicianUsername, itemId, packQty, unitQty, status,
   consumptionUnitType, department, createdAt, updatedAt)
SELECT LOWER(REPLACE(UUID(),'-','')), 0, 'MERGED', b.itemId,
       SUM(b.packQty), SUM(b.unitQty),
       CASE WHEN SUM(b.packQty) > 0 OR SUM(b.unitQty) > 0 THEN 'ACTIVE' ELSE 'ZERO' END,
       MAX(b.consumptionUnitType), u.department, NOW(), NOW()
FROM cep_depo_balances b
JOIN users u ON u.id = b.labTechnicianId
WHERE b.department IS NULL AND u.department IS NOT NULL AND u.department <> ''
GROUP BY u.department, b.itemId;

-- 4. Remove the legacy per-tech rows now that they are merged.
DELETE FROM cep_depo_balances WHERE department IS NULL;

-- 5. Backfill department on history rows from the acting/recipient technician.
UPDATE cep_depo_distributions x JOIN users u ON u.id = x.labTechnicianId
  SET x.department = u.department, x.recipientTechnicianId = x.labTechnicianId
  WHERE x.department IS NULL;
UPDATE cep_depo_consumptions x JOIN users u ON u.id = x.labTechnicianId
  SET x.department = u.department WHERE x.department IS NULL;
UPDATE stock_movements x JOIN users u ON u.id = x.labTechnicianId
  SET x.department = u.department WHERE x.department IS NULL AND x.labTechnicianId IS NOT NULL;

-- 6. Swap the unique key from per-tech to per-department; drop the per-tech index.
ALTER TABLE cep_depo_balances DROP INDEX uniq_cep_balance_tech_item;
ALTER TABLE cep_depo_balances DROP INDEX idx_cep_balance_tech;
ALTER TABLE cep_depo_balances ADD UNIQUE KEY uniq_cep_balance_dept_item (department, itemId);
ALTER TABLE cep_depo_balances ADD INDEX idx_cep_balance_dept (department);

-- 7. Drop the now-unused per-tech columns from the shared balance table.
--    (The shared model has no single owning technician; history tables retain it.)
ALTER TABLE cep_depo_balances DROP COLUMN labTechnicianId;
ALTER TABLE cep_depo_balances DROP COLUMN labTechnicianUsername;

-- 8. department is now mandatory on the balance table.
ALTER TABLE cep_depo_balances MODIFY department VARCHAR(150) NOT NULL;

-- ============================================================================
-- ROLLBACK (if needed):
--   Restore the balance table shape and data from the pre-migration dump:
--     mysql -u <user> -p <db> < backup_pre_cep_migration_2026-07-01.sql
--   Then drop the added artifacts:
--     ALTER TABLE cep_depo_balances DROP COLUMN department;
--     ALTER TABLE cep_depo_distributions DROP COLUMN department, DROP COLUMN recipientTechnicianId;
--     ALTER TABLE cep_depo_consumptions DROP COLUMN department;
--     ALTER TABLE stock_movements DROP COLUMN department;
--     ALTER TABLE users DROP COLUMN department;
--     ALTER TABLE item_definitions DROP COLUMN minReactionThreshold;
--     DROP TABLE departments;
-- ============================================================================
