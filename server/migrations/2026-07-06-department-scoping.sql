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
