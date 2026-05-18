-- Add receivedBy column to usage_records table
-- This field stores the name of the person who received the material
-- Compatible with MySQL 5.7+ and MySQL 8+

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='usage_records' AND COLUMN_NAME='receivedBy');
SET @sql = IF(@col = 0, 'ALTER TABLE `usage_records` ADD COLUMN `receivedBy` VARCHAR(255) NULL AFTER `usedBy`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
