-- Canonical department cleanup.
--
-- The only department names after this migration are:
--   Moleküler Genetik, Moleküler Mikro, SİTOGENETİK, Numune Kabul
--
-- Business rows are preserved. Recognized spelling variants are merged into a
-- canonical department. Unknown department links are cleared (nullable scalar
-- columns) or removed (membership tables). CEP balances are summed before old
-- department rows are removed so stock is not lost on a name collision.

START TRANSACTION;

-- CEP DEPO has a unique key on (department, itemId). Merge renamed pools first.
INSERT INTO cep_depo_balances
  (id, itemId, packQty, unitQty, status, createdAt, updatedAt,
   lastDistributedAt, lastDistributionId, consumptionUnitType, department)
SELECT
  LOWER(REPLACE(UUID(), '-', '')),
  itemId,
  SUM(packQty),
  SUM(unitQty),
  CASE WHEN SUM(packQty) > 0 OR SUM(unitQty) > 0 THEN 'ACTIVE' ELSE 'ZERO' END,
  MIN(createdAt),
  MAX(updatedAt),
  MAX(lastDistributedAt),
  MAX(lastDistributionId),
  MAX(consumptionUnitType),
  CASE
    WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
      OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
      OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular')
      THEN 'Moleküler Genetik'
    WHEN LOWER(TRIM(department)) LIKE '%mikro%'
      OR LOWER(TRIM(department)) LIKE '%micro%'
      THEN 'Moleküler Mikro'
    WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%'
      OR LOWER(TRIM(department)) LIKE '%cytogenetic%'
      THEN 'SİTOGENETİK'
    WHEN LOWER(TRIM(department)) LIKE 'numune kabul%'
      OR LOWER(TRIM(department)) LIKE 'sample accept%'
      THEN 'Numune Kabul'
  END AS canonicalDepartment
FROM cep_depo_balances
WHERE BINARY department NOT IN
  (BINARY 'Moleküler Genetik', BINARY 'Moleküler Mikro', BINARY 'SİTOGENETİK', BINARY 'Numune Kabul')
  AND (
    LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular')
    OR LOWER(TRIM(department)) LIKE '%mikro%'
    OR LOWER(TRIM(department)) LIKE '%micro%'
    OR LOWER(TRIM(department)) LIKE '%sitogenetik%'
    OR LOWER(TRIM(department)) LIKE '%cytogenetic%'
    OR LOWER(TRIM(department)) LIKE 'numune kabul%'
    OR LOWER(TRIM(department)) LIKE 'sample accept%'
  )
GROUP BY canonicalDepartment, itemId
ON DUPLICATE KEY UPDATE
  packQty = cep_depo_balances.packQty + VALUES(packQty),
  unitQty = cep_depo_balances.unitQty + VALUES(unitQty),
  createdAt = LEAST(cep_depo_balances.createdAt, VALUES(createdAt)),
  updatedAt = GREATEST(cep_depo_balances.updatedAt, VALUES(updatedAt)),
  lastDistributedAt = GREATEST(cep_depo_balances.lastDistributedAt, VALUES(lastDistributedAt)),
  lastDistributionId = COALESCE(VALUES(lastDistributionId), cep_depo_balances.lastDistributionId),
  consumptionUnitType = COALESCE(VALUES(consumptionUnitType), cep_depo_balances.consumptionUnitType);

DELETE FROM cep_depo_balances
WHERE BINARY department NOT IN
  (BINARY 'Moleküler Genetik', BINARY 'Moleküler Mikro', BINARY 'SİTOGENETİK', BINARY 'Numune Kabul');

UPDATE cep_depo_balances
SET status = CASE WHEN packQty > 0 OR unitQty > 0 THEN 'ACTIVE' ELSE 'ZERO' END;

-- Merge membership rows without colliding with their composite primary keys.
INSERT IGNORE INTO user_departments (userId, department, createdAt)
SELECT
  userId,
  CASE
    WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
      OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
      OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular')
      THEN 'Moleküler Genetik'
    WHEN LOWER(TRIM(department)) LIKE '%mikro%'
      OR LOWER(TRIM(department)) LIKE '%micro%'
      THEN 'Moleküler Mikro'
    WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%'
      OR LOWER(TRIM(department)) LIKE '%cytogenetic%'
      THEN 'SİTOGENETİK'
    WHEN LOWER(TRIM(department)) LIKE 'numune kabul%'
      OR LOWER(TRIM(department)) LIKE 'sample accept%'
      THEN 'Numune Kabul'
  END,
  createdAt
FROM user_departments
WHERE
  LOWER(TRIM(department)) LIKE '%molek%genetik%'
  OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
  OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular')
  OR LOWER(TRIM(department)) LIKE '%mikro%'
  OR LOWER(TRIM(department)) LIKE '%micro%'
  OR LOWER(TRIM(department)) LIKE '%sitogenetik%'
  OR LOWER(TRIM(department)) LIKE '%cytogenetic%'
  OR LOWER(TRIM(department)) LIKE 'numune kabul%'
  OR LOWER(TRIM(department)) LIKE 'sample accept%';

DELETE FROM user_departments
WHERE BINARY department NOT IN
  (BINARY 'Moleküler Genetik', BINARY 'Moleküler Mikro', BINARY 'SİTOGENETİK', BINARY 'Numune Kabul');

INSERT IGNORE INTO item_departments (itemDefinitionId, department, createdAt)
SELECT
  itemDefinitionId,
  CASE
    WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
      OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
      OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular')
      THEN 'Moleküler Genetik'
    WHEN LOWER(TRIM(department)) LIKE '%mikro%'
      OR LOWER(TRIM(department)) LIKE '%micro%'
      THEN 'Moleküler Mikro'
    WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%'
      OR LOWER(TRIM(department)) LIKE '%cytogenetic%'
      THEN 'SİTOGENETİK'
    WHEN LOWER(TRIM(department)) LIKE 'numune kabul%'
      OR LOWER(TRIM(department)) LIKE 'sample accept%'
      THEN 'Numune Kabul'
  END,
  createdAt
FROM item_departments
WHERE
  LOWER(TRIM(department)) LIKE '%molek%genetik%'
  OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
  OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular')
  OR LOWER(TRIM(department)) LIKE '%mikro%'
  OR LOWER(TRIM(department)) LIKE '%micro%'
  OR LOWER(TRIM(department)) LIKE '%sitogenetik%'
  OR LOWER(TRIM(department)) LIKE '%cytogenetic%'
  OR LOWER(TRIM(department)) LIKE 'numune kabul%'
  OR LOWER(TRIM(department)) LIKE 'sample accept%';

DELETE FROM item_departments
WHERE BINARY department NOT IN
  (BINARY 'Moleküler Genetik', BINARY 'Moleküler Mikro', BINARY 'SİTOGENETİK', BINARY 'Numune Kabul');

-- Normalize all nullable scalar/history references. Unknown names become NULL;
-- the business records themselves remain intact.
UPDATE users
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

UPDATE item_definitions
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

UPDATE lots
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

UPDATE purchases
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

UPDATE distributions
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

UPDATE usage_records
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

UPDATE stock_movements
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

UPDATE cep_depo_consumptions
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

UPDATE cep_depo_distributions
SET department = CASE
  WHEN LOWER(TRIM(department)) LIKE '%molek%genetik%'
    OR LOWER(TRIM(department)) LIKE '%molecular%genetic%'
    OR LOWER(TRIM(department)) IN ('moleküler', 'molekuler', 'molecular') THEN 'Moleküler Genetik'
  WHEN LOWER(TRIM(department)) LIKE '%mikro%' OR LOWER(TRIM(department)) LIKE '%micro%' THEN 'Moleküler Mikro'
  WHEN LOWER(TRIM(department)) LIKE '%sitogenetik%' OR LOWER(TRIM(department)) LIKE '%cytogenetic%' THEN 'SİTOGENETİK'
  WHEN LOWER(TRIM(department)) LIKE 'numune kabul%' OR LOWER(TRIM(department)) LIKE 'sample accept%' THEN 'Numune Kabul'
  ELSE NULL
END;

-- Rebuild the registry last so exact casing and Turkish characters are guaranteed.
-- The binary comparison removes differently-cased/accented spellings while a
-- second run preserves the already-canonical rows and their stable IDs.
DELETE FROM departments
WHERE BINARY name NOT IN
  (BINARY 'Moleküler Genetik', BINARY 'Moleküler Mikro', BINARY 'SİTOGENETİK', BINARY 'Numune Kabul');

INSERT IGNORE INTO departments (id, name, active) VALUES
  (LOWER(REPLACE(UUID(), '-', '')), 'Moleküler Genetik', 1),
  (LOWER(REPLACE(UUID(), '-', '')), 'Moleküler Mikro', 1),
  (LOWER(REPLACE(UUID(), '-', '')), 'SİTOGENETİK', 1),
  (LOWER(REPLACE(UUID(), '-', '')), 'Numune Kabul', 1);

UPDATE departments SET active = 1;

COMMIT;

-- Rollback: this consolidation is intentionally not reversible because spelling
-- variants and removed invalid links cannot be inferred. Restore a pre-migration
-- database backup if the original department values are required.
