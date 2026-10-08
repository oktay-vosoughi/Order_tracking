const test = require('node:test');
const assert = require('node:assert/strict');
const { poolMembers, samePool, expandDepartments } = require('./sharedStockPool.cjs');
const { buildLotPoolFilter, resolveDepoGroup } = require('./depoGroup.cjs');

test('Genetik and Mikro share a pool; other departments stay separate', () => {
  assert.ok(samePool('Moleküler Mikro', 'Moleküler Genetik'));
  assert.ok(samePool('Moleküler Genetik', 'Moleküler Mikro'));
  assert.ok(samePool('SİTOGENETİK', 'SİTOGENETİK'));
  assert.ok(!samePool('SİTOGENETİK', 'Moleküler Genetik'));
  assert.ok(!samePool('Numune Kabul', 'Moleküler Mikro'));
  assert.ok(!samePool('', ''));
  assert.ok(!samePool(null, 'Moleküler Mikro'));
});

test('expandDepartments adds the peer department once', () => {
  assert.deepEqual(expandDepartments(['Moleküler Mikro']).sort(), ['Moleküler Genetik', 'Moleküler Mikro']);
  assert.deepEqual(expandDepartments(['SİTOGENETİK']), ['SİTOGENETİK']);
  assert.equal(expandDepartments(['Moleküler Mikro', 'Moleküler Genetik']).length, 2);
});

test('buildLotPoolFilter spans both departments of the shared pool only', () => {
  const shared = buildLotPoolFilter(resolveDepoGroup('Moleküler Genetik'), 'l');
  assert.equal(shared.clause, 'AND l.department IN (?,?)');
  assert.deepEqual(shared.params.sort(), poolMembers('Moleküler Mikro').sort());
  assert.equal(buildLotPoolFilter('SİTOGENETİK', 'l').clause, 'AND l.department = ?');
});
