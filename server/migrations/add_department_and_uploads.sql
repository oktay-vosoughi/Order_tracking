-- Migration to add department and file upload fields

USE `order_Tracking`;

-- Add department to items
ALTER TABLE `items` ADD COLUMN `department` VARCHAR(100) NULL AFTER `category`;

-- Add department to purchases
ALTER TABLE `purchases` ADD COLUMN `department` VARCHAR(100) NULL AFTER `itemName`;

-- Add department to distributions
ALTER TABLE `distributions` ADD COLUMN `department` VARCHAR(100) NULL AFTER `itemName`;

-- Add attachment fields (photo/doc) to receipts
ALTER TABLE `receipts` ADD COLUMN `attachmentUrl` TEXT NULL,
                       ADD COLUMN `attachmentName` VARCHAR(255) NULL;
