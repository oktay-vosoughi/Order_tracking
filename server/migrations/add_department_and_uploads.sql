-- Migration to add department and file upload fields
-- Compatible with MySQL 5.7+ and MySQL 8+

USE `order_Tracking`;

-- Add department to items (legacy table - may not exist in lot-based schema)
SET @tbl = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items');
SET @col = IF(@tbl > 0, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='items' AND COLUMN_NAME='department'), 1);
SET @sql = IF(@tbl > 0 AND @col = 0, 'ALTER TABLE `items` ADD COLUMN `department` VARCHAR(100) NULL AFTER `category`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add department to purchases
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='purchases' AND COLUMN_NAME='department');
SET @sql = IF(@col = 0, 'ALTER TABLE `purchases` ADD COLUMN `department` VARCHAR(100) NULL AFTER `itemName`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add department to distributions
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='distributions' AND COLUMN_NAME='department');
SET @sql = IF(@col = 0, 'ALTER TABLE `distributions` ADD COLUMN `department` VARCHAR(100) NULL AFTER `itemName`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add attachment fields (photo/doc) to receipts
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='receipts' AND COLUMN_NAME='attachmentUrl');
SET @sql = IF(@col = 0, 'ALTER TABLE `receipts` ADD COLUMN `attachmentUrl` TEXT NULL, ADD COLUMN `attachmentName` VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
