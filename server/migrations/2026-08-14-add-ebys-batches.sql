-- Groups purchase lines that were exported together to EBYS. Requires MySQL 8.0.29+.
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
  ADD COLUMN IF NOT EXISTS ebysBatchId VARCHAR(64) NULL AFTER requestNumber,
  ADD COLUMN IF NOT EXISTS ebysReference VARCHAR(100) NULL AFTER ebysBatchId;
