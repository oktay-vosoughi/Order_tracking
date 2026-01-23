-- ============================================================
-- UNIFIED LOT-BASED INVENTORY SYSTEM
-- This migration integrates LOT tracking with purchases, distributions, and waste
-- ============================================================

USE `order_Tracking`;

-- ============================================================
-- 1. ITEM MASTER (item_definitions) - Already exists, add department if missing
-- ============================================================
-- Ensure department column exists in item_definitions
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'item_definitions' 
                   AND COLUMN_NAME = 'department');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE item_definitions ADD COLUMN department VARCHAR(100) NULL AFTER category',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 2. LOTS TABLE - Link to receipts/purchases
-- ============================================================
-- Add purchaseId and receiptId columns to lots table for traceability
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'lots' 
                   AND COLUMN_NAME = 'purchaseId');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE lots ADD COLUMN purchaseId VARCHAR(64) NULL AFTER itemId',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'lots' 
                   AND COLUMN_NAME = 'receiptId');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE lots ADD COLUMN receiptId VARCHAR(64) NULL AFTER purchaseId',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for purchaseId
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'lots' 
                   AND INDEX_NAME = 'idx_lot_purchaseId');
SET @sql = IF(@idx_exists = 0, 
              'ALTER TABLE lots ADD INDEX idx_lot_purchaseId (purchaseId)',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. ATTACHMENTS TABLE - Store all file attachments
-- ============================================================
CREATE TABLE IF NOT EXISTS `attachments` (
  `id` VARCHAR(64) NOT NULL,
  `entityType` VARCHAR(50) NOT NULL COMMENT 'lot, receipt, distribution, waste',
  `entityId` VARCHAR(64) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `fileType` VARCHAR(100) NULL,
  `fileSize` INT NULL,
  `fileData` LONGTEXT NULL COMMENT 'Base64 encoded file data',
  `fileUrl` TEXT NULL COMMENT 'External URL if not stored inline',
  `uploadedAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `uploadedBy` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_attachment_entity` (`entityType`, `entityId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. DISTRIBUTIONS TABLE - Make lot-traceable
-- ============================================================
-- Add lot tracking columns to distributions
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'distributions' 
                   AND COLUMN_NAME = 'lotId');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE distributions ADD COLUMN lotId VARCHAR(64) NULL AFTER itemId',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'distributions' 
                   AND COLUMN_NAME = 'lotNumber');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE distributions ADD COLUMN lotNumber VARCHAR(100) NULL AFTER lotId',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'distributions' 
                   AND COLUMN_NAME = 'useFefo');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE distributions ADD COLUMN useFefo TINYINT(1) DEFAULT 1 AFTER quantity',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'distributions' 
                   AND COLUMN_NAME = 'status');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE distributions ADD COLUMN status VARCHAR(50) DEFAULT ''PENDING'' AFTER quantity',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 5. WASTE_RECORDS TABLE - Make lot-traceable
-- ============================================================
-- Add lot tracking columns to waste_records
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'waste_records' 
                   AND COLUMN_NAME = 'lotId');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE waste_records ADD COLUMN lotId VARCHAR(64) NULL AFTER itemId',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'waste_records' 
                   AND COLUMN_NAME = 'lotNumber');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE waste_records ADD COLUMN lotNumber VARCHAR(100) NULL AFTER lotId',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. RECEIPTS TABLE - Link to lots and add attachments
-- ============================================================
-- Add attachmentUrl and attachmentName if not exists
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'receipts' 
                   AND COLUMN_NAME = 'attachmentUrl');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE receipts ADD COLUMN attachmentUrl LONGTEXT NULL AFTER invoiceNo',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'receipts' 
                   AND COLUMN_NAME = 'attachmentName');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE receipts ADD COLUMN attachmentName VARCHAR(255) NULL AFTER attachmentUrl',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add lotId to receipts for direct link
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'receipts' 
                   AND COLUMN_NAME = 'lotId');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE receipts ADD COLUMN lotId VARCHAR(64) NULL AFTER expiryDate',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 7. PURCHASES TABLE - Add department if missing
-- ============================================================
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'purchases' 
                   AND COLUMN_NAME = 'department');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE purchases ADD COLUMN department VARCHAR(100) NULL AFTER itemName',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 8. DISTRIBUTION_LOTS - Track which lots were used in distribution
-- ============================================================
CREATE TABLE IF NOT EXISTS `distribution_lots` (
  `id` VARCHAR(64) NOT NULL,
  `distributionId` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NOT NULL,
  `lotNumber` VARCHAR(100) NULL,
  `quantityUsed` INT NOT NULL,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_distlot_distribution` (`distributionId`),
  INDEX `idx_distlot_lot` (`lotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. ITEMS TABLE - Add department column if missing
-- ============================================================
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'items' 
                   AND COLUMN_NAME = 'department');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE items ADD COLUMN department VARCHAR(100) NULL AFTER category',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 10. Add receivedBy to usage_records if not exists
-- ============================================================
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'usage_records' 
                   AND COLUMN_NAME = 'receivedBy');
SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE usage_records ADD COLUMN receivedBy VARCHAR(255) NULL AFTER usedBy',
              'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- VIEWS FOR REPORTING
-- ============================================================

-- Drop existing view if exists and recreate
DROP VIEW IF EXISTS `v_item_stock_summary`;
CREATE VIEW `v_item_stock_summary` AS
SELECT 
  id.id,
  id.code,
  id.name,
  id.category,
  id.department,
  id.unit,
  id.minStock,
  id.supplier,
  id.brand,
  id.storageLocation,
  id.storageTemp,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.currentQuantity ELSE 0 END), 0) AS totalStock,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) AS availableStock,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate < CURDATE() THEN l.currentQuantity ELSE 0 END), 0) AS expiredStock,
  COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.id END) AS activeLotCount,
  MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate >= CURDATE() THEN l.expiryDate END) AS nearestExpiry,
  CASE 
    WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) = 0 THEN 'STOK_YOK'
    WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) < id.minStock THEN 'SATIN_AL'
    WHEN MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.expiryDate END) <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'SKT_YAKIN'
    WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate < CURDATE() THEN l.currentQuantity ELSE 0 END), 0) > 0 THEN 'SKT_GECMIS'
    ELSE 'STOKTA'
  END AS stockStatus
FROM item_definitions id
LEFT JOIN lots l ON id.id = l.itemId
WHERE id.status = 'ACTIVE'
GROUP BY id.id;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
