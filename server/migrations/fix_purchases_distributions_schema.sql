-- Migration to fix purchases and distributions tables for LOT-based inventory system
-- This removes foreign key constraints to old items table and adds missing columns
-- Compatible with MySQL 5.7+ and MySQL 8+

USE `order_Tracking`;

-- Drop FK to old items table from purchases (if it points to items, not item_definitions)
SET @fk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA='order_Tracking' AND CONSTRAINT_NAME='fk_purchases_item'
           AND REFERENCED_TABLE_NAME='items');
SET @sql = IF(@fk > 0, 'ALTER TABLE `purchases` DROP FOREIGN KEY `fk_purchases_item`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add department column to purchases if not exists
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='purchases' AND COLUMN_NAME='department');
SET @sql = IF(@col = 0, 'ALTER TABLE `purchases` ADD COLUMN `department` VARCHAR(255) NULL AFTER `itemName`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop FK to old items table from distributions (if it points to items, not item_definitions)
SET @fk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
           WHERE CONSTRAINT_SCHEMA='order_Tracking' AND CONSTRAINT_NAME='fk_distributions_item'
           AND REFERENCED_TABLE_NAME='items');
SET @sql = IF(@fk > 0, 'ALTER TABLE `distributions` DROP FOREIGN KEY `fk_distributions_item`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add missing columns to distributions table
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='distributions' AND COLUMN_NAME='department');
SET @sql = IF(@col = 0, 'ALTER TABLE `distributions` ADD COLUMN `department` VARCHAR(255) NULL AFTER `itemName`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='distributions' AND COLUMN_NAME='useFefo');
SET @sql = IF(@col = 0, 'ALTER TABLE `distributions` ADD COLUMN `useFefo` TINYINT(1) DEFAULT 1 AFTER `quantity`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='distributions' AND COLUMN_NAME='status');
SET @sql = IF(@col = 0, 'ALTER TABLE `distributions` ADD COLUMN `status` VARCHAR(50) DEFAULT ''PENDING'' AFTER `useFefo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Create distribution_lots junction table if not exists
CREATE TABLE IF NOT EXISTS `distribution_lots` (
  `id` VARCHAR(64) NOT NULL,
  `distributionId` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NOT NULL,
  `lotNumber` VARCHAR(100) NULL,
  `quantityUsed` INT NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_distribution_lots_distributionId` (`distributionId`),
  INDEX `idx_distribution_lots_lotId` (`lotId`),
  CONSTRAINT `fk_distribution_lots_distribution`
    FOREIGN KEY (`distributionId`) REFERENCES `distributions`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_distribution_lots_lot`
    FOREIGN KEY (`lotId`) REFERENCES `lots`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update existing distributions to have default values
UPDATE `distributions` SET `status` = 'COMPLETED' WHERE `status` IS NULL;
UPDATE `distributions` SET `useFefo` = 1 WHERE `useFefo` IS NULL;

-- Add indexes for better performance
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='purchases' AND INDEX_NAME='idx_purchases_requestedAt');
SET @sql = IF(@idx = 0, 'CREATE INDEX `idx_purchases_requestedAt` ON `purchases`(`requestedAt`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='distributions' AND INDEX_NAME='idx_distributions_distributedDate');
SET @sql = IF(@idx = 0, 'CREATE INDEX `idx_distributions_distributedDate` ON `distributions`(`distributedDate`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='distributions' AND INDEX_NAME='idx_distributions_status');
SET @sql = IF(@idx = 0, 'CREATE INDEX `idx_distributions_status` ON `distributions`(`status`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
