const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizeImportDepartment } = require('./importDepartment.cjs');

// Exercise the real route with a transactional database double, without
// starting the server or connecting to an operational database.
test('Excel import registers departments and updates the same item and lots on repeat', async () => {
  const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
  const start = source.indexOf("app.post('/api/import-items'");
  const end = source.indexOf('// ANALYTICS', start);
  const statements = [];
  const definitions = new Map();
  const departments = new Set();
  const lots = new Map();
  let handler;
  let sequence = 0;
  const context = {
    app: { post: (_path, ...args) => { handler = args.at(-1); } },
    authRequired() {}, canManageItems() {},
    stockWriteScope() {},
    normalizeImportDepartment,
    process: { env: {} }, console,
    generateId: () => `id-${++sequence}`,
    withTransaction: async (fn) => fn({}),
    all: async (_conn, sql, params) => {
      if (sql.includes('FROM item_definitions')) return definitions.has(params[0]) ? [definitions.get(params[0])] : [];
      if (sql.includes('FROM departments')) return departments.has(params[0]) ? [{ id: params[0] }] : [];
      if (sql.includes('FROM lots')) return lots.has(params.join('|')) ? [lots.get(params.join('|'))] : [];
      throw new Error(`Unexpected query: ${sql}`);
    },
    run: async (_conn, sql, params) => {
      statements.push({ sql, params });
      if (sql.includes('INSERT INTO item_definitions')) definitions.set(params[1], { id: params[0], code: params[1], catalogNo: params[10] });
      if (sql.includes('INSERT INTO departments')) departments.add(params[1]);
      if (sql.includes('INSERT INTO lots')) lots.set(`${params[1]}|${params[2]}`, { id: params[0] });
      return { affectedRows: 1 };
    }
  };
  vm.runInNewContext(source.slice(start, end), context);
  const items = [
    { code: 'CPHS-1', catalogNo: '333675', name: 'Panel', department: 'molekuler geneitk', lotNumber: 'LYF064-1', initialStock: 1, expiryDate: '2026-12-08' },
    { code: 'CPHS-1', catalogNo: '333675', name: 'Panel', department: 'SITOGENTIK', lotNumber: 'LYF064-2', initialStock: 2, expiryDate: '2026-12-24' }
  ];
  items[0].lotLocation = '-20 °C';
  items[0].lotStorageLocation = 'Koridor4 / -20 °C';
  let response;
  const res = { json: (value) => { response = value; }, status: () => res };
  await handler({ body: { items }, user: { username: 'tester' }, assertStockLot() {} }, res);
  assert.equal(response.created, 1);
  assert.equal(response.lotsCreated, 2);
  assert.equal(response.departmentsCreated, 2);
  assert.deepEqual([...departments], ['Moleküler Genetik', 'SİTOGENETİK']);
  assert.equal(definitions.get('CPHS-1').catalogNo, '333675');
  assert.deepEqual(statements.filter(({ sql }) => sql.includes('INSERT INTO lots')).map(({ params }) => params[6]), [1, 2]);
  const inserted = statements.find(({ sql }) => sql.includes('INSERT INTO lots'));
  assert.equal(inserted.params[11], '-20 °C');
  assert.equal(inserted.params[12], 'Koridor4 / -20 °C');

  items[1].initialStock = 3;
  items[1].expiryDate = '';
  await handler({ body: { items }, user: { username: 'tester' }, assertStockLot() {} }, res);
  assert.equal(response.created, 0);
  assert.equal(response.updated, 1);
  assert.equal(response.lotsCreated, 0);
  assert.equal(response.lotsUpdated, 2);
  assert.equal(response.departmentsCreated, 0);
  const updatedLots = statements.filter(({ sql }) => sql.includes('UPDATE lots SET'));
  assert.deepEqual(updatedLots.map(({ params }) => params[0]), [1, 3]);
  assert.equal(updatedLots[1].params[2], null);
  assert.equal(updatedLots[1].sql.includes('expiryDate = COALESCE'), false);
  assert.equal(updatedLots[0].params[7], '-20 °C');
  assert.equal(updatedLots[0].params[8], 'Koridor4 / -20 °C');

  const before = statements.length;
  await handler({ body: { items: [...items, { ...items[0], department: 'Beşinci Departman' }] }, user: { username: 'tester' } }, res);
  assert.equal(response.error, 'INVALID_DEPARTMENT');
  assert.equal(statements.length, before, 'invalid departments must reject the upload before any writes');
});

test('normalizes only the four laboratory departments', () => {
  for (const [raw, expected] of [
    ['SITOGENTIK', 'SİTOGENETİK'], ['sitogenetik', 'SİTOGENETİK'],
    ['molekuler geneitk', 'Moleküler Genetik'], ['Moleküler Genetik', 'Moleküler Genetik'],
    ['molekuler mikor', 'Moleküler Mikro'], ['Molecular Micro', 'Moleküler Mikro'],
    [' NUMUNE  KABUL ', 'Numune Kabul'], ['Diğer', null], ['', '']
  ]) assert.equal(normalizeImportDepartment(raw), expected);
});
