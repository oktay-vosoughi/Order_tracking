const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildItemDepartmentFilter, buildStockDepartmentFilter } = require('./departmentScope.cjs');

const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
function createHarness(memberships) {
  const queries = [];
  const routes = new Map();
  const context = {
    app: { get: (path, _auth, handler) => routes.set(path, handler) },
    authRequired() {}, pool: {}, ROLES: { ADMIN: 'ADMIN' }, console,
    buildItemDepartmentFilter, buildStockDepartmentFilter,
    resolveDepoGroup: (department) => department || 'UNASSIGNED',
    attachBarcodesToItems: async (items) => items,
    all: async (_pool, sql, params = []) => {
      if (sql.includes('FROM user_departments')) return memberships.map((department) => ({ department }));
      queries.push({ sql, params: Array.from(params) });
      assert.equal((sql.match(/\?/g) || []).length, params.length, 'SQL bindings must match placeholders');
      return [];
    }
  };
  const resolverStart = source.indexOf('async function getStockViewDepartments(');
  const resolverEnd = source.indexOf('\n}\n', resolverStart) + 2;
  vm.runInNewContext(source.slice(resolverStart, resolverEnd), context);
  for (const [startMarker, endMarker] of [
    ["app.get('/api/unified-stock',", '// Get item lots (for drill-down)'],
    ["app.get('/api/unified-stock/:itemId/lots',", '// ISO MALZEME SAYIM FORMU'],
    ["app.get('/api/lots',", '// Create lot (receive stock)']
  ]) {
    const start = source.indexOf(startMarker);
    vm.runInNewContext(source.slice(start, source.indexOf(endMarker, start)), context);
  }
  return {
    queries,
    async request(path, role) {
      let result;
      const res = { json: (body) => { result = body; }, status: () => res };
      await routes.get(path)({ user: { id: 'u1', role }, params: { itemId: '601002' }, query: {} }, res);
      assert.equal(result.error, undefined);
    }
  };
}

for (const role of ['LAB_TECHNICIAN', 'SATINAL', 'SATINAL_LOJISTIK', 'KALITE', 'KURUMSAL', 'OBSERVER']) {
  test(`${role}: stock, orders, CEP and lot queries are scoped to memberships`, async () => {
    const harness = createHarness(['SİTOGENETİK']);
    await harness.request('/api/unified-stock', role);
    const [main, lots, orders] = harness.queries;
    assert.match(main.sql, /LEFT JOIN lots l ON id.id = l.itemId AND l.department IN \(\?\)/);
    assert.match(main.sql, /AND p.department IN \(\?\)/);
    assert.equal((main.sql.match(/AND b.department IN \(\?\)/g) || []).length, 2);
    assert.deepEqual(main.params, Array(5).fill('SİTOGENETİK'));
    assert.match(lots.sql, /AND l.department IN \(\?\)/);
    assert.match(orders.sql, /AND p.department IN \(\?\)/);
    for (const path of ['/api/lots', '/api/unified-stock/:itemId/lots']) {
      await harness.request(path, role);
      const query = harness.queries.at(-1);
      assert.match(query.sql, /AND l.department IN \(\?\)/);
      assert.equal(query.params.at(-1), 'SİTOGENETİK');
    }
  });
}

test('ADMIN sees all lots and aggregate quantities regardless of membership', async () => {
  const harness = createHarness(['SİTOGENETİK']);
  for (const path of ['/api/unified-stock', '/api/lots', '/api/unified-stock/:itemId/lots']) {
    await harness.request(path, 'ADMIN');
  }
  for (const { sql } of harness.queries) assert.doesNotMatch(sql, /department IN|AND 1 = 0/);
});

test('users with no memberships cannot get stock from global material definitions', async () => {
  const harness = createHarness([]);
  for (const path of ['/api/unified-stock', '/api/lots', '/api/unified-stock/:itemId/lots']) {
    await harness.request(path, 'LAB_TECHNICIAN');
  }
  for (const { sql } of harness.queries) assert.match(sql, /AND 1 = 0/);
});

test('multiple memberships bind every department for each quantity source', async () => {
  const harness = createHarness(['SİTOGENETİK', 'Moleküler Genetik']);
  await harness.request('/api/unified-stock', 'LAB_TECHNICIAN');
  assert.deepEqual(harness.queries[0].params, Array(5).fill(['SİTOGENETİK', 'Moleküler Genetik']).flat());
});
