const test = require('node:test');
const assert = require('node:assert/strict');
const { registerTenderReceipts } = require('./tenderReceipts.cjs');

function setup({ lots = [] } = {}) {
  const routes = {};
  const app = { post: (p, ...h) => { routes['POST ' + p] = h; }, get: (p, ...h) => { routes['GET ' + p] = h; } };
  const calls = [];
  const all = async (_c, sql) => {
    if (sql.includes('FROM item_definitions')) return [{ id: 'i1', code: 'D1', name: 'Kit', unitsPerPackage: 1 }];
    if (sql.includes('FROM lots')) return lots;
    return [{ id: 'new' }];
  };
  const run = async (_c, sql, params) => { calls.push({ sql, params }); };
  registerTenderReceipts(app, {
    pool: {}, all, run, withTransaction: (fn) => fn({}), generateId: (() => { let n = 0; return () => `id${++n}`; })(),
    authRequired: (_q, _s, n) => n(), isCanonicalDepartment: (d) => ['Moleküler Genetik', 'SİTOGENETİK'].includes(d)
  });
  const post = async (body, role = 'SATINAL_LOJISTIK') => {
    const [, role_, handler] = routes['POST /api/tender-receipts'];
    const req = { body, user: { id: 1, username: 'u', role } };
    let status = 200, out;
    const res = { status(s) { status = s; return this; }, json(v) { out = v; } };
    let blocked = true;
    await role_(req, res, () => { blocked = false; });
    if (!blocked) await handler(req, res);
    return { status, out };
  };
  return { post, calls };
}
const valid = { itemId: 'i1', department: 'Moleküler Genetik', quantity: 5, lotNumber: 'L1', expiryDate: '2027-05-01' };

test('only ADMIN and SATINAL_LOJISTIK may record tender receipts', async () => {
  const { post } = setup();
  assert.equal((await post(valid, 'SATINAL')).status, 403);
  assert.equal((await post(valid, 'LAB_TECHNICIAN')).status, 403);
  assert.equal((await post(valid, 'ADMIN')).status, 200);
  assert.equal((await post(valid, 'SATINAL_LOJISTIK')).status, 200);
});

test('quantity, lot, department and expiry are required', async () => {
  const { post } = setup();
  assert.equal((await post({ ...valid, quantity: 0 })).status, 400);
  assert.equal((await post({ ...valid, lotNumber: '  ' })).status, 400);
  assert.equal((await post({ ...valid, department: 'Yok' })).status, 400);
  assert.equal((await post({ ...valid, expiryDate: '' })).status, 400);
  assert.equal((await post({ ...valid, expiryDate: 'bozuk' })).status, 400);
});

test('creates a lot, a tender record and a stock movement', async () => {
  const { post, calls } = setup();
  const r = await post({ ...valid, tenderNo: 'IH-1' });
  assert.equal(r.status, 200);
  const sqls = calls.map((c) => c.sql);
  assert.ok(sqls.some((s) => s.includes('INSERT INTO lots')));
  assert.ok(sqls.some((s) => s.includes('INSERT INTO tender_receipts')));
  assert.ok(sqls.some((s) => s.includes('INSERT INTO stock_movements')));
});

test('existing lot of another department is rejected, same department is topped up', async () => {
  const other = setup({ lots: [{ id: 'l1', department: 'SİTOGENETİK' }] });
  assert.equal((await other.post(valid)).status, 409);
  const same = setup({ lots: [{ id: 'l1', department: 'Moleküler Genetik' }] });
  assert.equal((await same.post(valid)).status, 200);
  assert.ok(same.calls.some((c) => c.sql.includes('UPDATE lots SET currentQuantity')));
});
