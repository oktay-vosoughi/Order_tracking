-- Migration to increase attachmentUrl column size to handle base64 encoded images
-- Base64 images can be very large, so we increase from VARCHAR(255) to LONGTEXT

USE `order_Tracking`;

-- Increase attachmentUrl size in lots table
ALTER TABLE `lots` 
MODIFY COLUMN `attachmentUrl` LONGTEXT NULL;

-- Increase attachmentUrl size in receipts table
ALTER TABLE `receipts` 
MODIFY COLUMN `attachmentUrl` LONGTEXT NULL;

-- Add index on lotNumber for better performance
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='lots' AND INDEX_NAME='idx_lots_lotNumber');
SET @sql = IF(@idx = 0, 'CREATE INDEX `idx_lots_lotNumber` ON `lots` (`lotNumber`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
