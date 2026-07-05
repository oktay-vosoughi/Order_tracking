-- ============================================================================
-- Configurable platform layer (companies, modules, roles, permissions, settings)
-- Date: 2026-07-05  Branch: feature/general-configurable-lims-platform
--
-- NOTE: server/index.js also applies this DDL idempotently at boot
-- (server/platform/schema.cjs), so running this file manually is OPTIONAL for
-- dev; it exists to document the change and for controlled production rollouts.
-- System role seeding (the 6 legacy roles + their permission sets) happens in
-- code at boot — see server/platform/schema.cjs seedSystemRoles().
--
-- Rollback (destructive — removes all platform config):
--   DROP TABLE IF EXISTS role_permissions, roles, company_modules,
--     company_settings, companies;
--   ALTER TABLE users DROP COLUMN companyId;
--   ALTER TABLE departments DROP COLUMN companyId;
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_companies_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_settings (
  companyId INT UNSIGNED NOT NULL,
  settingKey VARCHAR(100) NOT NULL,
  value JSON NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedBy VARCHAR(100) NULL,
  PRIMARY KEY (companyId, settingKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_modules (
  companyId INT UNSIGNED NOT NULL,
  moduleKey VARCHAR(50) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedBy VARCHAR(100) NULL,
  PRIMARY KEY (companyId, moduleKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  companyId INT UNSIGNED NOT NULL,
  roleKey VARCHAR(50) NOT NULL,
  displayName VARCHAR(150) NOT NULL,
  isSystem TINYINT(1) NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_roles_company_key (companyId, roleKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  roleId INT UNSIGNED NOT NULL,
  permissionKey VARCHAR(100) NOT NULL,
  PRIMARY KEY (roleId, permissionKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Identity roots get company scoping now; DEFAULT 1 = current deployment.
ALTER TABLE users ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE departments ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT 1;

INSERT INTO companies (id, name, slug) VALUES (1, 'Varsayılan Şirket', 'default')
  ON DUPLICATE KEY UPDATE id = id;
