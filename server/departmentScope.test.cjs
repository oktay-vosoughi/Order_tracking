// server/departmentScope.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEPARTMENT_BYPASS_ROLES,
  isBypassRole,
  buildItemDepartmentFilter,
  buildDeptInClause,
} = require('./departmentScope.cjs');

test('isBypassRole returns true for ADMIN, SATINAL, SATINAL_LOJISTIK, KURUMSAL', () => {
  assert.equal(isBypassRole('ADMIN'), true);
  assert.equal(isBypassRole('SATINAL'), true);
  assert.equal(isBypassRole('SATINAL_LOJISTIK'), true);
  assert.equal(isBypassRole('KURUMSAL'), true);
});

test('isBypassRole returns false for LAB_TECHNICIAN and OBSERVER', () => {
  assert.equal(isBypassRole('LAB_TECHNICIAN'), false);
  assert.equal(isBypassRole('OBSERVER'), false);
});

test('DEPARTMENT_BYPASS_ROLES contains exactly the four bypass roles', () => {
  assert.deepEqual(
    [...DEPARTMENT_BYPASS_ROLES].sort(),
    ['ADMIN', 'KURUMSAL', 'SATINAL', 'SATINAL_LOJISTIK'].sort()
  );
});

test('buildItemDepartmentFilter returns an empty clause for null (bypass)', () => {
  const result = buildItemDepartmentFilter(null);
  assert.equal(result.clause, '');
  assert.deepEqual(result.params, []);
});

test('buildItemDepartmentFilter returns an isGlobal-only clause for an empty array', () => {
  const result = buildItemDepartmentFilter([]);
  assert.equal(result.clause, 'AND (id.isGlobal = 1)');
  assert.deepEqual(result.params, []);
});

test('buildItemDepartmentFilter returns an EXISTS clause with placeholders for one department', () => {
  const result = buildItemDepartmentFilter(['Numune Kabul']);
  assert.equal(
    result.clause,
    "AND (id.isGlobal = 1 OR EXISTS (SELECT 1 FROM item_departments d WHERE d.itemDefinitionId = id.id AND d.department IN (?)))"
  );
  assert.deepEqual(result.params, ['Numune Kabul']);
});

test('buildItemDepartmentFilter handles multiple departments with matching placeholder count', () => {
  const result = buildItemDepartmentFilter(['Numune Kabul', 'Molecular Micro']);
  assert.equal(
    result.clause,
    "AND (id.isGlobal = 1 OR EXISTS (SELECT 1 FROM item_departments d WHERE d.itemDefinitionId = id.id AND d.department IN (?,?)))"
  );
  assert.deepEqual(result.params, ['Numune Kabul', 'Molecular Micro']);
});

test('buildDeptInClause returns an empty clause for null (bypass)', () => {
  const result = buildDeptInClause(null, 'b.department');
  assert.equal(result.clause, '');
  assert.deepEqual(result.params, []);
});

test('buildDeptInClause builds an IN clause for a non-empty department list', () => {
  const result = buildDeptInClause(['Sitogenetik', 'Diğer'], 'b.department');
  assert.equal(result.clause, 'AND b.department IN (?,?)');
  assert.deepEqual(result.params, ['Sitogenetik', 'Diğer']);
});

test('buildDeptInClause throws on an empty array — callers must short-circuit before calling', () => {
  assert.throws(() => buildDeptInClause([], 'b.department'), /non-empty/);
});
