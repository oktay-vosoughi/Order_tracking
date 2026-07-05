-- ============================================================================
-- PHASE 2 — Multi-company data isolation (apply BEFORE onboarding a 2nd company)
-- Date: 2026-07-05  Branch: feature/general-configurable-lims-platform
--
-- ⚠ DO NOT run automatically. This changes UNIQUE keys on production data.
--   Take a full backup first. Apply during a maintenance window.
--
-- What it does:
--   1. Adds companyId to every data table, backfilled to 1 (default company).
--   2. Converts globally-unique keys into per-company composite keys.
--
-- After applying, the corresponding query-scoping sweep in server/index.js must
-- filter root entities by companyId (items, purchases, distributions, waste,
-- counting, cep_depo_*, stock_movements). Child tables (lots, receipts,
-- distribution_lots, usage_records, lot_adjustments, counting_records,
-- cep_depo_distribution_lots) inherit scope through their parent FK joins but
-- carry the column for direct filtering and future integrity checks.
-- See docs/13-configurable-platform-design.md §2.5.
--
-- Rollback: drop the composite keys, restore the original UNIQUE keys, and
-- drop the companyId columns (reverse order of this file).
-- ============================================================================

ALTER TABLE item_definitions        ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE lots                    ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE purchases               ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE receipts                ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE distributions           ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE distribution_lots       ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE usage_records           ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE lot_adjustments         ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE waste_records           ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE counting_schedules      ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE counting_records        ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE attachments             ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE audit_log               ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE cep_depo_balances       ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE cep_depo_distributions  ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE cep_depo_distribution_lots ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE cep_depo_consumptions   ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE stock_movements         ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;

-- Globally-unique keys become per-company composite keys.
ALTER TABLE users DROP INDEX uniq_users_username;
ALTER TABLE users ADD UNIQUE KEY uniq_users_company_username (companyId, username);

ALTER TABLE item_definitions DROP INDEX uniq_item_code;
ALTER TABLE item_definitions ADD UNIQUE KEY uniq_item_company_code (companyId, code);

ALTER TABLE purchases DROP INDEX uniq_request_number;
ALTER TABLE purchases ADD UNIQUE KEY uniq_purchase_company_reqno (companyId, requestNumber);

ALTER TABLE departments DROP INDEX uniq_department_name;
ALTER TABLE departments ADD UNIQUE KEY uniq_department_company_name (companyId, name);

-- Partition-pruning indexes on the root entities.
CREATE INDEX idx_items_company     ON item_definitions (companyId);
CREATE INDEX idx_purchases_company ON purchases (companyId);
CREATE INDEX idx_dists_company     ON distributions (companyId);
CREATE INDEX idx_waste_company     ON waste_records (companyId);
CREATE INDEX idx_cepbal_company    ON cep_depo_balances (companyId);
CREATE INDEX idx_sm_company        ON stock_movements (companyId);
