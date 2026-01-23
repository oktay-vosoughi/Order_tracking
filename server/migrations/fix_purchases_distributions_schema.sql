-- Migration to fix purchases and distributions tables for LOT-based inventory system
-- This removes foreign key constraints to old items table and adds missing columns

USE `order_Tracking`;

-- Fix purchases table: Remove foreign key constraint to items table
-- Purchases should reference item_definitions instead, but we'll make it optional
ALTER TABLE `purchases` DROP FOREIGN KEY IF EXISTS `fk_purchases_item`;

-- Add department column to purchases if not exists
ALTER TABLE `purchases` ADD COLUMN IF NOT EXISTS `department` VARCHAR(255) NULL AFTER `itemName`;

-- Fix distributions table: Add missing columns
ALTER TABLE `distributions` DROP FOREIGN KEY IF EXISTS `fk_distributions_item`;

-- Add missing columns to distributions table
ALTER TABLE `distributions` 
  ADD COLUMN IF NOT EXISTS `department` VARCHAR(255) NULL AFTER `itemName`,
  ADD COLUMN IF NOT EXISTS `useFefo` TINYINT(1) DEFAULT 1 AFTER `quantity`,
  ADD COLUMN IF NOT EXISTS `status` VARCHAR(50) DEFAULT 'PENDING' AFTER `useFefo`;

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
CREATE INDEX IF NOT EXISTS `idx_purchases_requestedAt` ON `purchases`(`requestedAt`);
CREATE INDEX IF NOT EXISTS `idx_distributions_distributedDate` ON `distributions`(`distributedDate`);
CREATE INDEX IF NOT EXISTS `idx_distributions_status` ON `distributions`(`status`);
