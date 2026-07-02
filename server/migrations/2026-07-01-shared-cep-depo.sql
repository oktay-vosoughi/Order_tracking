-- ============================================================================
-- One-time migration: per-technician CEP DEPO pockets -> shared department pools
-- Date: 2026-07-01   Plan: docs/superpowers/plans/2026-07-01-shared-cep-depo.md
--
-- PREREQUISITES (do these first, in order):
--   1. Take a backup:
--        mysqldump -u <user> -p <db> cep_depo_balances cep_depo_distributions \
--          cep_depo_consumptions stock_movements users item_definitions \
--          > backup_pre_cep_migration_2026-07-01.sql
--   2. Ensure the additive columns from server/index.js startup exist (they do
--      after booting the server once with the Task 1 changes).
--   3. Confirm step 2 below (unassigned lab techs) returns NO rows. Assign every
--      LAB_TECHNICIAN a departmentId first, or the merge will DROP their stock.
--
-- This migration is safe to run on an empty/fresh DB (all statements no-op).
-- ============================================================================

-- 1. Seed departments (idempotent on unique name).
INSERT IGNORE INTO departments (id, name, active) VALUES
  (LOWER(REPLACE(UUID(),'-','')), 'Numune Kabul', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Moleküler Mikrobiyoloji', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Moleküler Genetik', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Sitogenetik', 1);

-- 2. SAFETY CHECK — must return zero rows before proceeding past step 3.
--    Any lab tech listed here has no department; their pocket stock would be
--    lost by the merge/delete below. Assign them a departmentId first.
SELECT id, username FROM users
WHERE role = 'LAB_TECHNICIAN' AND (departmentId IS NULL OR departmentId = '');

-- 3. Merge each tech's existing per-tech balances into a per-department pool.
--    Sums packQty/unitQty across all techs in the same department per item.
--    Only touches legacy rows (departmentId IS NULL). INNER JOIN on departments
--    means rows for unassigned techs are skipped (hence the safety check above).
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
WHERE b.departmentId IS NULL
GROUP BY u.departmentId, b.itemId;

-- 4. Remove the legacy per-tech rows now that they are merged.
DELETE FROM cep_depo_balances WHERE departmentId IS NULL;

-- 5. Backfill departmentId on history rows from the acting/recipient technician.
UPDATE cep_depo_distributions x JOIN users u ON u.id = x.labTechnicianId
  SET x.departmentId = u.departmentId, x.recipientTechnicianId = x.labTechnicianId
  WHERE x.departmentId IS NULL;
UPDATE cep_depo_consumptions x JOIN users u ON u.id = x.labTechnicianId
  SET x.departmentId = u.departmentId WHERE x.departmentId IS NULL;
UPDATE stock_movements x JOIN users u ON u.id = x.labTechnicianId
  SET x.departmentId = u.departmentId WHERE x.departmentId IS NULL AND x.labTechnicianId IS NOT NULL;

-- 6. Swap the unique key from per-tech to per-department, drop the per-tech index.
ALTER TABLE cep_depo_balances DROP INDEX uniq_cep_balance_tech_item;
ALTER TABLE cep_depo_balances DROP INDEX idx_cep_balance_tech;
ALTER TABLE cep_depo_balances ADD UNIQUE KEY uniq_cep_balance_dept_item (departmentId, itemId);
ALTER TABLE cep_depo_balances ADD INDEX idx_cep_balance_dept (departmentId);

-- 7. Drop the now-unused per-tech columns from the shared balance table.
--    (The shared model has no single owning technician; history tables retain it.)
ALTER TABLE cep_depo_balances DROP COLUMN labTechnicianId;
ALTER TABLE cep_depo_balances DROP COLUMN labTechnicianUsername;

-- 8. departmentId is now mandatory on the balance table.
ALTER TABLE cep_depo_balances MODIFY departmentId VARCHAR(64) NOT NULL;

-- ============================================================================
-- ROLLBACK (if needed):
--   Restore the balance table shape and data from the pre-migration dump:
--     mysql -u <user> -p <db> < backup_pre_cep_migration_2026-07-01.sql
--   Then drop the added artifacts:
--     ALTER TABLE cep_depo_balances DROP COLUMN departmentId, DROP COLUMN departmentName;
--     ALTER TABLE cep_depo_distributions DROP COLUMN departmentId, DROP COLUMN recipientTechnicianId;
--     ALTER TABLE cep_depo_consumptions DROP COLUMN departmentId;
--     ALTER TABLE stock_movements DROP COLUMN departmentId;
--     ALTER TABLE users DROP COLUMN departmentId;
--     ALTER TABLE item_definitions DROP COLUMN minReactionThreshold;
--     DROP TABLE departments;
-- ============================================================================
