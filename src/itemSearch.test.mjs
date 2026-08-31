import test from 'node:test';
import assert from 'node:assert/strict';

import { matchesItemSearch } from './itemSearch.mjs';

const item = {
  name: 'Örnek Tüp',
  code: 'TUP-01',
  catalogNo: 'CAT-GLASS',
  barcodes: ['8690000000001', '8690000000002']
};

test('finds a product by any registered barcode', () => {
  assert.equal(matchesItemSearch(item, '8690000000002'), true);
});

test('finds a product when a full GS1 scan contains its registered GTIN', () => {
  const gs1Item = { ...item, barcodes: ['04053228004011'] };
  assert.equal(matchesItemSearch(gs1Item, ']d201040532280040111726123110LOT-42'), true);
});

test('accepts barcode mapping objects used by the enrollment screen', () => {
  assert.equal(matchesItemSearch(item, 'PLASTIC-02', [
    { id: 'mapping-1', barcode: 'GLASS-01' },
    { id: 'mapping-2', barcode: 'PLASTIC-02' }
  ]), true);
});

test('keeps name, item-code, and catalog-number search behavior', () => {
  assert.equal(matchesItemSearch(item, 'örnek'), true);
  assert.equal(matchesItemSearch(item, 'tup-01'), true);
  assert.equal(matchesItemSearch(item, 'cat-glass'), true);
  assert.equal(matchesItemSearch(item, 'not-registered'), false);
});
