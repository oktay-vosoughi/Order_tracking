-- ============================================================
-- CEP DEPO & LAB_TECHNICIAN SYSTEM
-- See docs/audit/CEP_DEPO_DESIGN.md for the full spec.
-- Idempotent: safe to re-run.
-- ============================================================

USE `order_Tracking`;

-- ------------------------------------------------------------
-- 1) item_definitions: defaults for pack / unit / test capacity
-- ------------------------------------------------------------

SET @db = 'order_Tracking';

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='item_definitions' AND COLUMN_NAME='packageUnit');
SET @s := IF(@c=0,
  'ALTER TABLE item_definitions ADD COLUMN packageUnit VARCHAR(50) NULL AFTER unit',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='item_definitions' AND COLUMN_NAME='consumptionUnit');
SET @s := IF(@c=0,
  'ALTER TABLE item_definitions ADD COLUMN consumptionUnit VARCHAR(50) NULL AFTER packageUnit',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='item_definitions' AND COLUMN_NAME='unitsPerPackage');
SET @s := IF(@c=0,
  'ALTER TABLE item_definitions ADD COLUMN unitsPerPackage INT NULL AFTER consumptionUnit',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='item_definitions' AND COLUMN_NAME='consumptionUnitType');
SET @s := IF(@c=0,
  "ALTER TABLE item_definitions ADD COLUMN consumptionUnitType VARCHAR(16) NOT NULL DEFAULT 'PACK' AFTER unitsPerPackage",
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ------------------------------------------------------------
-- 2) lots: per-receipt overrides
-- ------------------------------------------------------------

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='lots' AND COLUMN_NAME='packageUnit');
SET @s := IF(@c=0,
  'ALTER TABLE lots ADD COLUMN packageUnit VARCHAR(50) NULL',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='lots' AND COLUMN_NAME='unitsPerPackage');
SET @s := IF(@c=0,
  'ALTER TABLE lots ADD COLUMN unitsPerPackage INT NULL',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='lots' AND COLUMN_NAME='consumptionUnitType');
SET @s := IF(@c=0,
  'ALTER TABLE lots ADD COLUMN consumptionUnitType VARCHAR(16) NULL',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ------------------------------------------------------------
-- 3) purchases: override flow + CEP flag
-- ------------------------------------------------------------

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='purchases' AND COLUMN_NAME='requestedFor');
SET @s := IF(@c=0,
  'ALTER TABLE purchases ADD COLUMN requestedFor VARCHAR(100) NULL AFTER requestedBy',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='purchases' AND COLUMN_NAME='overrideReason');
SET @s := IF(@c=0,
  'ALTER TABLE purchases ADD COLUMN overrideReason TEXT NULL AFTER requestedFor',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA=@db AND TABLE_NAME='purchases' AND COLUMN_NAME='isCepDepoRequest');
SET @s := IF(@c=0,
  'ALTER TABLE purchases ADD COLUMN isCepDepoRequest TINYINT(1) NOT NULL DEFAULT 0 AFTER overrideReason',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ------------------------------------------------------------
-- 4) cep_depo_balances
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `cep_depo_balances` (
  `id`                    VARCHAR(64)  NOT NULL,
  `labTechnicianId`       BIGINT UNSIGNED NOT NULL,
  `labTechnicianUsername` VARCHAR(100) NOT NULL,
  `itemId`                VARCHAR(64)  NOT NULL,
  `packQty`               DECIMAL(12,2) NOT NULL DEFAULT 0,
  `unitQty`               DECIMAL(14,2) NOT NULL DEFAULT 0,
  `status`                VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  `createdAt`             DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`             DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_cep_balance_tech_item` (`labTechnicianId`, `itemId`),
  INDEX `idx_cep_balance_item` (`itemId`),
  INDEX `idx_cep_balance_tech` (`labTechnicianId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5) cep_depo_distributions (header) + cep_depo_distribution_lots (lines)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `cep_depo_distributions` (
  `id`                    VARCHAR(64)  NOT NULL,
  `labTechnicianId`       BIGINT UNSIGNED NOT NULL,
  `labTechnicianUsername` VARCHAR(100) NOT NULL,
  `itemId`                VARCHAR(64)  NOT NULL,
  `packQty`               DECIMAL(12,2) NOT NULL,
  `unitQty`               DECIMAL(14,2) NOT NULL,
  `purchaseId`            VARCHAR(64)  NULL,
  `distributedBy`         VARCHAR(100) NOT NULL,
  `distributedAt`         DATETIME DEFAULT CURRENT_TIMESTAMP,
  `notes`                 TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_cep_dist_tech` (`labTechnicianId`),
  INDEX `idx_cep_dist_item` (`itemId`),
  INDEX `idx_cep_dist_purchase` (`purchaseId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cep_depo_distribution_lots` (
  `id`                VARCHAR(64) NOT NULL,
  `cepDistributionId` VARCHAR(64) NOT NULL,
  `lotId`             VARCHAR(64) NOT NULL,
  `lotNumber`         VARCHAR(100) NULL,
  `packQty`           DECIMAL(12,2) NOT NULL,
  `unitQty`           DECIMAL(14,2) NOT NULL,
  `createdAt`         DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cep_distlot_dist` (`cepDistributionId`),
  INDEX `idx_cep_distlot_lot` (`lotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6) cep_depo_consumptions (lab-tech usage events)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `cep_depo_consumptions` (
  `id`                    VARCHAR(64)  NOT NULL,
  `labTechnicianId`       BIGINT UNSIGNED NOT NULL,
  `labTechnicianUsername` VARCHAR(100) NOT NULL,
  `itemId`                VARCHAR(64)  NOT NULL,
  `consumptionUnitType`   VARCHAR(16)  NOT NULL,
  `quantity`              DECIMAL(14,2) NOT NULL,
  `packDelta`             DECIMAL(12,2) NOT NULL,
  `unitDelta`             DECIMAL(14,2) NOT NULL,
  `testCount`             INT NULL,
  `notes`                 TEXT NULL,
  `performedAt`           DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cep_cons_tech` (`labTechnicianId`),
  INDEX `idx_cep_cons_item` (`itemId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7) stock_movements (unified ledger)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id`                  VARCHAR(64) NOT NULL,
  `movementType`        VARCHAR(32) NOT NULL,
  `itemId`              VARCHAR(64) NOT NULL,
  `fromLocation`        VARCHAR(32) NOT NULL,
  `toLocation`          VARCHAR(32) NOT NULL,
  `packQty`             DECIMAL(12,2) NOT NULL DEFAULT 0,
  `unitQty`             DECIMAL(14,2) NOT NULL DEFAULT 0,
  `performedByUserId`   BIGINT UNSIGNED NULL,
  `performedByUsername` VARCHAR(100) NULL,
  `labTechnicianId`     BIGINT UNSIGNED NULL,
  `requestId`           VARCHAR(64) NULL,
  `refId`               VARCHAR(64) NULL,
  `notes`               TEXT NULL,
  `createdAt`           DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sm_item` (`itemId`),
  INDEX `idx_sm_type` (`movementType`),
  INDEX `idx_sm_tech` (`labTechnicianId`),
  INDEX `idx_sm_request` (`requestId`),
  INDEX `idx_sm_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8) Seed: a sample LAB_TECHNICIAN user (password = 0000 hash)
--    No-op if already exists.
-- ------------------------------------------------------------

INSERT INTO users (username, passwordHash, role, createdBy)
SELECT 'labtech1', '$2b$10$s9Q075u4aJOCrM2A4penieAEySWapOOHD2hgFws6gU.106OXK9a9S', 'LAB_TECHNICIAN', 'system'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'labtech1');

-- ============================================================
-- END
-- ============================================================
