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
CREATE INDEX IF NOT EXISTS `idx_lots_lotNumber` ON `lots` (`lotNumber`);
