-- Portable repair for servers where 2026-08-14-add-ebys-batches.sql could not
-- parse ADD COLUMN IF NOT EXISTS. Run through server/run-migration.js so an
-- already-existing column is safely skipped as ER_DUP_FIELDNAME.
CREATE TABLE IF NOT EXISTS ebys_batches (
  id VARCHAR(64) NOT NULL,
  ebysReference VARCHAR(100) NULL,
  createdBy VARCHAR(100) NULL,
  approvedBy VARCHAR(100) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approvedAt DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_ebys_batches_reference (ebysReference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE purchases
  ADD COLUMN ebysBatchId VARCHAR(64) NULL AFTER requestNumber;

ALTER TABLE purchases
  ADD COLUMN ebysReference VARCHAR(100) NULL AFTER ebysBatchId;
