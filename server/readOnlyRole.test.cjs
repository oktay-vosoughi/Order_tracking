const test = require('node:test');
const assert = require('node:assert/strict');
const { isReadOnlyAuditRole, isReadOnlyWriteBlocked } = require('./readOnlyRole.cjs');

test('KALITE and KURUMSAL are read-only while operational roles are not', () => {
  assert.equal(isReadOnlyAuditRole('KALITE'), true);
  assert.equal(isReadOnlyAuditRole('KURUMSAL'), true);
  assert.equal(isReadOnlyAuditRole('ADMIN'), false);
  assert.equal(isReadOnlyAuditRole('SATINAL'), false);
});

test('read-only audit roles may read but may not mutate operational endpoints', () => {
  for (const role of ['KALITE', 'KURUMSAL']) {
    assert.equal(isReadOnlyWriteBlocked({ role, method: 'GET', path: '/api/purchases' }), false);
    assert.equal(isReadOnlyWriteBlocked({ role, method: 'POST', path: '/api/purchases' }), true);
    assert.equal(isReadOnlyWriteBlocked({ role, method: 'PATCH', path: '/api/receipts/r1' }), true);
    assert.equal(isReadOnlyWriteBlocked({ role, method: 'DELETE', path: '/api/purchases/p1' }), true);
  }
});

test('read-only users may still change their own password', () => {
  assert.equal(isReadOnlyWriteBlocked({
    role: 'KURUMSAL',
    method: 'POST',
    path: '/api/account/change-password'
  }), false);
});

