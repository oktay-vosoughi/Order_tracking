// Platform schema bootstrap — creates/updates the configuration tables idempotently
// at server start, mirroring the existing ensureUsersTable pattern. This means an
// un-migrated database self-heals on boot; the SQL is also documented in
// server/migrations/2026-07-05-configurable-platform.sql for manual/production runs.

const {
  SYSTEM_ROLES,
  DEFAULT_COMPANY_ID
} = require('./registry.cjs');

const ensurePlatformSchema = async (pool) => {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS companies (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(200) NOT NULL,
      slug VARCHAR(100) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_companies_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS company_settings (
      companyId INT UNSIGNED NOT NULL,
      settingKey VARCHAR(100) NOT NULL,
      value JSON NOT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updatedBy VARCHAR(100) NULL,
      PRIMARY KEY (companyId, settingKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS company_modules (
      companyId INT UNSIGNED NOT NULL,
      moduleKey VARCHAR(50) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updatedBy VARCHAR(100) NULL,
      PRIMARY KEY (companyId, moduleKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS roles (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      companyId INT UNSIGNED NOT NULL,
      roleKey VARCHAR(50) NOT NULL,
      displayName VARCHAR(150) NOT NULL,
      isSystem TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_roles_company_key (companyId, roleKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS role_permissions (
      roleId INT UNSIGNED NOT NULL,
      permissionKey VARCHAR(100) NOT NULL,
      PRIMARY KEY (roleId, permissionKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  );

  // Self-heal the departments registry: some older production databases never
  // received the 2026-07-01 CEP DEPO migration that first created this table.
  // Creating it here (idempotently) removes that migration-order dependency and
  // keeps the /api/departments routes working on any database.
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS departments (
      id VARCHAR(64) NOT NULL,
      name VARCHAR(150) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      companyId INT UNSIGNED NOT NULL DEFAULT ${DEFAULT_COMPANY_ID},
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_department_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  );

  // Company scoping on identity roots. DEFAULT 1 backfills existing rows to the
  // default company, so single-company deployments keep working untouched.
  await pool.execute(`ALTER TABLE users ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT ${DEFAULT_COMPANY_ID}`).catch(() => {});
  await pool.execute(`ALTER TABLE departments ADD COLUMN companyId INT UNSIGNED NOT NULL DEFAULT ${DEFAULT_COMPANY_ID}`).catch(() => {});
  // users.department is read by the CEP DEPO flow and sanitizeUser; older schemas lack it.
  await pool.execute('ALTER TABLE users ADD COLUMN department VARCHAR(150) NULL').catch(() => {});

  // Ensure the default company row exists (id 1 = the current deployment).
  await pool.execute(
    `INSERT INTO companies (id, name, slug) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [DEFAULT_COMPANY_ID, 'Varsayılan Şirket', 'default']
  );

  await seedSystemRoles(pool, DEFAULT_COMPANY_ID);
};

// Seed the six legacy roles (with their exact pre-platform permission sets) for a
// company that has no roles yet. Also used when a new company is created.
// Existing roles are never overwritten — admins may have customized them.
// `platform.companies` (cross-company administration) is granted ONLY to the
// default company's ADMIN — tenant admins must never manage other companies.
const seedSystemRoles = async (pool, companyId) => {
  const [existing] = await pool.query('SELECT roleKey FROM roles WHERE companyId = ?', [companyId]);
  const existingKeys = new Set(existing.map((r) => r.roleKey));
  const isPlatformCompany = Number(companyId) === DEFAULT_COMPANY_ID;

  for (const role of SYSTEM_ROLES) {
    if (existingKeys.has(role.key)) continue;
    const [result] = await pool.execute(
      'INSERT INTO roles (companyId, roleKey, displayName, isSystem) VALUES (?, ?, ?, 1)',
      [companyId, role.key, role.name]
    );
    const roleId = result.insertId;
    const permissions = role.permissions.filter(
      (p) => p !== 'platform.companies' || isPlatformCompany
    );
    for (const perm of permissions) {
      await pool.execute(
        'INSERT IGNORE INTO role_permissions (roleId, permissionKey) VALUES (?, ?)',
        [roleId, perm]
      );
    }
  }
};

module.exports = { ensurePlatformSchema, seedSystemRoles };
