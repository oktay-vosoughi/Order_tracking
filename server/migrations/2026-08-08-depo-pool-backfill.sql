-- Migration: 2026-08-08-depo-pool-backfill.sql
-- Every department works like its own lab with its own physical stock —
-- SİTOGENETİK, Moleküler Genetik, Moleküler Mikro, Numune Kabul, etc. each get
-- their own depo pool. `lots.department` already exists but has been unused
-- (NULL) for every real lot to date. This backfills only the UNAMBIGUOUS case:
-- a lot whose item belongs to exactly one department (not global, no other
-- department tagged) must already be physically sitting in that department's
-- room, even though nothing recorded that until now. Shared/global items'
-- existing NULL lots are left untouched — they stay in the catch-all
-- UNASSIGNED pool; department-specific batches of shared items only get
-- separated going forward, at receive time (see server/index.js
-- POST /api/receive-goods).
--
-- Design: server/depoGroup.cjs (resolveDepoGroup / buildLotPoolFilter)
--
-- IDEMPOTENT: matches 0 rows on re-run once department is set (deploy.sh
-- re-runs every migration on each deploy).

UPDATE lots l
JOIN item_definitions id ON id.id = l.itemId
SET l.department = id.department
WHERE l.department IS NULL
  AND id.isGlobal = 0
  AND id.department IS NOT NULL AND id.department <> ''
  AND NOT EXISTS (
    SELECT 1 FROM item_departments idp
    WHERE idp.itemDefinitionId = id.id AND idp.department <> id.department
  );

-- Index guard (MySQL has no CREATE INDEX IF NOT EXISTS in all versions used here).
SET @idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lots' AND INDEX_NAME = 'idx_lots_department'
);
SET @ddl := IF(@idx = 0, 'CREATE INDEX idx_lots_department ON lots (department)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ROLLBACK: DROP INDEX idx_lots_department ON lots;
-- The backfilled `department` values are not mechanically reversible (there is
-- no record of which NULL rows were touched) — restore from a pre-migration
-- backup if this needs to be undone.
