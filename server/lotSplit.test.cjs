const test = require('node:test');
const assert = require('node:assert/strict');

const { validateLotSplit } = require('./lotSplit.cjs');

const activeLot = { status: 'ACTIVE', currentQuantity: 10 };

const hasCode = (code) => (err) => err instanceof Error && err.code === code;

test('splits an active lot into normalized rows when quantities sum exactly', () => {
  const result = validateLotSplit(activeLot, [
    { lotNumber: ' LOT-X1 ', expiryDate: '2026-08-01', quantity: '4' },
    { lotNumber: 'LOT-X2', expiryDate: '2026-09-01', quantity: 3 },
    { lotNumber: 'LOT-X3', expiryDate: '', quantity: 3 }
  ]);

  assert.deepEqual(result, [
    { lotNumber: 'LOT-X1', expiryDate: '2026-08-01', quantity: 4 },
    { lotNumber: 'LOT-X2', expiryDate: '2026-09-01', quantity: 3 },
    { lotNumber: 'LOT-X3', expiryDate: null, quantity: 3 }
  ]);
});

test('rejects a lot that is not ACTIVE', () => {
  assert.throws(
    () => validateLotSplit({ status: 'DEPLETED', currentQuantity: 10 }, [
      { lotNumber: 'A', quantity: 5 },
      { lotNumber: 'B', quantity: 5 }
    ]),
    hasCode('LOT_NOT_ACTIVE')
  );
});

test('rejects a lot with zero current quantity', () => {
  assert.throws(
    () => validateLotSplit({ status: 'ACTIVE', currentQuantity: 0 }, [
      { lotNumber: 'A', quantity: 5 },
      { lotNumber: 'B', quantity: 5 }
    ]),
    hasCode('LOT_NOT_ACTIVE')
  );
});

test('rejects fewer than 2 splits', () => {
  assert.throws(
    () => validateLotSplit(activeLot, [{ lotNumber: 'A', quantity: 10 }]),
    hasCode('INVALID_INPUT')
  );
});

test('rejects a split with an empty lot number', () => {
  assert.throws(
    () => validateLotSplit(activeLot, [
      { lotNumber: '  ', quantity: 5 },
      { lotNumber: 'B', quantity: 5 }
    ]),
    hasCode('INVALID_INPUT')
  );
});

test('rejects a non-integer or non-positive quantity', () => {
  assert.throws(
    () => validateLotSplit(activeLot, [
      { lotNumber: 'A', quantity: 4.5 },
      { lotNumber: 'B', quantity: 5.5 }
    ]),
    hasCode('INVALID_INPUT')
  );
  assert.throws(
    () => validateLotSplit(activeLot, [
      { lotNumber: 'A', quantity: 0 },
      { lotNumber: 'B', quantity: 10 }
    ]),
    hasCode('INVALID_INPUT')
  );
});

test('rejects quantities that sum to less than currentQuantity', () => {
  assert.throws(
    () => validateLotSplit(activeLot, [
      { lotNumber: 'A', quantity: 4 },
      { lotNumber: 'B', quantity: 3 }
    ]),
    hasCode('SPLIT_QUANTITY_MISMATCH')
  );
});

test('rejects quantities that sum to more than currentQuantity', () => {
  assert.throws(
    () => validateLotSplit(activeLot, [
      { lotNumber: 'A', quantity: 4 },
      { lotNumber: 'B', quantity: 7 }
    ]),
    hasCode('SPLIT_QUANTITY_MISMATCH')
  );
});

test('rejects duplicate lot numbers within the same request', () => {
  assert.throws(
    () => validateLotSplit(activeLot, [
      { lotNumber: 'LOT-DUP', quantity: 5 },
      { lotNumber: 'LOT-DUP', quantity: 5 }
    ]),
    hasCode('INVALID_INPUT')
  );
});
