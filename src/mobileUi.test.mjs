import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getHiddenLotCount,
  getLotPreview,
  getPurchaseStatusFilterOptions,
  getVisibleTabOptions
} from './mobileUi.mjs';

test('builds the visible mobile navigation options from user capabilities', () => {
  const options = getVisibleTabOptions({
    canViewStock: true,
    canViewTalep: true,
    canViewDagit: true,
    isObserver: false,
    canManageUsers: true,
    hasCurrentUser: true,
    pendingRequestCount: 2,
    wasteCount: 3
  });

  assert.deepEqual(
    options.map((option) => option.value),
    [
      'stock',
      'requests',
      'distributions',
      'waste',
      'total_stock',
      'lot_inventory',
      'cep_depo',
      'users',
      'account'
    ]
  );
  assert.equal(options.find((option) => option.value === 'requests').label, 'Talepler (2)');
  assert.equal(options.find((option) => option.value === 'waste').label, 'Atık (3)');
});

test('builds purchase status filter options including approved and rejected states', () => {
  const options = getPurchaseStatusFilterOptions({
    pending: 4,
    approved: 3,
    ordered: 2,
    completed: 1,
    rejected: 5
  });

  assert.deepEqual(
    options.map((option) => option.value),
    ['', 'pending', 'approved', 'ordered', 'completed', 'rejected']
  );
  assert.equal(options.find((option) => option.value === 'approved').label, 'Onaylı (3)');
  assert.equal(options.find((option) => option.value === 'rejected').label, 'Reddedildi (5)');
});

test('limits lot previews for expanded mobile cards', () => {
  const lots = [
    { id: 'lot-1' },
    { id: 'lot-2' },
    { id: 'lot-3' },
    { id: 'lot-4' }
  ];

  assert.deepEqual(getLotPreview(lots, 2).map((lot) => lot.id), ['lot-1', 'lot-2']);
  assert.equal(getHiddenLotCount(lots, 2), 2);
  assert.equal(getHiddenLotCount(lots, 8), 0);
});
