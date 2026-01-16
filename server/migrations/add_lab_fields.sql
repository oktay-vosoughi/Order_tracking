-- Migration to add laboratory-specific fields to existing items table
USE `order_Tracking`;

ALTER TABLE `items`
  ADD COLUMN IF NOT EXISTS `expiryDate` VARCHAR(40) NULL AFTER `status`,
  ADD COLUMN IF NOT EXISTS `openingDate` VARCHAR(40) NULL AFTER `expiryDate`,
  ADD COLUMN IF NOT EXISTS `storageTemp` VARCHAR(50) NULL AFTER `openingDate`,
  ADD COLUMN IF NOT EXISTS `chemicalType` VARCHAR(100) NULL AFTER `storageTemp`,
  ADD COLUMN IF NOT EXISTS `msdsUrl` TEXT NULL AFTER `chemicalType`,
  ADD COLUMN IF NOT EXISTS `wasteStatus` VARCHAR(50) NULL AFTER `msdsUrl`,
  ADD INDEX IF NOT EXISTS `idx_items_expiryDate` (`expiryDate`);

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
  INDEX `idx_waste_itemId` (`itemId`),
  CONSTRAINT `fk_waste_item`
    FOREIGN KEY (`itemId`) REFERENCES `items`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
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
  INDEX `idx_counting_itemId` (`itemId`),
  CONSTRAINT `fk_counting_schedule`
    FOREIGN KEY (`scheduleId`) REFERENCES `counting_schedules`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_counting_item`
    FOREIGN KEY (`itemId`) REFERENCES `items`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
