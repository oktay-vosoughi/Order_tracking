import test from 'node:test';
import assert from 'node:assert/strict';
import { isReadOnlyAuditRole, READ_ONLY_AUDIT_ROLES } from './rolePolicy.mjs';

test('KALITE and KURUMSAL are the read-only audit roles', () => {
  assert.deepEqual([...READ_ONLY_AUDIT_ROLES].sort(), ['KALITE', 'KURUMSAL']);
  assert.equal(isReadOnlyAuditRole('KALITE'), true);
  assert.equal(isReadOnlyAuditRole('KURUMSAL'), true);
});

test('operational roles are not read-only audit roles', () => {
  for (const role of ['ADMIN', 'SATINAL', 'SATINAL_LOJISTIK', 'LAB_TECHNICIAN', 'OBSERVER']) {
    assert.equal(isReadOnlyAuditRole(role), false);
  }
});

