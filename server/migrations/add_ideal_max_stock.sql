-- Migration: Add ideal_stock and max_stock columns to item_definitions table
-- Purpose: Support ideal and maximum stock level tracking for inventory management
-- Date: 2026-01-29
-- Compatible with MySQL 5.7+ and MySQL 8+

USE `order_Tracking`;

-- Add ideal_stock column (nullable, decimal for consistency with stock display)
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='item_definitions' AND COLUMN_NAME='ideal_stock');
SET @sql = IF(@col = 0, 'ALTER TABLE `item_definitions` ADD COLUMN `ideal_stock` DECIMAL(10,2) NULL DEFAULT NULL AFTER `minStock`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add max_stock column (nullable, decimal for consistency with stock display)
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='item_definitions' AND COLUMN_NAME='max_stock');
SET @sql = IF(@col = 0, 'ALTER TABLE `item_definitions` ADD COLUMN `max_stock` DECIMAL(10,2) NULL DEFAULT NULL AFTER `ideal_stock`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add index for performance on stock level queries
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='item_definitions' AND INDEX_NAME='idx_item_ideal_stock');
SET @sql = IF(@idx = 0, 'ALTER TABLE `item_definitions` ADD INDEX `idx_item_ideal_stock` (`ideal_stock`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='order_Tracking' AND TABLE_NAME='item_definitions' AND INDEX_NAME='idx_item_max_stock');
SET @sql = IF(@idx = 0, 'ALTER TABLE `item_definitions` ADD INDEX `idx_item_max_stock` (`max_stock`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration complete
-- Existing rows will have NULL values for these new columns
-- This is safe and backward compatible
