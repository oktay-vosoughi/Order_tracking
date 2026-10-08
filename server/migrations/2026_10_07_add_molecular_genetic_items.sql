-- Adds three requested materials to Moleküler Genetik.
-- Safe to re-run: item codes and department memberships are inserted idempotently.
-- Stock remains zero because no LOT row is created.

CREATE TEMPORARY TABLE molecular_genetic_items_20261007_desired (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  minStock INT NOT NULL,
  ideal_stock DECIMAL(10,2) NOT NULL,
  max_stock DECIMAL(10,2) NOT NULL
);

INSERT INTO molecular_genetic_items_20261007_desired
  (code, name, brand, unit, minStock, ideal_stock, max_stock)
VALUES
  ('15230',
   'aRTegen BCR-ABL p230 rtPCR Kit (25rxn)',
   'Artegen', 'Kutu', 1, 2, 3),
  ('LB.IS.089.03.012P',
   'ISOLAB PCR Tüp Standı 96 Delikli, LB.IS.089.03.012P',
   'ISOLAB', 'Adet', 0, 0, 0),
  ('LB.IS.078.05.025',
   'ISOLAB Tüp - Santrifüj - Mikro - Kilitli Kapaklı - 5,0 ml - Steril, LB.IS.078.05.025',
   'ISOLAB', 'Adet', 0, 0, 0);

-- Preserve the first pre-change version of any already-existing target item.
CREATE TABLE IF NOT EXISTS molecular_genetic_items_20261007_item_backup LIKE item_definitions;
INSERT IGNORE INTO molecular_genetic_items_20261007_item_backup
SELECT i.*
FROM item_definitions i
JOIN molecular_genetic_items_20261007_desired d ON d.code = i.code;

-- Keep stable IDs for rows created by this migration, including repeat runs.
CREATE TABLE IF NOT EXISTS molecular_genetic_items_20261007_created (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO molecular_genetic_items_20261007_created (id, code)
SELECT UUID(), d.code
FROM molecular_genetic_items_20261007_desired d
LEFT JOIN item_definitions i ON i.code = d.code
WHERE i.id IS NULL;

-- Track only department memberships that did not exist before this migration.
-- This stays correct when the migration is run more than once.
CREATE TABLE IF NOT EXISTS molecular_genetic_items_20261007_department_added (
  itemDefinitionId VARCHAR(64) NOT NULL,
  department VARCHAR(150) NOT NULL,
  PRIMARY KEY (itemDefinitionId, department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO molecular_genetic_items_20261007_department_added
  (itemDefinitionId, department)
SELECT i.id, 'Moleküler Genetik'
FROM item_definitions i
JOIN molecular_genetic_items_20261007_desired d ON d.code = i.code
LEFT JOIN item_departments idp
  ON idp.itemDefinitionId = i.id AND idp.department = 'Moleküler Genetik'
WHERE idp.itemDefinitionId IS NULL;

START TRANSACTION;

INSERT INTO item_definitions
  (id, code, name, category, department, unit, minStock, ideal_stock,
   max_stock, supplier, catalogNo, brand, storageLocation, storageTemp,
   chemicalType, notes, packageUnit, consumptionUnit, unitsPerPackage,
   consumptionUnitType, status, createdBy)
SELECT
  c.id, d.code, d.name, '', 'Moleküler Genetik', d.unit, d.minStock,
  d.ideal_stock, d.max_stock, '', d.code, d.brand, '', '', '',
  '2026-10-07 Moleküler Genetik malzeme eklemesi', d.unit, NULL, 1,
  'PACK', 'ACTIVE', 'migration-2026-10-07'
FROM molecular_genetic_items_20261007_desired d
JOIN molecular_genetic_items_20261007_created c ON c.code = d.code
LEFT JOIN item_definitions i ON i.code = d.code
WHERE i.id IS NULL;

-- New items are also new department memberships. They do not exist at the
-- earlier membership snapshot point, so record them after item creation.
INSERT IGNORE INTO molecular_genetic_items_20261007_department_added
  (itemDefinitionId, department)
SELECT i.id, 'Moleküler Genetik'
FROM item_definitions i
JOIN molecular_genetic_items_20261007_created c ON c.id = i.id;

-- Apply the supplied master data and limits. For an existing shared item, keep
-- its legacy scalar department; membership is added below without touching LOTs.
UPDATE item_definitions i
JOIN molecular_genetic_items_20261007_desired d ON d.code = i.code
SET i.name = d.name,
    i.unit = d.unit,
    i.minStock = d.minStock,
    i.ideal_stock = d.ideal_stock,
    i.max_stock = d.max_stock,
    i.catalogNo = d.code,
    i.brand = d.brand,
    i.packageUnit = d.unit,
    i.consumptionUnit = NULL,
    i.unitsPerPackage = 1,
    i.consumptionUnitType = 'PACK',
    i.department = CASE
      WHEN i.department IS NULL OR TRIM(i.department) = '' THEN 'Moleküler Genetik'
      ELSE i.department
    END,
    i.status = 'ACTIVE',
    i.updatedBy = 'migration-2026-10-07';

INSERT IGNORE INTO item_departments (itemDefinitionId, department)
SELECT i.id, 'Moleküler Genetik'
FROM item_definitions i
JOIN molecular_genetic_items_20261007_desired d ON d.code = i.code;

COMMIT;

SELECT i.code, i.name, i.brand, i.unit, i.minStock, i.ideal_stock,
       i.max_stock, idp.department,
       COALESCE(SUM(CASE
         WHEN l.department = 'Moleküler Genetik' AND l.status = 'ACTIVE'
         THEN l.currentQuantity ELSE 0 END), 0) AS molecularGeneticStock
FROM item_definitions i
JOIN molecular_genetic_items_20261007_desired d ON d.code = i.code
JOIN item_departments idp
  ON idp.itemDefinitionId = i.id AND idp.department = 'Moleküler Genetik'
LEFT JOIN lots l ON l.itemId = i.id
GROUP BY i.id, i.code, i.name, i.brand, i.unit, i.minStock,
         i.ideal_stock, i.max_stock, idp.department
ORDER BY i.code;

DROP TEMPORARY TABLE molecular_genetic_items_20261007_desired;
