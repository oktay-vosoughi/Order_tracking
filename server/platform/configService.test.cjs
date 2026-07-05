const test = require('node:test');
const assert = require('node:assert');
const { getCompanyConfig, invalidateCompanyConfig, userHasPermission, getUserPermissions } = require('./configService.cjs');
const { SYSTEM_ROLES } = require('./registry.cjs');

// Mock pool that dispatches on SQL substrings.
const makePool = (handlers) => ({
  query: async (sql, params) => {
    for (const [needle, rows] of handlers) {
      if (sql.includes(needle)) return [typeof rows === 'function' ? rows(params) : rows];
    }
    return [[]];
  }
});

const throwingPool = { query: async () => { throw new Error('no tables'); } };

test('falls back to legacy role matrix when config tables are unreadable', async () => {
  invalidateCompanyConfig();
  const config = await getCompanyConfig(throwingPool, 1);
  assert.equal(config._fallback, true);
  const admin = config.roles.find((r) => r.key === 'ADMIN');
  assert.ok(admin.permissions.includes('purchases.approve'));
  const observer = config.roles.find((r) => r.key === 'OBSERVER');
  assert.ok(!observer.permissions.includes('inventory.modify'));
});

test('userHasPermission honors DB-configured custom roles', async () => {
  invalidateCompanyConfig();
  const pool = makePool([
    ['FROM companies', [{ id: 1, name: 'X', slug: 'x', active: 1 }]],
    ['FROM company_settings', []],
    ['FROM company_modules', []],
    ['FROM roles r', [
      { id: 7, roleKey: 'DEPOCU', displayName: 'Depocu', isSystem: 0, permissionKey: 'inventory.view' },
      { id: 7, roleKey: 'DEPOCU', displayName: 'Depocu', isSystem: 0, permissionKey: 'distributions.create' }
    ]]
  ]);
  const user = { role: 'DEPOCU', companyId: 1 };
  assert.equal(await userHasPermission(pool, user, 'distributions.create'), true);
  assert.equal(await userHasPermission(pool, user, 'purchases.approve'), false);
});

test('per-user flags OR into permissions exactly like the legacy behavior', async () => {
  invalidateCompanyConfig();
  const user = { role: 'OBSERVER', companyId: 1, canReceive: true, canViewPrices: true };
  assert.equal(await userHasPermission(throwingPool, user, 'purchases.receive'), true);
  assert.equal(await userHasPermission(throwingPool, user, 'prices.view'), true);
  const perms = await getUserPermissions(throwingPool, user);
  assert.ok(perms.includes('purchases.receive'));
  assert.ok(perms.includes('prices.view'));
});

test('module overrides apply; core modules cannot be disabled', async () => {
  invalidateCompanyConfig();
  const pool = makePool([
    ['FROM companies', [{ id: 1, name: 'X', slug: 'x', active: 1 }]],
    ['FROM company_settings', []],
    ['FROM company_modules', [
      { moduleKey: 'cep_depo', enabled: 0 },
      { moduleKey: 'stock', enabled: 0 } // core — must stay on
    ]],
    ['FROM roles r', [{ id: 1, roleKey: 'ADMIN', displayName: 'Admin', isSystem: 1, permissionKey: 'users.manage' }]]
  ]);
  const config = await getCompanyConfig(pool, 1);
  assert.equal(config.modules.find((m) => m.key === 'cep_depo').enabled, false);
  assert.equal(config.modules.find((m) => m.key === 'stock').enabled, true);
});

test('terminology and fieldConfig overlays merge onto defaults', async () => {
  invalidateCompanyConfig();
  const pool = makePool([
    ['FROM companies', [{ id: 1, name: 'X', slug: 'x', active: 1 }]],
    ['FROM company_settings', [
      { settingKey: 'terminology', value: JSON.stringify({ 'tab.cep_depo': 'Birim Deposu' }) },
      { settingKey: 'fieldConfig', value: JSON.stringify({ itemForm: { brand: { visible: false } } }) }
    ]],
    ['FROM company_modules', []],
    ['FROM roles r', [{ id: 1, roleKey: 'ADMIN', displayName: 'Admin', isSystem: 1, permissionKey: 'users.manage' }]]
  ]);
  const config = await getCompanyConfig(pool, 1);
  assert.equal(config.terminology['tab.cep_depo'], 'Birim Deposu');
  assert.equal(config.terminology['tab.stock'], 'Stok'); // default preserved
  assert.equal(config.fieldConfig.itemForm.brand.visible, false);
  assert.equal(config.fieldConfig.itemForm.brand.required, false); // default property kept
  assert.equal(config.fieldConfig.itemForm.code.visible, true);
});

test('seeded system role matrix matches the legacy capability middleware', () => {
  const byKey = Object.fromEntries(SYSTEM_ROLES.map((r) => [r.key, new Set(r.permissions)]));
  // canApprove was ADMIN, SATINAL, KURUMSAL
  assert.ok(byKey.ADMIN.has('purchases.approve'));
  assert.ok(byKey.SATINAL.has('purchases.approve'));
  assert.ok(byKey.KURUMSAL.has('purchases.approve'));
  assert.ok(!byKey.SATINAL_LOJISTIK.has('purchases.approve'));
  // canOrder was ADMIN, SATINAL_LOJISTIK
  assert.ok(byKey.SATINAL_LOJISTIK.has('purchases.order'));
  assert.ok(!byKey.SATINAL.has('purchases.order'));
  // canViewPrices role base was ADMIN, KURUMSAL
  assert.ok(byKey.KURUMSAL.has('prices.view'));
  assert.ok(!byKey.SATINAL.has('prices.view'));
  // OBSERVER is read-only
  assert.ok(!byKey.OBSERVER.has('distributions.create'));
  assert.ok(!byKey.OBSERVER.has('purchases.request'));
});
