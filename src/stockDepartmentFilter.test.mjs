import test from 'node:test';
import assert from 'node:assert/strict';
import { getStockDepartments, matchesStockDepartment } from './stockDisplay.mjs';

test('601002 is visible under both of its departments', () => {
  const item = {
    code: '601002', department: 'Moleküler Genetik',
    departments: ['Moleküler Genetik', 'SİTOGENETİK'],
    pools: { UNASSIGNED: { available: 0, pendingOrderQty: 2 }, 'Moleküler Genetik': { available: 34 }, 'SİTOGENETİK': { available: 117 } }
  };
  assert.deepEqual(getStockDepartments(item), ['Moleküler Genetik', 'SİTOGENETİK']);
  assert.equal(matchesStockDepartment(item, 'SİTOGENETİK'), true);
  assert.equal(matchesStockDepartment(item, 'Moleküler Genetik'), true);
  assert.equal(matchesStockDepartment(item, 'Numune Kabul'), false);
  assert.equal(matchesStockDepartment(item, ''), true);
  assert.equal(matchesStockDepartment({ ...item, departments: [] }, 'SİTOGENETİK'), true);
  assert.equal(matchesStockDepartment({ ...item, pools: {} }, 'SİTOGENETİK'), true);
});

test('global materials match all departments and unassigned stock creates no department option', () => {
  assert.equal(matchesStockDepartment({ isGlobal: 1 }, 'Numune Kabul'), true);
  assert.equal(matchesStockDepartment({ isGlobal: '0' }, 'Numune Kabul'), false);
  assert.deepEqual(getStockDepartments({ pools: { UNASSIGNED: { available: 1 } } }), []);
});
