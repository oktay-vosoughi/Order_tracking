// Config service — loads and caches per-company effective configuration.
//
// Effective config = code-defined defaults (registry.cjs) overlaid with the company's
// rows in company_settings / company_modules / roles / role_permissions.
// The cache is invalidated whenever an admin config route writes.
//
// Resilience rule: if the config tables are missing or unreadable (e.g. an un-migrated
// database), every getter falls back to the code defaults — the legacy behavior — so
// the platform layer can never brick authentication or authorization.

const {
  MODULES,
  PERMISSIONS,
  SYSTEM_ROLES,
  DEFAULT_TERMINOLOGY,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_FIELD_CONFIG,
  DEFAULT_COMPANY_ID
} = require('./registry.cjs');

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // companyId -> { config, loadedAt }

const LEGACY_ROLE_PERMISSIONS = SYSTEM_ROLES.reduce((acc, r) => {
  acc[r.key] = new Set(r.permissions);
  return acc;
}, {});

const parseJson = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value; // mysql2 parses JSON columns
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

// Shallow-per-field merge for field configs: unknown fields from DB are kept
// (forward compatibility), known fields get defaults for missing properties.
const mergeFieldConfig = (defaults, override) => {
  const merged = {};
  for (const formKey of new Set([...Object.keys(defaults), ...Object.keys(override || {})])) {
    merged[formKey] = {};
    const defForm = defaults[formKey] || {};
    const ovrForm = (override || {})[formKey] || {};
    for (const fieldKey of new Set([...Object.keys(defForm), ...Object.keys(ovrForm)])) {
      merged[formKey][fieldKey] = { ...(defForm[fieldKey] || {}), ...(ovrForm[fieldKey] || {}) };
    }
  }
  return merged;
};

const loadCompanyConfig = async (pool, companyId) => {
  const [companyRows] = await pool.query('SELECT * FROM companies WHERE id = ?', [companyId]);
  const company = companyRows[0] || { id: companyId, name: 'Varsayılan Şirket', slug: 'default', active: 1 };

  const [settingRows] = await pool.query(
    'SELECT settingKey, value FROM company_settings WHERE companyId = ?', [companyId]
  );
  const settings = {};
  for (const row of settingRows) settings[row.settingKey] = parseJson(row.value, {});

  const [moduleRows] = await pool.query(
    'SELECT moduleKey, enabled FROM company_modules WHERE companyId = ?', [companyId]
  );
  const moduleOverrides = {};
  for (const row of moduleRows) moduleOverrides[row.moduleKey] = row.enabled === 1;

  const modules = MODULES.map((m) => ({
    ...m,
    enabled: m.core ? true : (moduleOverrides[m.key] !== undefined ? moduleOverrides[m.key] : m.defaultEnabled)
  }));

  const [roleRows] = await pool.query(
    `SELECT r.id, r.roleKey, r.displayName, r.isSystem, rp.permissionKey
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.roleId = r.id
     WHERE r.companyId = ?
     ORDER BY r.isSystem DESC, r.id ASC`,
    [companyId]
  );
  const rolesByKey = {};
  for (const row of roleRows) {
    if (!rolesByKey[row.roleKey]) {
      rolesByKey[row.roleKey] = {
        id: row.id,
        key: row.roleKey,
        name: row.displayName,
        isSystem: row.isSystem === 1,
        permissions: []
      };
    }
    if (row.permissionKey) rolesByKey[row.roleKey].permissions.push(row.permissionKey);
  }

  return {
    company: { id: company.id, name: company.name, slug: company.slug, active: company.active === 1 },
    modules,
    terminology: { ...DEFAULT_TERMINOLOGY, ...(settings.terminology || {}) },
    general: { ...DEFAULT_GENERAL_SETTINGS, ...(settings.general || {}) },
    fieldConfig: mergeFieldConfig(DEFAULT_FIELD_CONFIG, settings.fieldConfig || {}),
    customFields: settings.customFields || {},
    options: settings.options || {},
    roles: Object.values(rolesByKey)
  };
};

const buildFallbackConfig = (companyId) => ({
  company: { id: companyId, name: 'Varsayılan Şirket', slug: 'default', active: true },
  modules: MODULES.map((m) => ({ ...m, enabled: m.defaultEnabled })),
  terminology: { ...DEFAULT_TERMINOLOGY },
  general: { ...DEFAULT_GENERAL_SETTINGS },
  fieldConfig: mergeFieldConfig(DEFAULT_FIELD_CONFIG, {}),
  customFields: {},
  options: {},
  roles: SYSTEM_ROLES.map((r) => ({ id: null, key: r.key, name: r.name, isSystem: true, permissions: [...r.permissions] })),
  _fallback: true
});

const getCompanyConfig = async (pool, companyId) => {
  const id = Number(companyId) || DEFAULT_COMPANY_ID;
  const cached = cache.get(id);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.config;

  try {
    const config = await loadCompanyConfig(pool, id);
    // A company with no roles at all means the seed never ran — use legacy matrix.
    if (!config.roles.length) config.roles = buildFallbackConfig(id).roles;
    cache.set(id, { config, loadedAt: Date.now() });
    return config;
  } catch (error) {
    console.error('[platform] Config load failed, using code defaults:', error?.message || error);
    return buildFallbackConfig(id);
  }
};

const invalidateCompanyConfig = (companyId) => {
  if (companyId) cache.delete(Number(companyId));
  else cache.clear();
};

// Effective permission check for a user payload (JWT claims). Per-user boolean flags
// (canReceive / canViewPrices) extend role permissions exactly as they did before.
const userHasPermission = async (pool, user, permissionKey) => {
  if (!user) return false;
  if (permissionKey === 'purchases.receive' && user.canReceive === true) return true;
  if (permissionKey === 'prices.view' && user.canViewPrices === true) return true;

  const config = await getCompanyConfig(pool, user.companyId || DEFAULT_COMPANY_ID);
  const role = config.roles.find((r) => r.key === user.role);
  if (role) return role.permissions.includes(permissionKey);

  // Unknown role in DB config (e.g. stale token after a role was deleted):
  // fall back to the legacy hard-coded matrix if the key matches a system role.
  // Cross-company administration is never granted via fallback outside company 1.
  if (permissionKey === 'platform.companies' && (Number(user.companyId) || DEFAULT_COMPANY_ID) !== DEFAULT_COMPANY_ID) {
    return false;
  }
  const legacy = LEGACY_ROLE_PERMISSIONS[user.role];
  return legacy ? legacy.has(permissionKey) : false;
};

const getUserPermissions = async (pool, user) => {
  const config = await getCompanyConfig(pool, user.companyId || DEFAULT_COMPANY_ID);
  const role = config.roles.find((r) => r.key === user.role);
  const perms = new Set(role ? role.permissions : (LEGACY_ROLE_PERMISSIONS[user.role] || []));
  if (user.canReceive === true) perms.add('purchases.receive');
  if (user.canViewPrices === true) perms.add('prices.view');
  return [...perms];
};

// Validate/coerce a customData payload against the company's custom field
// definitions. Unknown keys are dropped; values are coerced by declared type;
// invalid values are silently omitted (the frontend enforces required-ness).
// Returns a plain object, or null when nothing remains.
const sanitizeCustomData = (config, formKey, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const defs = (config?.customFields?.[formKey]) || [];
  const out = {};
  for (const def of defs) {
    if (!(def.key in input)) continue;
    const raw = input[def.key];
    if (raw === null || raw === undefined || raw === '') continue;
    switch (def.type) {
      case 'number': {
        const n = Number(raw);
        if (Number.isFinite(n)) out[def.key] = n;
        break;
      }
      case 'checkbox':
        out[def.key] = raw === true || raw === 'true' || raw === 1 || raw === '1';
        break;
      case 'select': {
        const v = String(raw).trim();
        if ((def.options || []).includes(v)) out[def.key] = v;
        break;
      }
      case 'date': {
        const v = String(raw).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) out[def.key] = v;
        break;
      }
      default: {
        const v = String(raw).trim();
        if (v) out[def.key] = v.slice(0, 500);
      }
    }
  }
  return Object.keys(out).length ? out : null;
};

const isModuleEnabled = async (pool, companyId, moduleKey) => {
  const config = await getCompanyConfig(pool, companyId || DEFAULT_COMPANY_ID);
  const mod = config.modules.find((m) => m.key === moduleKey);
  return mod ? mod.enabled : true; // unknown module keys never block requests
};

module.exports = {
  getCompanyConfig,
  invalidateCompanyConfig,
  userHasPermission,
  getUserPermissions,
  isModuleEnabled,
  sanitizeCustomData,
  PERMISSIONS,
  MODULES
};
