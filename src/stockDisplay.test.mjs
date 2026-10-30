import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPendingTooltip,
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

test('pending tooltip lists each request with status and remaining quantity', () => {
  const text = formatPendingTooltip([
    { talepNo: '260906-231812', status: 'SIPARIS_VERILDI', orderedQty: 5, receivedQty: 0, pendingQty: 5 },
    { talepNo: '260907-105813', status: 'KISMI_TESLIM', orderedQty: 3, receivedQty: 1, pendingQty: 2 },
  ]);
  assert.match(text, /^Bekleyen talepler:\n260906-231812 · Sipariş verildi · 5 bekliyor/);
  assert.match(text, /260907-105813 · Kısmen geldi · 2 bekliyor \(3'den 1 geldi\)/);
  assert.equal(formatPendingTooltip([]), '');
});
