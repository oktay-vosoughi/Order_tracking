'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertReturnLot, assertConsumableLot } = require('./stockPolicy.cjs');

test('return lot must exist and belong to the returned item', () => {
  assert.doesNotThrow(() => assertReturnLot({ itemId: 'ITEM-1' }, 'ITEM-1'));
  assert.throws(() => assertReturnLot(null, 'ITEM-1'), (e) => e.error === 'LOT_NOT_FOUND');
  assert.throws(() => assertReturnLot({ itemId: 'ITEM-2' }, 'ITEM-1'), (e) => e.error === 'LOT_NOT_FOUND');
});

test('only active or explicitly expired lots may be consumed manually', () => {
  assert.doesNotThrow(() => assertConsumableLot({ status: 'ACTIVE' }));
  assert.doesNotThrow(() => assertConsumableLot({ status: 'EXPIRED' }));
  assert.throws(() => assertConsumableLot({ status: 'QUARANTINE' }), (e) => e.error === 'LOT_NOT_CONSUMABLE');
});
