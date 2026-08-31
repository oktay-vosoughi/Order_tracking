import test from 'node:test';
import assert from 'node:assert/strict';

import { filterEnrollmentItems, findNextMissingItemId } from './barcodeEnrollment.mjs';

const items = [
  { id: 'a', name: 'Sample Tube', code: 'ST-1', catalogNo: 'CAT-A' },
  { id: 'b', name: 'Buffer', code: 'BF-1', catalogNo: 'CAT-B' },
  { id: 'c', name: 'Control', code: 'CT-1', catalogNo: 'CAT-C' }
];

test('missing-only view keeps the selected product visible after its first identifier', () => {
  const visible = filterEnrollmentItems({
    items,
    byItem: { a: [{ id: 'barcode-1', barcode: '8690000000001' }] },
    search: '',
    onlyMissing: true,
    selectedId: 'a'
  });

  assert.deepEqual(visible.map((item) => item.id), ['a', 'b', 'c']);
});

test('next action skips products that already have one or more identifiers', () => {
  const nextId = findNextMissingItemId({
    items,
    byItem: {
      a: [
        { id: 'barcode-1', barcode: '8690000000001' },
        { id: 'barcode-2', barcode: '8690000000002' }
      ],
      b: [{ id: 'barcode-3', barcode: 'CAT-B-PLASTIC' }]
    },
    search: '',
    currentId: 'a'
  });

  assert.equal(nextId, 'c');
});

test('next action respects catalog-number search', () => {
  const nextId = findNextMissingItemId({
    items,
    byItem: {},
    search: 'CAT-B',
    currentId: 'a'
  });

  assert.equal(nextId, 'b');
});

test('enrollment search finds the product by any mapped barcode', () => {
  const visible = filterEnrollmentItems({
    items,
    byItem: {
      b: [
        { id: 'barcode-1', barcode: '8690000000001' },
        { id: 'barcode-2', barcode: '8690000000002' }
      ]
    },
    search: '8690000000002',
    onlyMissing: false,
    selectedId: null
  });

  assert.deepEqual(visible.map((item) => item.id), ['b']);
});
