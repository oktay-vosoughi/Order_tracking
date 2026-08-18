'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertApprovableEbysBatch, resolveEbysExportBatchId } = require('./ebysBatchPolicy.cjs');

test('approves only when every EBYS batch line is pending', () => {
  assert.doesNotThrow(() => assertApprovableEbysBatch([
    { status: 'TALEP_EDILDI' },
    { status: 'TALEP_EDILDI' }
  ]));
  assert.throws(
    () => assertApprovableEbysBatch([{ status: 'TALEP_EDILDI' }, { status: 'SIPARIS_VERILDI' }]),
    (error) => error.error === 'INVALID_BATCH_STATUS'
  );
});

test('reuses one existing export batch and rejects mixed batches', () => {
  assert.deepEqual(
    resolveEbysExportBatchId([{ ebysBatchId: 'B-1' }, { ebysBatchId: 'B-1' }], () => 'NEW'),
    { batchId: 'B-1', isNew: false }
  );
  assert.throws(
    () => resolveEbysExportBatchId([{ ebysBatchId: 'B-1' }, { ebysBatchId: null }], () => 'NEW'),
    (error) => error.error === 'MIXED_BATCHES'
  );
});

test('creates an internal website batch for unbatched request lines', () => {
  assert.deepEqual(
    resolveEbysExportBatchId([{ ebysBatchId: null }, { ebysBatchId: null }], () => 'EBYS-WEB-1'),
    { batchId: 'EBYS-WEB-1', isNew: true }
  );
});
