'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planReconcile } = require('./countReconcile.cjs');

const db = (code, lots) => new Map([[code, { id: 'I1', lots: lots.map((l, i) => ({ id: `L${i}`, lotNumber: `N${i}`, ...l })) }]]);
const count = (rows) => rows.map(([expiryDate, quantity]) => ({ code: 'X', expiryDate, quantity }));

test('same expiry updates the existing lot and keeps its number', () => {
  const [p] = planReconcile(count([['2027-03-01', 2]]), db('X', [{ expiryDate: '2027-03-01', currentQuantity: 3 }]));
  assert.equal(p.state, 'ESLESTI');
  assert.deepEqual(p.actions.map((a) => [a.type, a.from, a.to]), [['SET_QTY', 3, 2]]);
});

test('unmatched stocked lot is zeroed when every count lot matched', () => {
  const [p] = planReconcile(count([['2027-03-01', 2]]), db('X', [
    { expiryDate: '2027-03-01', currentQuantity: 3 }, { expiryDate: '2025-01-01', currentQuantity: 1 }]));
  assert.deepEqual(p.actions.map((a) => a.type).sort(), ['SET_QTY', 'ZERO']);
});

test('count lot with no existing lot is created', () => {
  const [p] = planReconcile(count([['2027-03-01', 2]]), db('X', []));
  assert.equal(p.state, 'YENI_LOT');
  assert.equal(p.actions[0].type, 'CREATE');
});

test('unmatched on both sides is MANUEL unless forced', () => {
  const d = db('X', [{ expiryDate: null, currentQuantity: 4 }]);
  assert.equal(planReconcile(count([['2027-01-01', 3], ['2026-12-01', 1]]), d)[0].state, 'MANUEL');
  const [f] = planReconcile(count([['2027-01-01', 3], ['2026-12-01', 1]]), d, { force: ['X'] });
  assert.deepEqual(f.actions.map((a) => a.type).sort(), ['CREATE', 'CREATE', 'ZERO']);
});

test('missing item and unchanged lots', () => {
  assert.equal(planReconcile(count([['', 1]]), new Map())[0].state, 'ITEM_YOK');
  assert.equal(planReconcile(count([['', 1]]), db('X', [{ expiryDate: null, currentQuantity: 1 }]))[0].state, 'DEGISMEZ');
});

test('two count lots with the same expiry are summed', () => {
  const [p] = planReconcile(count([['2027-01-01', 1], ['2027-01-01', 2]]), db('X', [{ expiryDate: '2027-01-01', currentQuantity: 1 }]));
  assert.equal(p.actions[0].to, 3);
});

test('keep-lots pairs unmatched lots in expiry order and only changes quantity', () => {
  const d = db('X', [{ expiryDate: '2027-01-23', currentQuantity: 1 }, { expiryDate: '2027-04-09', currentQuantity: 5 }]);
  const [p] = planReconcile(count([['2027-09-04', 3], ['2027-02-22', 3]]), d, { keep: ['X'] });
  assert.equal(p.state, 'ESLESTI');
  assert.deepEqual(p.actions.map((a) => [a.type, a.lot.id, a.to]), [['SET_QTY', 'L0', 3], ['SET_QTY', 'L1', 3]]);
  assert.ok(p.actions.every((a) => a.note.startsWith('SKT farkli')));
});

test('keep-lots stays MANUEL when lot counts differ', () => {
  const d = db('X', [{ expiryDate: '2027-01-23', currentQuantity: 3 }, { expiryDate: '2027-04-09', currentQuantity: 3 }]);
  assert.equal(planReconcile(count([['', 5]]), d, { keep: ['X'] })[0].state, 'MANUEL');
});

test('several stocked lots on one expiry that already sum to the count need no change', () => {
  const d = db('X', [{ expiryDate: '2028-04-30', currentQuantity: 3 }, { expiryDate: '2028-04-30', currentQuantity: 7 }]);
  assert.equal(planReconcile(count([['2028-04-30', 10]]), d)[0].state, 'DEGISMEZ');
  assert.equal(planReconcile(count([['2028-04-30', 9]]), d)[0].state, 'MANUEL');
});

test('a counted zero creates no lot and zeroes the leftover stocked lot', () => {
  const [p] = planReconcile(count([['', 0]]), db('X', [{ expiryDate: '2027-03-31', currentQuantity: 1 }]));
  assert.deepEqual(p.actions.map((a) => a.type), ['ZERO']);
  assert.equal(planReconcile(count([['', 0]]), db('X', []))[0].state, 'DEGISMEZ');
});
