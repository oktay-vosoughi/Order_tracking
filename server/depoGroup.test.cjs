// server/depoGroup.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNASSIGNED_POOL, resolveDepoGroup, buildLotPoolFilter } = require('./depoGroup.cjs');

test('resolveDepoGroup returns the department name itself as the pool key', () => {
  assert.equal(resolveDepoGroup('SİTOGENETİK'), 'SİTOGENETİK');
  assert.equal(resolveDepoGroup('Moleküler Genetik'), 'Moleküler Genetik');
  assert.equal(resolveDepoGroup('Diğer'), 'Diğer');
});

test('resolveDepoGroup collapses null/empty/blank to the UNASSIGNED pool', () => {
  assert.equal(resolveDepoGroup(null), UNASSIGNED_POOL);
  assert.equal(resolveDepoGroup(''), UNASSIGNED_POOL);
  assert.equal(resolveDepoGroup(undefined), UNASSIGNED_POOL);
  assert.equal(resolveDepoGroup('   '), UNASSIGNED_POOL);
});

test('buildLotPoolFilter builds an exact-match clause for a named department pool', () => {
  const result = buildLotPoolFilter('SİTOGENETİK', 'l');
  assert.equal(result.clause, 'AND l.department = ?');
  assert.deepEqual(result.params, ['SİTOGENETİK']);
});

test('buildLotPoolFilter builds a NULL-or-empty clause for the UNASSIGNED pool', () => {
  const result = buildLotPoolFilter(UNASSIGNED_POOL, 'l');
  assert.equal(result.clause, "AND (l.department IS NULL OR l.department = '')");
  assert.deepEqual(result.params, []);
});

test('buildLotPoolFilter defaults the lot alias to "l"', () => {
  assert.equal(buildLotPoolFilter('Diğer').clause, 'AND l.department = ?');
});

test('buildLotPoolFilter honors a custom lot alias', () => {
  const result = buildLotPoolFilter('Diğer', 'other');
  assert.equal(result.clause, 'AND other.department = ?');
  const unassigned = buildLotPoolFilter(UNASSIGNED_POOL, 'other');
  assert.equal(unassigned.clause, "AND (other.department IS NULL OR other.department = '')");
});
