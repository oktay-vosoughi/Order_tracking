'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertOwnPendingCepRequest } = require('./purchaseRequestPolicy.cjs');

const user = { username: 'lab.tech' };

test('allows a lab technician to manage their own pending CEP request', () => {
  assert.doesNotThrow(() => assertOwnPendingCepRequest({
    requestedBy: 'lab.tech',
    requestedFor: 'lab.tech',
    isCepDepoRequest: 1,
    status: 'TALEP_EDILDI'
  }, user));
});

test('allows the target technician to manage a pending request filed on their behalf', () => {
  assert.doesNotThrow(() => assertOwnPendingCepRequest({
    requestedBy: 'admin',
    requestedFor: 'lab.tech',
    isCepDepoRequest: 1,
    status: 'TALEP_EDILDI'
  }, user));
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
