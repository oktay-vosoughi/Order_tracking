-- Apply only to a database containing all four products, with warehouse
-- quantities already measured in boxes. A failed preflight aborts before writes.
-- Run from server/: node run-migration.js 2026_10_01_mx24l_artus_units.sql
CREATE TEMPORARY TABLE unit_fix_targets_20261001 (
  id VARCHAR(64) PRIMARY KEY,
  product VARCHAR(16) NOT NULL
);

INSERT INTO unit_fix_targets_20261001 (id, product)
SELECT id, CASE
  WHEN LOWER(code) = LOWER('BS-SY-MX24L-100-30RxN')
    OR LOWER(catalogNo) = LOWER('BS-SY-MX24L-100-30RxN') THEN 'MX24L'
  WHEN LOWER(name) REGEXP '(^|[^a-z0-9])ebv([^a-z0-9]|$)' THEN 'EBV'
  WHEN LOWER(name) REGEXP '(^|[^a-z0-9])bk([^a-z0-9]|$)' THEN 'BK'
  ELSE 'CMV'
END
FROM item_definitions
WHERE status = 'ACTIVE' AND (
  LOWER(code) = LOWER('BS-SY-MX24L-100-30RxN')
  OR LOWER(catalogNo) = LOWER('BS-SY-MX24L-100-30RxN')
  OR (LOWER(name) REGEXP '(^|[^a-z0-9])artus([^a-z0-9]|$)'
    AND LOWER(name) REGEXP '(^|[^a-z0-9])(ebv|bk|cmv)([^a-z0-9]|$)')
);

-- CHECK failures are deliberate: missing/duplicate products or ambiguous
-- stock units must be inspected, rather than silently relabelled.
CREATE TEMPORARY TABLE unit_fix_preflight_20261001 (
  checkName VARCHAR(64),
  valid INT NOT NULL CHECK (valid = 1)
);
INSERT INTO unit_fix_preflight_20261001
SELECT 'Exactly one record for each product',
  COUNT(*) = 4 AND COUNT(DISTINCT product) = 4
FROM unit_fix_targets_20261001;

-- Persistent backups are created outside the transaction because MySQL DDL
-- commits implicitly. INSERT IGNORE preserves the original pre-change values.
CREATE TABLE IF NOT EXISTS unit_fix_20261001_items LIKE item_definitions;
CREATE TABLE IF NOT EXISTS unit_fix_20261001_lots LIKE lots;
CREATE TABLE IF NOT EXISTS unit_fix_20261001_balances LIKE cep_depo_balances;

START TRANSACTION;
SELECT i.id FROM item_definitions i
JOIN unit_fix_targets_20261001 t ON t.id = i.id FOR UPDATE;
SELECT l.id FROM lots l
JOIN unit_fix_targets_20261001 t ON t.id = l.itemId FOR UPDATE;
SELECT b.id FROM cep_depo_balances b
JOIN unit_fix_targets_20261001 t ON t.id = b.itemId FOR UPDATE;

INSERT INTO unit_fix_preflight_20261001
SELECT 'Warehouse quantities must already be boxes',
  COUNT(*) = 0
FROM item_definitions i JOIN unit_fix_targets_20261001 t ON t.id = i.id
WHERE LOWER(TRIM(COALESCE(i.unit, ''))) NOT IN ('kutu', 'box');

-- MX24L existing sub-unit quantities can be preserved only when they
-- already mean 30 reactions per box. PACK balances convert from packQty.
INSERT INTO unit_fix_preflight_20261001
SELECT 'MX24L existing reaction balances must use factor 30', COUNT(*) = 0
FROM cep_depo_balances b
JOIN unit_fix_targets_20261001 t ON t.id = b.itemId
JOIN item_definitions i ON i.id = t.id
WHERE t.product = 'MX24L' AND (b.packQty > 0 OR b.unitQty > 0)
  AND COALESCE(i.consumptionUnitType, 'PACK') <> 'PACK'
  AND (COALESCE(i.unitsPerPackage, 0) <> 30
    OR LOWER(COALESCE(i.consumptionUnit, '')) NOT REGEXP 'reax|reaks|reaction|rxn');

INSERT IGNORE INTO unit_fix_20261001_items
SELECT i.* FROM item_definitions i JOIN unit_fix_targets_20261001 t ON t.id = i.id;
INSERT IGNORE INTO unit_fix_20261001_lots
SELECT l.* FROM lots l JOIN unit_fix_targets_20261001 t ON t.id = l.itemId;
INSERT IGNORE INTO unit_fix_20261001_balances
SELECT b.* FROM cep_depo_balances b JOIN unit_fix_targets_20261001 t ON t.id = b.itemId;

-- Preserve box balances and existing reaction consumption. Artus uses one
-- unit per box so stale reaction balances cannot influence box consumption.
UPDATE cep_depo_balances b
JOIN unit_fix_targets_20261001 t ON t.id = b.itemId
JOIN item_definitions i ON i.id = t.id
SET b.unitQty = CASE
    WHEN t.product <> 'MX24L' THEN b.packQty
    WHEN COALESCE(i.consumptionUnitType, 'PACK') = 'PACK' THEN b.packQty * 30
    ELSE b.unitQty
  END,
  b.consumptionUnitType = IF(t.product = 'MX24L', 'UNIT', 'PACK');

UPDATE lots l JOIN unit_fix_targets_20261001 t ON t.id = l.itemId
SET l.unitsPerPackage = IF(t.product = 'MX24L', 30, 1),
  l.consumptionUnitType = IF(t.product = 'MX24L', 'UNIT', 'PACK');

UPDATE item_definitions i JOIN unit_fix_targets_20261001 t ON t.id = i.id
SET i.unit = 'kutu', i.packageUnit = 'kutu',
  i.consumptionUnit = IF(t.product = 'MX24L', 'reax', NULL),
  i.unitsPerPackage = IF(t.product = 'MX24L', 30, 1),
  i.consumptionUnitType = IF(t.product = 'MX24L', 'UNIT', 'PACK');
COMMIT;

SELECT i.code, i.name, i.unit, i.packageUnit, i.consumptionUnit,
  i.unitsPerPackage, i.consumptionUnitType
FROM item_definitions i JOIN unit_fix_targets_20261001 t ON t.id = i.id;
DROP TEMPORARY TABLE unit_fix_preflight_20261001;
DROP TEMPORARY TABLE unit_fix_targets_20261001;
