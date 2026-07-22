-- Per-company dedicated database support (2026-07-06)
-- The server also applies this idempotently at boot (server/platform/schema.cjs);
-- this file documents the change for manual/production runs.
--
-- companies.dbName:
--   NULL  -> company lives in the shared central database (legacy behavior)
--   set   -> business data lives in that MySQL database; identity/config tables
--            (users, departments, companies, roles, role_permissions,
--            company_settings, company_modules) remain central and are exposed
--            to the tenant database through cross-schema views.
--
-- Tenant databases are provisioned ONLY through POST /api/admin/companies with
-- createDatabase=true — never point dbName at a pre-existing database by hand.

ALTER TABLE companies ADD COLUMN dbName VARCHAR(64) NULL;
