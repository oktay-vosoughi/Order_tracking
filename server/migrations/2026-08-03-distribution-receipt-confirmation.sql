-- 2026-08-03  Barcode distribution: two-step receipt confirmation (toggleable)
--
-- Adds:
--   * app_settings — a simple key/value feature-flag store, seeded with
--     dist_receipt_confirmation = '0' (feature OFF by default).
--   * cep_depo_distributions.receivedConfirmedAt / receivedConfirmedBy — the
--     recipient technician's receipt acknowledgement. NULL = awaiting confirm.
--
-- All of this is ALSO ensured idempotently at server boot in
-- ensureCepDepoTables() (server/index.js), so a fresh install does not need to
-- run this file manually. It exists for documentation and for DBs that are
-- migrated out-of-band.

CREATE TABLE IF NOT EXISTS app_settings (
  settingKey   VARCHAR(100) NOT NULL PRIMARY KEY,
  settingValue TEXT NULL,
  updatedBy    VARCHAR(100) NULL,
  updatedAt    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_settings (settingKey, settingValue) VALUES ('dist_receipt_confirmation', '0');

-- NOTE: MySQL < 8.0.29 has no "ADD COLUMN IF NOT EXISTS". If these columns
-- already exist (they are created at boot), skip the two statements below —
-- they will error with "Duplicate column name", which is safe to ignore.
ALTER TABLE cep_depo_distributions ADD COLUMN receivedConfirmedAt DATETIME NULL;
ALTER TABLE cep_depo_distributions ADD COLUMN receivedConfirmedBy VARCHAR(100) NULL;

-- One-time backfill: existing rows predate the feature — treat them as already
-- confirmed so enabling the toggle later does not resurface historical
-- distributions as "awaiting confirmation". The marker makes it safe to re-run.
UPDATE cep_depo_distributions
   SET receivedConfirmedAt = distributedAt, receivedConfirmedBy = distributedBy
 WHERE receivedConfirmedAt IS NULL
   AND NOT EXISTS (SELECT 1 FROM app_settings WHERE settingKey = 'dist_confirmation_backfilled');
INSERT IGNORE INTO app_settings (settingKey, settingValue) VALUES ('dist_confirmation_backfilled', '1');
