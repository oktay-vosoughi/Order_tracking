const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createStockWriteScope } = require('./stockWriteScope.cjs');
const { buildLotPoolFilter, resolveDepoGroup } = require('./depoGroup.cjs');
const { assertConsumableLot } = require('./stockPolicy.cjs');

async function consume(body) {
  const inventory = [
    { id: 'sito', itemId: '601002', lotNumber: 'S1', department: 'SİTOGENETİK', currentQuantity: 117, status: 'ACTIVE' },
    { id: 'gen', itemId: '601002', lotNumber: 'G1', department: 'Moleküler Genetik', currentQuantity: 34, status: 'ACTIVE' }
  ];
  const queries = [];
  const all = async (_conn, sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('FROM user_departments')) return [{ department: 'SİTOGENETİK' }];
    if (sql.includes('FROM lots WHERE id =')) return inventory.filter((lot) => lot.id === params[0]);
    if (sql.includes('FROM lots l')) {
      assert.match(sql, /l.department = \?/);
      assert.equal(params[1], 'SİTOGENETİK');
      return inventory.filter((lot) => lot.department === params[1]);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const run = async (_conn, sql, params) => {
    if (sql.includes('UPDATE lots SET currentQuantity = currentQuantity -')) inventory.find((lot) => lot.id === params.at(-1)).currentQuantity -= params[0];
    else if (sql.includes('UPDATE lots SET currentQuantity = ?')) inventory.find((lot) => lot.id === params.at(-1)).currentQuantity = params[0];
  };
  const middleware = createStockWriteScope({ all, pool: {} });
  let handler;
  const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
  const start = source.indexOf("app.post('/api/consume',");
  vm.runInNewContext(source.slice(start, source.indexOf('// Get usage records', start)), {
    app: { post: (_path, ...handlers) => { handler = handlers.at(-1); } },
    authRequired() {}, canDistribute() {}, stockWriteScope: middleware,
    all, run, generateId: () => 'usage', console,
    buildLotPoolFilter, resolveDepoGroup, assertConsumableLot,
    withTransaction: async (callback) => {
      const quantities = inventory.map((lot) => lot.currentQuantity);
      try { return await callback({}); } catch (error) {
        inventory.forEach((lot, index) => { lot.currentQuantity = quantities[index]; });
        throw error;
      }
    }
  });
  const req = { user: { id: 'u1', username: 'sito-user', role: 'SATINAL_LOJISTIK' }, route: { path: '/api/consume' }, params: {}, body: { itemId: '601002', ...body } };
  let status = 200, response, authorized = false;
  const res = { status(value) { status = value; return this; }, json(value) { response = value; } };
  await middleware(req, res, () => { authorized = true; });
  if (authorized) await handler(req, res);
  return { status, response, quantities: inventory.map((lot) => lot.currentQuantity), queries };
}

test('601002: SİTOGENETİK consumes 1, leaving 116 and preserving the other 34', async () => {
  for (const lotId of ['sito', undefined]) {
    const result = await consume({ quantity: 1, lotId });
    assert.equal(result.status, 200);
    assert.deepEqual(result.quantities, [116, 34]);
  }
});

test('FEFO cannot borrow 1 from another department when 118 exceeds the local 117', async () => {
  const result = await consume({ quantity: 118 });
  assert.equal(result.status, 400);
  assert.equal(result.response.error, 'INSUFFICIENT_TOTAL_STOCK');
  assert.deepEqual(result.quantities, [117, 34]);
});

test('a forged LOT identifier is rejected without changing either stock quantity', async () => {
  const result = await consume({ quantity: 1, lotId: 'gen' });
  assert.equal(result.status, 403);
  assert.deepEqual(result.quantities, [117, 34]);
});
