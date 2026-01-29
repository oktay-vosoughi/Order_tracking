-- Migration: Add ideal_stock and max_stock columns to item_definitions table
-- Purpose: Support ideal and maximum stock level tracking for inventory management
-- Date: 2026-01-29

USE `order_Tracking`;

-- Add ideal_stock column (nullable, decimal for consistency with stock display)
ALTER TABLE `item_definitions` 
ADD COLUMN `ideal_stock` DECIMAL(10,2) NULL DEFAULT NULL 
AFTER `minStock`;

-- Add max_stock column (nullable, decimal for consistency with stock display)
ALTER TABLE `item_definitions` 
ADD COLUMN `max_stock` DECIMAL(10,2) NULL DEFAULT NULL 
AFTER `ideal_stock`;

-- Add index for performance on stock level queries
ALTER TABLE `item_definitions` 
ADD INDEX `idx_item_ideal_stock` (`ideal_stock`);

ALTER TABLE `item_definitions` 
ADD INDEX `idx_item_max_stock` (`max_stock`);

-- Migration complete
-- Existing rows will have NULL values for these new columns
-- This is safe and backward compatible
