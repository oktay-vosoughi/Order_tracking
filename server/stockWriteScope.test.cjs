const test = require('node:test');
const assert = require('node:assert/strict');
const { createStockWriteScope } = require('./stockWriteScope.cjs');
const SITO = 'SİTOGENETİK', GEN = 'Moleküler Genetik';

async function authorize(path, body = {}, options = {}) {
  const req = { route: { path }, body, params: options.params || {}, user: { id: 'u1', role: options.role || 'SATINAL_LOJISTIK' } };
  const lots = options.lots || [{ id: 'sito-lot', itemId: '601002', department: SITO }, { id: 'gen-lot', itemId: '601002', department: GEN }];
  const all = async (_pool, sql, params) => {
    if (sql.includes('FROM user_departments')) {
      const departments = params?.[0] === 'tech'
        ? (options.techMemberships || [options.techDepartment || SITO])
        : (options.memberships || [SITO]);
      return departments.map((department) => ({ department }));
    }
    if (sql.includes('FROM item_departments')) return (options.tags || [SITO]).map((department) => ({ department }));
    if (sql.includes('FROM item_definitions')) return [{ id: '601002', department: options.masterDepartment || SITO, isGlobal: options.isGlobal || 0 }];
    if (sql.includes('FROM lots')) return lots.filter((lot) => {
      if (sql.includes('WHERE id =')) return lot.id === params[0];
      if (sql.includes('department = ?')) return lot.itemId === params[0] && (!lot.department || lot.department === params[2]);
      return lot.itemId === params[0];
    });
    if (sql.includes('FROM users')) return [{ id: 'tech', department: options.techDepartment || SITO }];
    if (sql.includes('FROM purchases')) return [{ id: 'purchase', itemId: '601002', department: options.purchaseDepartment || SITO }];
    if (sql.includes('FROM distributions') || sql.includes('FROM cep_depo_distributions')) return [{ department: options.distributionDepartment || SITO }];
    if (sql.includes('FROM receipts')) return [{ department: options.purchaseDepartment || SITO }];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  let status = 200, error, passed = false;
  const res = { status(value) { status = value; return this; }, json(value) { error = value; } };
  await createStockWriteScope({ all, pool: {} })(req, res, () => { passed = true; });
  return { status, error, passed, req };
}

for (const path of ['/api/consume', '/api/distribute', '/api/waste-with-lot', '/api/lot-adjustments', '/api/cep-depo/return']) {
  test(`${path}: rejects a forged lot from another department`, async () => {
    const result = await authorize(path, { itemId: '601002', lotId: 'gen-lot' }, { role: path === '/api/distribute' ? 'SATINAL' : undefined });
    assert.equal(result.passed, false);
    assert.ok([403, 409].includes(result.status));
  });
}

test('explicit multi-lot distribution cannot mix departments, including for ADMIN', async () => {
  for (const role of ['SATINAL_LOJISTIK', 'ADMIN']) {
    const result = await authorize('/api/distribute', { itemId: '601002', department: SITO, lots: [{ lotId: 'sito-lot' }, { lotId: 'gen-lot' }] }, { role });
    assert.equal(result.passed, false);
  }
});

test('a single membership supplies the department for FEFO; multi-membership requires a selection', async () => {
  const allowed = await authorize('/api/consume', { itemId: '601002' });
  assert.equal(allowed.passed, true);
  assert.equal(allowed.req.body.department, SITO);
  assert.equal((await authorize('/api/consume', {}, { memberships: [SITO, GEN] })).status, 400);
  assert.equal((await authorize('/api/consume', {}, { memberships: [] })).passed, false);
});

test('create/update lot checks both stored and requested department', async () => {
  assert.equal((await authorize('/api/lots', { itemId: '601002', department: GEN })).status, 403);
  assert.equal((await authorize('/api/lots/:id', { department: SITO }, { params: { id: 'gen-lot' } })).passed, false);
  assert.equal((await authorize('/api/lots/:id', { department: GEN }, { params: { id: 'sito-lot' } })).passed, false);
  assert.equal((await authorize('/api/lots/:id', { department: SITO }, { params: { id: 'gen-lot' }, role: 'ADMIN' })).passed, true);
});

test('receipt cannot mix a purchase and lot from different departments or materials', async () => {
  assert.equal((await authorize('/api/receive-goods', { purchaseId: 'p1', itemId: '601002', lotNumber: 'L1' }, { lots: [{ id: 'l1', itemId: '601002', department: GEN }] })).passed, false);
  assert.equal((await authorize('/api/receive-goods', { purchaseId: 'p1', itemId: 'other' })).error.error, 'ITEM_MISMATCH');
  assert.equal((await authorize('/api/receive-goods', { purchaseId: 'p1', itemId: '601002' }, { purchaseDepartment: GEN, role: 'SATINAL' })).status, 403);
});

test('recipient and linked purchase cannot reroute another department stock', async () => {
  assert.equal((await authorize('/api/cep-depo/distribute', { itemId: '601002', labTechnicianId: 'other' }, { techDepartment: GEN, role: 'SATINAL' })).status, 403);
  assert.equal((await authorize('/api/distribute', { department: SITO, receivedBy: 'other' }, { techDepartment: GEN, role: 'ADMIN' })).error.error, 'DEPARTMENT_MISMATCH');
});

test('CEP consumption checks current membership rather than trusting a user profile department', async () => {
  assert.equal((await authorize('/api/cep-depo/consume', {}, { techDepartment: GEN })).status, 403);
  assert.equal((await authorize('/api/cep-depo/consume')).passed, true);
});

test('ADMIN can operate in every department but still supplies an unambiguous target', async () => {
  for (const department of [SITO, GEN, 'Moleküler Mikro', 'Numune Kabul']) {
    assert.equal((await authorize('/api/lots', { department }, { role: 'ADMIN' })).passed, true);
  }
});

test('shared material master updates require ADMIN while owning department can edit its own master', async () => {
  assert.equal((await authorize('/api/item-definitions/:id', {}, { params: { id: '601002' }, tags: [SITO, GEN] })).status, 403);
  assert.equal((await authorize('/api/item-definitions/:id', {}, { params: { id: '601002' } })).passed, true);
  assert.equal((await authorize('/api/item-definitions/:id', {}, { params: { id: '601002' }, isGlobal: 1 })).passed, false);
});

test('Excel import ignores another department same-number lot', async () => {
  const result = await authorize('/api/import-items', { items: [{ code: '601002', department: SITO, lotNumber: 'x' }] }, { role: 'ADMIN', lots: [{ id: 'l1', itemId: '601002', department: GEN }] });
  assert.equal(result.passed, true);
  assert.equal(result.error, undefined);
});

test('ADMIN Excel import may explicitly assign an untagged legacy lot', async () => {
  const result = await authorize('/api/import-items', { items: [{ code: '601002', department: SITO, lotNumber: 'x' }] }, {
    role: 'ADMIN',
    lots: [{ id: 'l1', itemId: '601002', lotNumber: 'x', department: '' }]
  });
  assert.equal(result.passed, true);
  assert.equal(result.error, undefined);
});

test('distribution confirmation and receipt edits reject another department', async () => {
  for (const path of ['/api/distribute/:id/confirm', '/api/cep-depo/distributions/:id/confirm', '/api/receipts/:receiptId']) {
    assert.equal((await authorize(path, {}, { distributionDepartment: GEN, purchaseDepartment: GEN, role: 'SATINAL' })).passed, false);
  }
});

test('locked-row check catches department changes after the initial authorization', async () => {
  const result = await authorize('/api/consume', { itemId: '601002', lotId: 'sito-lot' });
  assert.equal(result.passed, true);
  assert.throws(() => result.req.assertStockLot({ itemId: '601002', department: GEN }), (e) => e.status === 403);
  assert.throws(() => result.req.assertStockLot({ itemId: 'other', department: SITO }), (e) => e.error === 'LOT_NOT_FOUND');
});

test('purchase creation, updates and approvals cannot target another department', async () => {
  assert.equal((await authorize('/api/purchases', { department: GEN })).status, 403);
  assert.equal((await authorize('/api/purchases', { requestedFor: 'other' }, { techDepartment: GEN })).status, 403);
  for (const path of ['/api/purchases/:id/approve', '/api/purchases/:id/order', '/api/purchases/:id/requested-quantity', '/api/purchases/:id/cancel', '/api/purchases/:id/reject']) {
    assert.equal((await authorize(path, {}, { params: { id: 'p1' }, purchaseDepartment: GEN, role: 'SATINAL' })).status, 403);
    assert.equal((await authorize(path, {}, { params: { id: 'p1' } })).passed, true);
  }
  assert.equal((await authorize('/api/purchases/ebys-batches/:batchId/approve', {}, { params: { batchId: 'b1' }, purchaseDepartment: GEN, role: 'SATINAL' })).status, 403);
});

test('multi-department technician can choose which department owns a request', async () => {
  const selected = await authorize('/api/purchases', { department: GEN }, {
    role: 'LAB_TECHNICIAN',
    memberships: [SITO, GEN],
    techDepartment: SITO
  });
  assert.equal(selected.passed, true);
  assert.equal(selected.req.body.department, GEN);

  const forbidden = await authorize('/api/purchases', { department: 'Moleküler Mikro' }, {
    role: 'LAB_TECHNICIAN',
    memberships: [SITO, GEN],
    techDepartment: SITO
  });
  assert.equal(forbidden.status, 403);
});

test('linked CEP distribution uses request department when recipient belongs to both departments', async () => {
  const allowed = await authorize('/api/cep-depo/distribute', {
    purchaseId: 'p1',
    itemId: '601002',
    labTechnicianId: 'tech',
    lotId: 'gen-lot'
  }, {
    role: 'SATINAL_LOJISTIK',
    memberships: [],
    purchaseDepartment: GEN,
    techDepartment: SITO,
    techMemberships: [SITO, GEN]
  });
  assert.equal(allowed.passed, true);
  assert.equal(allowed.req.stockDepartment, GEN);

  const forbidden = await authorize('/api/cep-depo/distribute', {
    purchaseId: 'p1',
    itemId: '601002',
    labTechnicianId: 'tech',
    lotId: 'gen-lot'
  }, {
    role: 'SATINAL_LOJISTIK',
    memberships: [],
    purchaseDepartment: GEN,
    techDepartment: SITO,
    techMemberships: [SITO]
  });
  assert.equal(forbidden.error.error, 'DEPARTMENT_MISMATCH');
});

test('SATINAL_LOJISTIK distributes from any department but cannot edit other department stock', async () => {
  const lojistik = { role: 'SATINAL_LOJISTIK', memberships: [] };
  const dist = await authorize('/api/distribute', { itemId: '601002', department: GEN, lotId: 'gen-lot' }, lojistik);
  assert.equal(dist.passed, true);
  assert.equal(dist.req.stockDepartment, GEN);
  assert.equal((await authorize('/api/distribute', { itemId: '601002', department: SITO, lotId: 'gen-lot' }, lojistik)).passed, false);
  assert.equal((await authorize('/api/cep-depo/distribute', { itemId: '601002', labTechnicianId: 't' }, { ...lojistik, techDepartment: GEN })).passed, true);
  assert.equal((await authorize('/api/lot-adjustments', { itemId: '601002', lotId: 'gen-lot' }, lojistik)).passed, false);
  assert.equal((await authorize('/api/waste-with-lot', { itemId: '601002', lotId: 'gen-lot' }, lojistik)).passed, false);
});

test('SATINAL_LOJISTIK orders, EBYS-approves and receives for any department', async () => {
  const lojistik = { role: 'SATINAL_LOJISTIK', memberships: [], purchaseDepartment: GEN };
  assert.equal((await authorize('/api/purchases/:id/order', {}, { ...lojistik, params: { id: 'p1' } })).passed, true);
  assert.equal((await authorize('/api/purchases/ebys-batches/:batchId/approve', {}, { ...lojistik, params: { batchId: 'b1' } })).passed, true);
  const receive = await authorize('/api/receive-goods', { purchaseId: 'p1', itemId: '601002', lotNumber: 'L1' }, { ...lojistik, lots: [] });
  assert.equal(receive.passed, true);
  assert.equal(receive.req.stockDepartment, GEN);
  // approve/reject of requests stays SATINAL/ADMIN and membership-scoped
  assert.equal((await authorize('/api/purchases/:id/cancel', {}, { ...lojistik, params: { id: 'p1' } })).passed, false);
});

test('Genetik and Mikro share main-stock lots; CEP requests and other departments stay separate', async () => {
  const MIKRO = 'Moleküler Mikro';
  const lots = [{ id: 'mikro-lot', itemId: '601002', department: MIKRO }, { id: 'sito-lot', itemId: '601002', department: SITO }];
  // A Genetik member can consume a Mikro lot when working for Genetik.
  const shared = await authorize('/api/consume', { itemId: '601002', lotId: 'mikro-lot', department: GEN }, { role: 'LAB_TECHNICIAN', memberships: [GEN], lots });
  assert.equal(shared.passed, true);
  // ...but not another department's lot.
  const other = await authorize('/api/consume', { itemId: '601002', lotId: 'sito-lot', department: GEN }, { role: 'LAB_TECHNICIAN', memberships: [GEN], lots });
  assert.equal(other.passed, false);
  // Group membership does not open CEP DEPO / purchase requests of the peer department.
  const request = await authorize('/api/purchases', { department: MIKRO }, { role: 'LAB_TECHNICIAN', memberships: [GEN], techDepartment: GEN, techMemberships: [GEN] });
  assert.equal(request.status, 403);
});
