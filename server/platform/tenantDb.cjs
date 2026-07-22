// Tenant database support — optional dedicated MySQL database per company.
//
// Design (see docs/13-configurable-platform-design.md):
//  - companies.dbName NULL  → the company lives in the shared/central database
//    (legacy behavior, company 1 always does).
//  - companies.dbName set   → all BUSINESS data (items, lots, purchases, cep depo,
//    waste, receipts, …) lives in that database. IDENTITY and CONFIG stay central
//    (users, departments, companies, roles, role_permissions, company_settings,
//    company_modules): the tenant database gets simple cross-schema VIEWs onto the
//    central tables, so every existing query — including JOINs and inserts with an
//    explicit companyId — keeps working unchanged against the tenant pool.
//
// Provisioning NEVER adopts a pre-existing database: this MySQL server hosts other
// production schemas, so an already-existing name is always refused.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const CANONICAL_DUMP = path.join(__dirname, '..', 'database', 'order_tracking_full_dump.sql');

// Identity/config tables that stay in the central DB and become views in tenant DBs.
const CENTRAL_VIEW_TABLES = [
  'users',
  'departments',
  'companies',
  'roles',
  'role_permissions',
  'company_settings',
  'company_modules'
];

const RESERVED_DB_NAMES = new Set(['mysql', 'sys', 'information_schema', 'performance_schema']);

const DB_NAME_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

const isSafeDbName = (name, centralDbName) => {
  const n = String(name || '').toLowerCase();
  if (!DB_NAME_PATTERN.test(n)) return false;
  if (RESERVED_DB_NAMES.has(n)) return false;
  if (centralDbName && n === String(centralDbName).toLowerCase()) return false;
  return true;
};

// Default database name suggested for a company slug: lims_<slug> with `-` → `_`.
const deriveDbName = (slug) =>
  `lims_${String(slug || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

// Extract only the DROP TABLE / CREATE TABLE statements from the canonical
// structure dump, excluding identity tables (they become views). The dump is
// structure-only (no INSERTs) and contains no semicolons inside definitions.
const readBusinessTableStatements = () => {
  const raw = fs.readFileSync(CANONICAL_DUMP, 'utf8');
  const statements = raw
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => /^(DROP TABLE|CREATE TABLE)/i.test(s));
  return statements.filter((s) => {
    const m = s.match(/(?:DROP TABLE IF EXISTS|CREATE TABLE)\s+`?([A-Za-z0-9_]+)`?/i);
    return m && !CENTRAL_VIEW_TABLES.includes(m[1].toLowerCase());
  });
};

// Create and initialize a brand-new tenant database. Throws:
//  - INVALID_DB_NAME  — name fails validation
//  - DB_EXISTS        — a database with that name already exists on the server
const provisionTenantDatabase = async ({ centralPool, centralDbName, mysqlConfig, dbName }) => {
  const name = String(dbName || '').toLowerCase();
  if (!isSafeDbName(name, centralDbName)) {
    const err = new Error(`Invalid database name: ${dbName}`);
    err.code = 'INVALID_DB_NAME';
    throw err;
  }
  const [existing] = await centralPool.query('SHOW DATABASES LIKE ?', [name]);
  if (existing.length) {
    const err = new Error(`Database already exists: ${name}`);
    err.code = 'DB_EXISTS';
    throw err;
  }

  await centralPool.query(
    `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  // Dedicated (non-pooled) connection with the tenant DB as default schema, so the
  // unqualified CREATE TABLE statements from the dump land in the right database.
  const conn = await mysql.createConnection({ ...mysqlConfig, database: name });
  try {
    // The dump lists tables alphabetically, so FK parents may not exist yet —
    // same as mysqldump's own SET FOREIGN_KEY_CHECKS=0 header.
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const stmt of readBusinessTableStatements()) {
      await conn.query(stmt);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    for (const table of CENTRAL_VIEW_TABLES) {
      await conn.query(
        `CREATE OR REPLACE VIEW \`${name}\`.\`${table}\` AS SELECT * FROM \`${centralDbName}\`.\`${table}\``
      );
    }
  } catch (error) {
    // Leave no half-provisioned database behind — we created it above, so drop it.
    await centralPool.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
    throw error;
  } finally {
    await conn.end().catch(() => {});
  }
  return name;
};

// Per-request routing: resolves the effective pool for a company. The
// companyId → dbName map is cached briefly; company creation invalidates it.
const createTenantPoolRouter = ({ centralPool, centralDbName, mysqlConfig }) => {
  const pools = new Map(); // dbName -> Pool
  let dbNameByCompany = new Map();
  let loadedAt = 0;
  const TTL_MS = 30 * 1000;

  const poolForDbName = (dbName) => {
    let p = pools.get(dbName);
    if (!p) {
      p = mysql.createPool({
        ...mysqlConfig,
        database: dbName,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
      });
      pools.set(dbName, p);
    }
    return p;
  };

  const refresh = async () => {
    const [rows] = await centralPool.query('SELECT id, dbName FROM companies');
    const map = new Map();
    for (const row of rows) {
      if (row.dbName && isSafeDbName(row.dbName, centralDbName)) {
        map.set(Number(row.id), String(row.dbName));
      }
    }
    dbNameByCompany = map;
    loadedAt = Date.now();
  };

  const getDbForCompany = async (companyId) => {
    const id = Number(companyId);
    if (!id) return centralPool;
    if (Date.now() - loadedAt > TTL_MS) {
      // Resilience: if companies/dbName is unreadable (un-migrated DB), keep the
      // last known map — routing degrades to the central DB, never to an error.
      await refresh().catch(() => { loadedAt = Date.now(); });
    }
    const dbName = dbNameByCompany.get(id);
    return dbName ? poolForDbName(dbName) : centralPool;
  };

  const listTenantDbNames = async () => {
    await refresh().catch(() => {});
    return [...new Set(dbNameByCompany.values())];
  };

  const invalidate = () => { loadedAt = 0; };

  return { getDbForCompany, poolForDbName, listTenantDbNames, invalidate };
};

module.exports = {
  isSafeDbName,
  deriveDbName,
  provisionTenantDatabase,
  createTenantPoolRouter,
  CENTRAL_VIEW_TABLES
};
