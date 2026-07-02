-- ============================================================================
-- One-time migration: per-technician CEP DEPO pockets -> shared department pools
-- Date: 2026-07-01   Plan: docs/superpowers/plans/2026-07-01-shared-cep-depo.md
--
-- IDEMPOTENT: safe to re-run (deploy.sh re-runs every migration on each deploy).
-- Every destructive step is guarded so an already-migrated DB is a clean no-op.
--
-- Departments are keyed by NAME STRING (same vocabulary as item_definitions.department
-- and src/labDepartments.mjs). The `departments` table is a runtime-editable registry.
--
-- PREREQUISITE for the INITIAL run: every LAB_TECHNICIAN must have a `department`
-- assigned, or their pocket stock is skipped by the merge (INNER JOIN on users).
--   SELECT id, username FROM users WHERE role='LAB_TECHNICIAN' AND (department IS NULL OR department='');
-- should return no rows before the first run.
-- ============================================================================

-- 1. Departments registry (self-sufficient; ADMIN can add more names at runtime).
CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(150) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_department_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO departments (id, name, active) VALUES
  (LOWER(REPLACE(UUID(),'-','')), 'Cytogenetic', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Molecular Micro', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Molecular Genetic', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Numune Kabul', 1),
  (LOWER(REPLACE(UUID(),'-','')), 'Diğer', 1);

-- 2. Ensure the `department` column exists on cep_depo_balances (server boot also adds it).
SET @hasDept := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND COLUMN_NAME='department');
SET @s := IF(@hasDept=0,
  'ALTER TABLE cep_depo_balances ADD COLUMN department VARCHAR(150) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Recompute presence flags.
SET @hasTech := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND COLUMN_NAME='labTechnicianId');
SET @hasDept := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND COLUMN_NAME='department');

-- 3. Merge legacy per-tech balances into per-department pools.
--    Runs ONLY while the legacy labTechnicianId column still exists (i.e. not yet migrated).
SET @s := IF(@hasTech>0 AND @hasDept>0,
'INSERT INTO cep_depo_balances
   (id, labTechnicianId, labTechnicianUsername, itemId, packQty, unitQty, status, consumptionUnitType, department, createdAt, updatedAt)
 SELECT LOWER(REPLACE(UUID(),''-'','''')), 0, ''MERGED'', b.itemId,
        SUM(b.packQty), SUM(b.unitQty),
        CASE WHEN SUM(b.packQty) > 0 OR SUM(b.unitQty) > 0 THEN ''ACTIVE'' ELSE ''ZERO'' END,
        MAX(b.consumptionUnitType), u.department, NOW(), NOW()
 FROM cep_depo_balances b
 JOIN users u ON u.id = b.labTechnicianId
 WHERE b.department IS NULL AND u.department IS NOT NULL AND u.department <> ''''
 GROUP BY u.department, b.itemId',
'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 4. Remove legacy per-tech rows (those still without a department). No-op once migrated.
SET @s := IF(@hasTech>0 AND @hasDept>0,
  'DELETE FROM cep_depo_balances WHERE department IS NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5. Backfill department on the history tables (idempotent: only rows still NULL).
--    History tables keep labTechnicianId, so these are safe to run any time.
UPDATE cep_depo_distributions x JOIN users u ON u.id = x.labTechnicianId
  SET x.department = u.department, x.recipientTechnicianId = x.labTechnicianId
  WHERE x.department IS NULL;
UPDATE cep_depo_consumptions x JOIN users u ON u.id = x.labTechnicianId
  SET x.department = u.department WHERE x.department IS NULL;
UPDATE stock_movements x JOIN users u ON u.id = x.labTechnicianId
  SET x.department = u.department WHERE x.department IS NULL AND x.labTechnicianId IS NOT NULL;

-- 6. Swap the unique key: drop the per-tech key/index if present.
SET @x := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND INDEX_NAME='uniq_cep_balance_tech_item');
SET @s := IF(@x>0, 'ALTER TABLE cep_depo_balances DROP INDEX uniq_cep_balance_tech_item', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @x := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND INDEX_NAME='idx_cep_balance_tech');
SET @s := IF(@x>0, 'ALTER TABLE cep_depo_balances DROP INDEX idx_cep_balance_tech', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 7. Add the per-department unique key + index if missing.
SET @x := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND INDEX_NAME='uniq_cep_balance_dept_item');
SET @s := IF(@x=0, 'ALTER TABLE cep_depo_balances ADD UNIQUE KEY uniq_cep_balance_dept_item (department, itemId)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @x := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND INDEX_NAME='idx_cep_balance_dept');
SET @s := IF(@x=0, 'ALTER TABLE cep_depo_balances ADD INDEX idx_cep_balance_dept (department)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 8. Drop the now-unused per-tech columns from the shared balance table (if present).
SET @x := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND COLUMN_NAME='labTechnicianId');
SET @s := IF(@x>0, 'ALTER TABLE cep_depo_balances DROP COLUMN labTechnicianId', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @x := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cep_depo_balances' AND COLUMN_NAME='labTechnicianUsername');
SET @s := IF(@x>0, 'ALTER TABLE cep_depo_balances DROP COLUMN labTechnicianUsername', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 9. Make department NOT NULL once every row has one (skips if any NULL remains).
SET @nulls := (SELECT COUNT(*) FROM cep_depo_balances WHERE department IS NULL OR department = '');
SET @s := IF(@hasDept>0 AND @nulls=0,
  'ALTER TABLE cep_depo_balances MODIFY department VARCHAR(150) NOT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ============================================================================
-- ROLLBACK: restore cep_depo_balances from a pre-migration backup, then:
--   ALTER TABLE cep_depo_balances DROP COLUMN department;
--   ALTER TABLE cep_depo_distributions DROP COLUMN department, DROP COLUMN recipientTechnicianId;
--   ALTER TABLE cep_depo_consumptions DROP COLUMN department;
--   ALTER TABLE stock_movements DROP COLUMN department;
--   ALTER TABLE users DROP COLUMN department;
--   ALTER TABLE item_definitions DROP COLUMN minReactionThreshold;
--   DROP TABLE departments;
-- ============================================================================
