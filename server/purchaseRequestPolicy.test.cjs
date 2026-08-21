'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertOwnPendingCepRequest, buildDepartmentPurchaseFilter } = require('./purchaseRequestPolicy.cjs');

const user = { username: 'lab.tech' };

test('allows a lab technician to manage their own pending CEP request', () => {
  assert.doesNotThrow(() => assertOwnPendingCepRequest({
    requestedBy: 'lab.tech',
    requestedFor: 'lab.tech',
    isCepDepoRequest: 1,
    status: 'TALEP_EDILDI'
  }, user));
});

test('rejects a request filed on behalf of the target technician because only the creator may mutate it', () => {
  assert.throws(() => assertOwnPendingCepRequest({
    requestedBy: 'admin',
    requestedFor: 'lab.tech',
    isCepDepoRequest: 1,
    status: 'TALEP_EDILDI'
  }, user), (error) => error.status === 403 && error.error === 'FORBIDDEN');
});

test('rejects another technician request', () => {
  assert.throws(() => assertOwnPendingCepRequest({
    requestedBy: 'other.tech',
    requestedFor: 'other.tech',
    isCepDepoRequest: 1,
    status: 'TALEP_EDILDI'
  }, user), (error) => error.status === 403 && error.error === 'FORBIDDEN');
});

test('rejects a regular purchase request', () => {
  assert.throws(() => assertOwnPendingCepRequest({
    requestedBy: 'lab.tech',
    requestedFor: null,
    isCepDepoRequest: 0,
    status: 'TALEP_EDILDI'
  }, user), (error) => error.status === 400 && error.error === 'NOT_CEP_REQUEST');
});

test('rejects a CEP request after it leaves the pending state', () => {
  assert.throws(() => assertOwnPendingCepRequest({
    requestedBy: 'lab.tech',
    requestedFor: 'lab.tech',
    isCepDepoRequest: 1,
    status: 'ONAYLANDI'
  }, user), (error) => error.status === 409 && error.error === 'INVALID_STATUS');
});

test('builds a department visibility filter for current and legacy requests', () => {
  const result = buildDepartmentPurchaseFilter(['Mikro', 'Biyokimya']);
  assert.match(result.clause, /p\.department IN \(\?,\?\)/);
  assert.match(result.clause, /JOIN user_departments/);
  assert.deepEqual(result.params, ['Mikro', 'Biyokimya', 'Mikro', 'Biyokimya']);
});

test('department visibility returns no rows for a user without a department', () => {
  assert.deepEqual(buildDepartmentPurchaseFilter([]), { clause: '1 = 0', params: [] });
});
