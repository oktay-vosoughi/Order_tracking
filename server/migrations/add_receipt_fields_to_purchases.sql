-- Migration: Add receipt tracking fields to purchases table
-- Date: 2026-01-27
-- Compatible with MySQL 5.7+ and MySQL 8+

-- Add receivedBy column
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='purchases' AND COLUMN_NAME='receivedBy');
SET @sql = IF(@col = 0, 'ALTER TABLE `purchases` ADD COLUMN `receivedBy` VARCHAR(255) NULL AFTER `receivedQtyTotal`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add receivedDate column
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='purchases' AND COLUMN_NAME='receivedDate');
SET @sql = IF(@col = 0, 'ALTER TABLE `purchases` ADD COLUMN `receivedDate` DATETIME NULL AFTER `receivedBy`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add lotNo column
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='purchases' AND COLUMN_NAME='lotNo');
SET @sql = IF(@col = 0, 'ALTER TABLE `purchases` ADD COLUMN `lotNo` VARCHAR(255) NULL AFTER `receivedDate`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add expiryDate column
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='purchases' AND COLUMN_NAME='expiryDate');
SET @sql = IF(@col = 0, 'ALTER TABLE `purchases` ADD COLUMN `expiryDate` DATE NULL AFTER `lotNo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
