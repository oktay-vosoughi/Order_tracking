-- Safe migration to add laboratory-specific fields to existing items table
USE `order_Tracking`;

-- Add new columns to items table (will fail silently if they already exist)
ALTER TABLE `items` ADD COLUMN `expiryDate` VARCHAR(40) NULL AFTER `status`;
ALTER TABLE `items` ADD COLUMN `openingDate` VARCHAR(40) NULL AFTER `expiryDate`;
ALTER TABLE `items` ADD COLUMN `storageTemp` VARCHAR(50) NULL AFTER `openingDate`;
ALTER TABLE `items` ADD COLUMN `chemicalType` VARCHAR(100) NULL AFTER `storageTemp`;
ALTER TABLE `items` ADD COLUMN `msdsUrl` TEXT NULL AFTER `chemicalType`;
ALTER TABLE `items` ADD COLUMN `wasteStatus` VARCHAR(50) NULL AFTER `msdsUrl`;

-- Add index for expiry date
ALTER TABLE `items` ADD INDEX `idx_items_expiryDate` (`expiryDate`);

-- Create waste_records table for tracking expired/contaminated products
CREATE TABLE IF NOT EXISTS `waste_records` (
  `id` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,
  `quantity` INT NULL,
  `wasteType` VARCHAR(50) NULL,
  `reason` TEXT NULL,
  `disposalMethod` VARCHAR(255) NULL,
  `disposedBy` VARCHAR(255) NULL,
  `disposedDate` VARCHAR(40) NULL,
  `certificationNo` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_waste_itemId` (`itemId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create counting_schedules table for tracking stock counting activities
CREATE TABLE IF NOT EXISTS `counting_schedules` (
  `id` VARCHAR(64) NOT NULL,
  `scheduleType` VARCHAR(50) NOT NULL,
  `scheduledDate` VARCHAR(40) NOT NULL,
  `completedDate` VARCHAR(40) NULL,
  `completedBy` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_counting_scheduledDate` (`scheduledDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create counting_records table for detailed counting results
CREATE TABLE IF NOT EXISTS `counting_records` (
  `id` VARCHAR(64) NOT NULL,
  `scheduleId` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,
  `expectedQty` INT NULL,
  `actualQty` INT NULL,
  `variance` INT NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_counting_scheduleId` (`scheduleId`),
  INDEX `idx_counting_itemId` (`itemId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
