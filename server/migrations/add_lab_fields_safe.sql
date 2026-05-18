-- Safe migration to add laboratory-specific fields to existing items table
-- NOTE: items table is legacy (replaced by item_definitions in lot-based schema)
-- Compatible with MySQL 5.7+ and MySQL 8+
USE `order_Tracking`;

-- Add new columns to items only if the legacy items table still exists
SET @tbl = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items');

SET @col = IF(@tbl>0, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items' AND COLUMN_NAME='expiryDate'), 1);
SET @sql = IF(@tbl>0 AND @col=0, 'ALTER TABLE `items` ADD COLUMN `expiryDate` VARCHAR(40) NULL AFTER `status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = IF(@tbl>0, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items' AND COLUMN_NAME='openingDate'), 1);
SET @sql = IF(@tbl>0 AND @col=0, 'ALTER TABLE `items` ADD COLUMN `openingDate` VARCHAR(40) NULL AFTER `expiryDate`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = IF(@tbl>0, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items' AND COLUMN_NAME='storageTemp'), 1);
SET @sql = IF(@tbl>0 AND @col=0, 'ALTER TABLE `items` ADD COLUMN `storageTemp` VARCHAR(50) NULL AFTER `openingDate`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = IF(@tbl>0, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items' AND COLUMN_NAME='chemicalType'), 1);
SET @sql = IF(@tbl>0 AND @col=0, 'ALTER TABLE `items` ADD COLUMN `chemicalType` VARCHAR(100) NULL AFTER `storageTemp`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = IF(@tbl>0, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items' AND COLUMN_NAME='msdsUrl'), 1);
SET @sql = IF(@tbl>0 AND @col=0, 'ALTER TABLE `items` ADD COLUMN `msdsUrl` TEXT NULL AFTER `chemicalType`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = IF(@tbl>0, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items' AND COLUMN_NAME='wasteStatus'), 1);
SET @sql = IF(@tbl>0 AND @col=0, 'ALTER TABLE `items` ADD COLUMN `wasteStatus` VARCHAR(50) NULL AFTER `msdsUrl`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add index for expiry date (only if items table exists and index is missing)
SET @idx = IF(@tbl>0, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items' AND INDEX_NAME='idx_items_expiryDate'), 1);
SET @sql = IF(@tbl>0 AND @idx=0, 'ALTER TABLE `items` ADD INDEX `idx_items_expiryDate` (`expiryDate`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Create waste_records table for tracking expired/contaminated products
CREATE TABLE IF NOT EXISTS `waste_records` (
  `id` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,
  `quantity` INT NULL,
  `wasteType` VARCHAR(50) NULL,
  `reason` TEXT NULL,
  `disposalMethod` VARCHAR(255) NULL,
  `disposedBy` VARCHAR(255) NULL,
  `disposedDate` VARCHAR(40) NULL,
  `certificationNo` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_waste_itemId` (`itemId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create counting_schedules table for tracking stock counting activities
CREATE TABLE IF NOT EXISTS `counting_schedules` (
  `id` VARCHAR(64) NOT NULL,
  `scheduleType` VARCHAR(50) NOT NULL,
  `scheduledDate` VARCHAR(40) NOT NULL,
  `completedDate` VARCHAR(40) NULL,
  `completedBy` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_counting_scheduledDate` (`scheduledDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create counting_records table for detailed counting results
CREATE TABLE IF NOT EXISTS `counting_records` (
  `id` VARCHAR(64) NOT NULL,
  `scheduleId` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,
  `expectedQty` INT NULL,
  `actualQty` INT NULL,
  `variance` INT NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_counting_scheduleId` (`scheduleId`),
  INDEX `idx_counting_itemId` (`itemId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
