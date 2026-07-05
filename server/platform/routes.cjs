// Platform routes — /api/config (effective config for the caller's company) and
// /api/admin/* configuration CRUD. Also exports the permission/module middleware
// factories used across server/index.js.

const {
  MODULES,
  PERMISSIONS,
  ALL_PERMISSION_KEYS,
  DEFAULT_TERMINOLOGY,
  DEFAULT_COMPANY_ID
} = require('./registry.cjs');
const {
  getCompanyConfig,
  invalidateCompanyConfig,
  userHasPermission,
  getUserPermissions,
  isModuleEnabled
} = require('./configService.cjs');
const { seedSystemRoles } = require('./schema.cjs');

const requirePermissionFactory = (pool) => (permissionKey) => async (req, res, next) => {
  try {
    const ok = await userHasPermission(pool, req.user, permissionKey);
    if (!ok) {
      res.status(403).json({ error: 'FORBIDDEN', permission: permissionKey });
      return;
    }
    next();
  } catch (error) {
    console.error('Permission check error', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
};

const requireModuleFactory = (pool) => (moduleKey) => async (req, res, next) => {
  try {
    const enabled = await isModuleEnabled(pool, req.user?.companyId, moduleKey);
    if (!enabled) {
      res.status(403).json({ error: 'MODULE_DISABLED', module: moduleKey });
      return;
    }
    next();
  } catch (error) {
    console.error('Module check error', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
};

const ROLE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,49}$/;

const registerPlatformRoutes = (app, deps) => {
  const { pool, authRequired, bcrypt } = deps;
  const requirePermission = requirePermissionFactory(pool);

  const companyIdOf = (req) => Number(req.user?.companyId) || DEFAULT_COMPANY_ID;

  const readSetting = async (companyId, key) => {
    const [rows] = await pool.query(
      'SELECT value FROM company_settings WHERE companyId = ? AND settingKey = ?', [companyId, key]
    );
    if (!rows.length) return {};
    const raw = rows[0].value;
    return typeof raw === 'object' && raw !== null ? raw : JSON.parse(raw || '{}');
  };

  const writeSetting = async (companyId, key, value, username) => {
    await pool.execute(
      `INSERT INTO company_settings (companyId, settingKey, value, updatedBy) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updatedBy = VALUES(updatedBy)`,
      [companyId, key, JSON.stringify(value), username || null]
    );
    invalidateCompanyConfig(companyId);
  };

  // ---- Effective config for the logged-in user -------------------------------
  app.get('/api/config', authRequired, async (req, res) => {
    try {
      const companyId = companyIdOf(req);
      const config = await getCompanyConfig(pool, companyId);
      const permissions = await getUserPermissions(pool, req.user);
      res.json({
        company: config.company,
        modules: config.modules.map(({ key, label, core, enabled, description }) => ({ key, label, core, enabled, description })),
        terminology: config.terminology,
        terminologyDefaults: DEFAULT_TERMINOLOGY,
        general: config.general,
        fieldConfig: config.fieldConfig,
        options: config.options,
        roles: config.roles.map(({ key, name, isSystem }) => ({ key, name, isSystem })),
        permissions
      });
    } catch (error) {
      console.error('Config fetch error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // ---- Company profile --------------------------------------------------------
  app.put('/api/admin/company', authRequired, requirePermission('system.admin'), async (req, res) => {
    const { name, logoUrl, brandTitle, brandSubtitle } = req.body || {};
    try {
      const companyId = companyIdOf(req);
      if (name) {
        await pool.execute('UPDATE companies SET name = ? WHERE id = ?', [String(name), companyId]);
      }
      if (logoUrl !== undefined) {
        const general = await readSetting(companyId, 'general');
        general.logoUrl = logoUrl ? String(logoUrl) : null;
        await writeSetting(companyId, 'general', general, req.user.username);
      }
      if (brandTitle !== undefined || brandSubtitle !== undefined) {
        const terminology = await readSetting(companyId, 'terminology');
        if (brandTitle !== undefined) terminology['brand.title'] = String(brandTitle || '');
        if (brandSubtitle !== undefined) terminology['brand.subtitle'] = String(brandSubtitle || '');
        await writeSetting(companyId, 'terminology', terminology, req.user.username);
      }
      invalidateCompanyConfig(companyId);
      res.json({ status: 'OK' });
    } catch (error) {
      console.error('Company update error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // ---- Module toggles ----------------------------------------------------------
  app.put('/api/admin/modules/:key', authRequired, requirePermission('system.admin'), async (req, res) => {
    const moduleKey = String(req.params.key);
    const { enabled } = req.body || {};
    const mod = MODULES.find((m) => m.key === moduleKey);
    if (!mod) {
      res.status(404).json({ error: 'UNKNOWN_MODULE' });
      return;
    }
    if (mod.core && enabled === false) {
      res.status(400).json({ error: 'CORE_MODULE', message: 'Temel modüller kapatılamaz' });
      return;
    }
    try {
      const companyId = companyIdOf(req);
      await pool.execute(
        `INSERT INTO company_modules (companyId, moduleKey, enabled, updatedBy) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updatedBy = VALUES(updatedBy)`,
        [companyId, moduleKey, enabled ? 1 : 0, req.user.username]
      );
      invalidateCompanyConfig(companyId);
      res.json({ status: 'OK' });
    } catch (error) {
      console.error('Module toggle error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // ---- Roles & permissions ------------------------------------------------------
  app.get('/api/admin/roles', authRequired, requirePermission('users.manage'), async (req, res) => {
    try {
      const config = await getCompanyConfig(pool, companyIdOf(req));
      res.json({ roles: config.roles, permissionCatalog: PERMISSIONS });
    } catch (error) {
      console.error('Roles fetch error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.post('/api/admin/roles', authRequired, requirePermission('users.manage'), async (req, res) => {
    const { key, name, permissions = [] } = req.body || {};
    if (!key || !name || !ROLE_KEY_PATTERN.test(String(key))) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Rol anahtarı BÜYÜK_HARF formatında olmalı' });
      return;
    }
    const companyId = companyIdOf(req);
    const invalid = permissions.filter((p) => !ALL_PERMISSION_KEYS.includes(p));
    if (invalid.length) {
      res.status(400).json({ error: 'INVALID_PERMISSIONS', permissions: invalid });
      return;
    }
    // Cross-company administration cannot be self-granted by tenant admins.
    if (permissions.includes('platform.companies') && companyId !== DEFAULT_COMPANY_ID) {
      res.status(403).json({ error: 'FORBIDDEN', permission: 'platform.companies' });
      return;
    }
    try {
      const [result] = await pool.execute(
        'INSERT INTO roles (companyId, roleKey, displayName, isSystem) VALUES (?, ?, ?, 0)',
        [companyId, String(key), String(name)]
      );
      for (const perm of permissions) {
        await pool.execute('INSERT IGNORE INTO role_permissions (roleId, permissionKey) VALUES (?, ?)', [result.insertId, perm]);
      }
      invalidateCompanyConfig(companyId);
      res.json({ status: 'OK' });
    } catch (error) {
      if (String(error?.code) === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'ROLE_EXISTS' });
        return;
      }
      console.error('Role create error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.put('/api/admin/roles/:key', authRequired, requirePermission('users.manage'), async (req, res) => {
    const roleKey = String(req.params.key);
    const { name, permissions } = req.body || {};
    // ADMIN is immutable so a company admin can never lock themselves out.
    if (roleKey === 'ADMIN') {
      res.status(400).json({ error: 'ROLE_IMMUTABLE', message: 'ADMIN rolü düzenlenemez' });
      return;
    }
    try {
      const companyId = companyIdOf(req);
      const [rows] = await pool.query('SELECT id FROM roles WHERE companyId = ? AND roleKey = ?', [companyId, roleKey]);
      if (!rows.length) {
        res.status(404).json({ error: 'ROLE_NOT_FOUND' });
        return;
      }
      const roleId = rows[0].id;
      if (name) {
        await pool.execute('UPDATE roles SET displayName = ? WHERE id = ?', [String(name), roleId]);
      }
      if (Array.isArray(permissions)) {
        const invalid = permissions.filter((p) => !ALL_PERMISSION_KEYS.includes(p));
        if (invalid.length) {
          res.status(400).json({ error: 'INVALID_PERMISSIONS', permissions: invalid });
          return;
        }
        // Cross-company administration cannot be self-granted by tenant admins.
        if (permissions.includes('platform.companies') && companyId !== DEFAULT_COMPANY_ID) {
          res.status(403).json({ error: 'FORBIDDEN', permission: 'platform.companies' });
          return;
        }
        await pool.execute('DELETE FROM role_permissions WHERE roleId = ?', [roleId]);
        for (const perm of permissions) {
          await pool.execute('INSERT IGNORE INTO role_permissions (roleId, permissionKey) VALUES (?, ?)', [roleId, perm]);
        }
      }
      invalidateCompanyConfig(companyId);
      res.json({ status: 'OK' });
    } catch (error) {
      console.error('Role update error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.delete('/api/admin/roles/:key', authRequired, requirePermission('users.manage'), async (req, res) => {
    const roleKey = String(req.params.key);
    try {
      const companyId = companyIdOf(req);
      const [rows] = await pool.query('SELECT id, isSystem FROM roles WHERE companyId = ? AND roleKey = ?', [companyId, roleKey]);
      if (!rows.length) {
        res.status(404).json({ error: 'ROLE_NOT_FOUND' });
        return;
      }
      if (rows[0].isSystem === 1) {
        res.status(400).json({ error: 'ROLE_IMMUTABLE', message: 'Sistem rolleri silinemez' });
        return;
      }
      const [users] = await pool.query('SELECT COUNT(*) AS cnt FROM users WHERE role = ? AND companyId = ?', [roleKey, companyId]);
      if (Number(users[0].cnt) > 0) {
        res.status(409).json({ error: 'ROLE_IN_USE', message: 'Bu role sahip kullanıcılar var' });
        return;
      }
      await pool.execute('DELETE FROM role_permissions WHERE roleId = ?', [rows[0].id]);
      await pool.execute('DELETE FROM roles WHERE id = ?', [rows[0].id]);
      invalidateCompanyConfig(companyId);
      res.json({ status: 'OK' });
    } catch (error) {
      console.error('Role delete error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // ---- Terminology, field config, option lists -----------------------------------
  app.put('/api/admin/terminology', authRequired, requirePermission('system.admin'), async (req, res) => {
    const { overrides } = req.body || {};
    if (!overrides || typeof overrides !== 'object') {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    try {
      const companyId = companyIdOf(req);
      // Only store non-empty string values; empty override = revert to default.
      const clean = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (typeof v === 'string' && v.trim()) clean[String(k)] = v.trim();
      }
      await writeSetting(companyId, 'terminology', clean, req.user.username);
      res.json({ status: 'OK' });
    } catch (error) {
      console.error('Terminology update error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.put('/api/admin/field-config', authRequired, requirePermission('system.admin'), async (req, res) => {
    const { formKey, fields } = req.body || {};
    if (!formKey || !fields || typeof fields !== 'object') {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    try {
      const companyId = companyIdOf(req);
      const current = await readSetting(companyId, 'fieldConfig');
      current[String(formKey)] = fields;
      await writeSetting(companyId, 'fieldConfig', current, req.user.username);
      res.json({ status: 'OK' });
    } catch (error) {
      console.error('Field config update error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.put('/api/admin/general', authRequired, requirePermission('system.admin'), async (req, res) => {
    const { settings } = req.body || {};
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    try {
      const companyId = companyIdOf(req);
      const current = await readSetting(companyId, 'general');
      await writeSetting(companyId, 'general', { ...current, ...settings }, req.user.username);
      res.json({ status: 'OK' });
    } catch (error) {
      console.error('General settings update error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // ---- Companies (platform administration) ---------------------------------------
  app.get('/api/admin/companies', authRequired, requirePermission('platform.companies'), async (_req, res) => {
    try {
      const [rows] = await pool.query('SELECT id, name, slug, active, createdAt FROM companies ORDER BY id ASC');
      res.json({ companies: rows });
    } catch (error) {
      console.error('Companies fetch error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.post('/api/admin/companies', authRequired, requirePermission('platform.companies'), async (req, res) => {
    const { name, slug, adminUsername, adminPassword } = req.body || {};
    if (!name || !slug || !adminUsername || !adminPassword) {
      res.status(400).json({ error: 'INVALID_INPUT' });
      return;
    }
    if (String(adminPassword).length < 8) {
      res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Şifre en az 8 karakter olmalı' });
      return;
    }
    try {
      const [result] = await pool.execute(
        'INSERT INTO companies (name, slug) VALUES (?, ?)',
        [String(name), String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '-')]
      );
      const companyId = result.insertId;
      await seedSystemRoles(pool, companyId);
      const passwordHash = await bcrypt.hash(String(adminPassword), 10);
      await pool.execute(
        'INSERT INTO users (username, passwordHash, role, companyId, createdBy) VALUES (?, ?, ?, ?, ?)',
        [String(adminUsername), passwordHash, 'ADMIN', companyId, req.user.username]
      );
      res.json({ status: 'OK', companyId });
    } catch (error) {
      if (String(error?.code) === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'DUPLICATE', message: 'Şirket kısa adı veya kullanıcı adı zaten mevcut' });
        return;
      }
      console.error('Company create error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  app.put('/api/admin/companies/:id', authRequired, requirePermission('platform.companies'), async (req, res) => {
    const { name, active } = req.body || {};
    const targetId = Number(req.params.id);
    if (targetId === DEFAULT_COMPANY_ID && active === false) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Varsayılan şirket pasifleştirilemez' });
      return;
    }
    try {
      const updates = [];
      const params = [];
      if (name) { updates.push('name = ?'); params.push(String(name)); }
      if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
      if (!updates.length) {
        res.status(400).json({ error: 'INVALID_INPUT' });
        return;
      }
      params.push(targetId);
      await pool.execute(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`, params);
      invalidateCompanyConfig(targetId);
      res.json({ status: 'OK' });
    } catch (error) {
      console.error('Company update error', error);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });
};

module.exports = {
  registerPlatformRoutes,
  requirePermissionFactory,
  requireModuleFactory
};
