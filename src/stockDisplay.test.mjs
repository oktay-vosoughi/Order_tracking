import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCepDepoDisplay,
  getStockDisplayTarget,
  isBelowStockTarget
} from './stockDisplay.mjs';

test('uses ideal stock as the stock ratio target when present', () => {
  assert.equal(getStockDisplayTarget({ minStock: 6, ideal_stock: '1.00' }), 1);
});

test('falls back to min stock when ideal stock is not set', () => {
  assert.equal(getStockDisplayTarget({ minStock: 6, ideal_stock: null }), 6);
});

test('uses ideal stock threshold for low stock decisions', () => {
  assert.equal(isBelowStockTarget({ totalStock: 10, minStock: 24, ideal_stock: 4 }), false);
  assert.equal(isBelowStockTarget({ totalStock: 3, minStock: 24, ideal_stock: 4 }), true);
});

test('displays CEP DEPO in sub-units when a conversion unit is configured', () => {
  const display = getCepDepoDisplay({
    unit: 'kutu',
    packageUnit: 'kutu',
    consumptionUnit: 'reax',
    unitsPerPackage: 25,
    consumptionUnitType: 'UNIT',
    cepDepoTotal: '0.72',
    cepDepoUnitTotal: '18.00'
  });

  assert.deepEqual(display, {
    quantity: 18,
    unit: 'reax',
    hasSubUnit: true
  });
});
